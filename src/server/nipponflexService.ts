import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import https from "node:https";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { recordMetrics, reportSystemError } from './metricsService.js';
import { safeDISearch } from './security.js';

// ====================================================================
// Serviço de integração com a API Nipponflex (cadastro de D.I.s).
//
// Fluxo (uma vez ao dia às 02:30 Brasília, ou manual pelo botão no admin):
//  1. Autentica na API (get-token, token MD5 diário).
//  2. Consulta get-cadastro com datbas (15min, até 2 retries).
//  3. Descarta os campos não usados pelo site; não salva o cadastro bruto.
//  4. Filtra (nome, código, situação) -> storage nipponflex/filtrados/DIS-FENIX-<data>.json
//  5. Sincroniza com a tabela dis_fenix no Supabase (novos + mudança de situação).
//  6. Gera relatório do dia -> storage nipponflex/relatorios/RELATORIO-<data>.json
//  7. Atualiza estado + LOGS (config) para o card do admin, em tempo real.
//
// Segurança: credenciais via env (NIPPONFLEX_*), nunca em logs/código.
// ====================================================================

const BUCKET = "armazenamento";
const FOLDER = "nipponflex";
const RETENCAO_DIAS = 30;
const TAMANHO_LOTE_SYNC = 1000;
const MAX_LOGS = 500;

// A API Nipponflex tem um certificado TLS com cadeia incompleta (falha ao
// verificar o certificado raiz no Node). A conexão é HTTPS legítima (mesma
// que o Postman/curl aceita), então usamos um Agent que não rejeita o
// certificado APENAS para as chamadas a essa API externa.
const nipponflexAgent = new https.Agent({ rejectUnauthorized: false });

export interface NfLogEntry {
  id?: string;
  ts: string;        // DD/MM/AAAA HH:MM:SS (Brasília)
  nivel: "info" | "ok" | "erro" | "aviso";
  msg: string;
}

export interface NfRelatorio {
  data: string;
  modo?: "completa" | "incremental";
  dataBase?: string | null;
  removidos?: number;
  inicio: string;
  fim: string;
  duracaoSeg: number;
  status: "ok" | "erro";
  etapas: { etapa: string; ok: boolean; duracaoSeg: number; detalhe?: string }[];
  baixados: number;
  filtrados: number;
  novosCadastrados: number;
  // Detalhes completos dos D.I.s novos cadastrados nesta rodada (código + nome + situação)
  novosDetalhes: { codigo: string; nome: string; situacao: string }[];
  situacoesAlteradas: { codigo: string; nome: string; anterior: string; nova: string }[];
  erros: string[];
}

export interface NfEstado {
  relatorioVersao?: number;
  modoSincronizacao?: "completa" | "incremental";
  dataBaseConsulta?: string | null;
  removidos?: number;
  status: "ok" | "erro" | "em_andamento";
  ultimaSincronizacao: string | null;
  ultimoArquivoBruto: string | null;
  ultimoArquivoFiltrado: string | null;
  ultimoRelatorio: string | null;
  baixados: number;
  filtrados: number;
  novosCadastrados: number;
  // Detalhes completos dos D.I.s novos (persiste entre restarts via config)
  novosDetalhes?: { codigo: string; nome: string; situacao: string }[];
  situacoesAlteradas?: { codigo: string; nome: string; anterior: string; nova: string }[];
  erro: string | null;
  proximaSincronizacao: string | null;
  dataUltimaRodada: string | null;
}

// Estado do agendador (em memória + persistido para sobreviver a restart)
let estado: NfEstado = {
  status: "ok",
  ultimaSincronizacao: null,
  ultimoArquivoBruto: null,
  ultimoArquivoFiltrado: null,
  ultimoRelatorio: null,
  baixados: 0,
  filtrados: 0,
  novosCadastrados: 0,
  novosDetalhes: [],
  situacoesAlteradas: [],
  erro: null,
  proximaSincronizacao: null,
  dataUltimaRodada: null
};
let logsAtual: NfLogEntry[] = [];
let syncInProgress = false;
let supabase: SupabaseClient | null = null;
let checkpoint: string | null = null;

function supabaseClient(): SupabaseClient {
  if (supabase) return supabase;
  const url = process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return supabase;
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
export function dataBrasiliaISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function dataArquivo(): string {
  return dataBrasiliaISO();
}
function agoraISO(): string {
  return new Date().toISOString();
}
function horaBrasilia(): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date());
}
function md5(s: string): string {
  return crypto.createHash("md5").update(s, "utf8").digest("hex");
}
async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
function numeroDoNome(nome: string): string {
  return (nome || "").trim();
}

// ------------------------------------------------------------------
// Requisição HTTPS à API Nipponflex (usa https.request com Agent que
// ignora a verificação do certificado — a API tem cadeia TLS incompleta,
// mas a conexão é HTTPS legítima, igual a do Postman/curl).
// ------------------------------------------------------------------
function requestNipponflex(url: string, opts: { method: string; headers?: Record<string, string>; body?: string; timeoutMs: number }): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    let deadline: ReturnType<typeof setTimeout>;
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: opts.method,
        headers: opts.headers || {},
        agent: nipponflexAgent,
        timeout: opts.timeoutMs
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(Buffer.from(c)));
        res.on("end", () => { clearTimeout(deadline); resolve({ status: res.statusCode || 0, text: Buffer.concat(chunks).toString("utf8") }); });
        res.on("error", (e) => reject(e));
        res.on("aborted", () => reject(new Error("Resposta interrompida pela API Nipponflex")));
      }
    );
    deadline = setTimeout(() => req.destroy(new Error("timeout")), opts.timeoutMs);
    req.on("close", () => clearTimeout(deadline));
    req.on("timeout", () => { req.destroy(new Error("timeout")); });
    req.on("error", (e) => reject(e));
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

// ------------------------------------------------------------------
// Logs em tempo real
// ------------------------------------------------------------------
function addLog(nivel: NfLogEntry["nivel"], msg: string): void {
  const agora = new Date();
  const ts = agora.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", hour12: false }).replace(",", "");
  logsAtual.push({ id: crypto.randomUUID(), ts, nivel, msg });
  if (logsAtual.length > MAX_LOGS) logsAtual = logsAtual.slice(-MAX_LOGS);
  console.log(`[Nipponflex][${ts}] ${msg}`);
}

// Registros antigos guardavam apenas a hora. A data do início da rodada permite
// recuperar o dia sem confundir uma falha recente com a última sync bem-sucedida.
export function normalizarUltimosNfLogs(logs: NfLogEntry[]): NfLogEntry[] {
  let inicio = -1;
  for (let i = 0; i < logs.length; i++) {
    if (/^Iniciando sincronização com a API Nipponflex \(\d{4}-\d{2}-\d{2}\)/.test(logs[i]?.msg)) inicio = i;
  }
  const ultimos = logs.slice(Math.max(0, inicio));
  const dataInicial = ultimos[0]?.msg.match(/\((\d{4}-\d{2}-\d{2})\)/)?.[1];
  let dia = dataInicial ? new Date(`${dataInicial}T12:00:00Z`) : null;
  let horaAnterior = "";
  return ultimos.map(log => {
    if (!dia || !/^\d{2}:\d{2}:\d{2}$/.test(log.ts)) return { ...log };
    if (horaAnterior && log.ts < horaAnterior) dia.setUTCDate(dia.getUTCDate() + 1);
    horaAnterior = log.ts;
    return { ...log, ts: `${dia.toLocaleDateString("pt-BR", { timeZone: "UTC" })} ${log.ts}` };
  });
}

export function getNfLogs(): NfLogEntry[] {
  return normalizarUltimosNfLogs(logsAtual);
}

// ------------------------------------------------------------------
// Autenticação na API (get-token)
// ------------------------------------------------------------------
async function obterToken(rel: NfRelatorio): Promise<string> {
  const baseUrl = process.env.NIPPONFLEX_BASE_URL || "";
  const codigo = process.env.NIPPONFLEX_CODIGO || "";
  const senhaMd5 = process.env.NIPPONFLEX_SENHA_MD5 || "";
  const data = dataBrasiliaISO();
  const tokenEntrada = md5(`${data}-${codigo}-${senhaMd5}`);

  const body = new URLSearchParams({ codigo, senha: senhaMd5, token: tokenEntrada }).toString();

  const t0 = Date.now();
  addLog("info", "Conectando à API Nipponflex (get-token)...");
  try {
    const { status, text } = await requestNipponflex(`${baseUrl}/api/login/get-token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      timeoutMs: 90_000
    });
    if (status !== 200) throw new Error(`HTTP ${status} no get-token`);
    const json = JSON.parse(text);
    const token = json?.content?.token;
    if (!token) throw new Error("Resposta do get-token sem token");
    addLog("ok", "Token obtido com sucesso.");
    rel.etapas.push({ etapa: "autenticacao", ok: true, duracaoSeg: Math.round((Date.now() - t0) / 1000) });
    return token;
  } catch (e: any) {
    addLog("erro", `Falha ao conectar à API Nipponflex (get-token): ${e.message}`);
    rel.etapas.push({ etapa: "autenticacao", ok: false, duracaoSeg: Math.round((Date.now() - t0) / 1000), detalhe: e.message });
    throw e;
  }
}

// ------------------------------------------------------------------
// Download get-cadastro com timeout longo + retries
// ------------------------------------------------------------------
export function dataBaseIncremental(ultima: string | null): string | null {
  if (!ultima || !Number.isFinite(Date.parse(ultima))) return null;
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ultima));
  const dia = new Date(`${iso}T12:00:00Z`);
  dia.setUTCDate(dia.getUTCDate() - 1);
  return dia.toLocaleDateString("pt-BR", { timeZone: "UTC" }).replaceAll("/", "-");
}

async function baixarCadastro(token: string, rel: NfRelatorio, dataBase: string | null): Promise<string> {
  const baseUrl = process.env.NIPPONFLEX_BASE_URL || "";
  const t0 = Date.now();
  const delays = [60_000, 120_000]; // no máximo duas novas tentativas
  let ultimoErro = "";
  let falhasLongas = 0;

  addLog("info", "Baixando dados cadastrais (get-cadastro)... isso pode levar vários minutos.");

  for (let tentativa = 0; tentativa <= 2; tentativa++) {
    const inicioTentativa = Date.now();
    const rotulo = tentativa === 0 ? "Download" : `Nova tentativa (${tentativa}/2)`;
    addLog("info", `${rotulo}: chamando a API Nipponflex...`);
    try {
      const url = new URL(`${baseUrl}/api/rede/get-cadastro`);
      if (dataBase) url.searchParams.set("datbas", dataBase);
      const { status, text } = await requestNipponflex(url.toString(), {
        method: "GET",
        headers: { "co-token": token },
        timeoutMs: 900_000 // 15 minutos
      });
      if (status !== 200) {
        const error = new Error(`HTTP ${status} na API Nipponflex`);
        Object.assign(error, { status });
        throw error;
      }
      if (!text || text.trim().length === 0) throw new Error("Resposta vazia");
      addLog("ok", `Download concluído: ${text.length} bytes recebidos em ${Math.round((Date.now() - t0) / 1000)}s.`);
      rel.etapas.push({ etapa: tentativa === 0 ? "download" : `download (retry ${tentativa})`, ok: true, duracaoSeg: Math.round((Date.now() - t0) / 1000) });
      return text;
    } catch (e: any) {
      const ehTimeout = e?.message === "timeout";
      ultimoErro = ehTimeout ? "Timeout ao baixar dados (15 min excedidos)" : e.message;
      const duracao = Math.round((Date.now() - inicioTentativa) / 1000);
      addLog("erro", `${rotulo} falhou após ${duracao}s: ${ultimoErro}.`);
      if ((e.status === 500 || ehTimeout) && duracao >= 540) falhasLongas++;
      if (falhasLongas >= 2 || (e.status >= 400 && e.status < 500 && e.status !== 429)) {
        addLog("aviso", "Consultas interrompidas para evitar repetir uma falha persistente. A base anterior e a data de referência serão preservadas.");
        break;
      }
      if (tentativa < 2) {
        const delay = delays[tentativa];
        addLog("aviso", `Aguardando ${Math.round(delay / 1000)}s antes da próxima tentativa...`);
        rel.etapas.push({
          etapa: `download (tentativa ${tentativa + 1} falhou)`,
          ok: false,
          duracaoSeg: Math.round((Date.now() - inicioTentativa) / 1000),
          detalhe: ultimoErro
        });
        await sleep(delay);
      }
    }
  }
  addLog("erro", `Download falhou após todas as tentativas: ${ultimoErro}`);
  rel.etapas.push({ etapa: "download", ok: false, duracaoSeg: Math.round((Date.now() - t0) / 1000), detalhe: ultimoErro });
  throw new Error(ultimoErro || "Falha no download do get-cadastro");
}

// ------------------------------------------------------------------
// Upload para o Supabase Storage
// ------------------------------------------------------------------
async function uploadArquivo(pasta: string, nomeArquivo: string, conteudo: string | Buffer): Promise<void> {
  const buf = Buffer.isBuffer(conteudo) ? conteudo : Buffer.from(conteudo, "utf8");
  const ext = nomeArquivo.endsWith(".json") ? "application/json" : "text/plain";
  const { error } = await supabaseClient().storage.from(BUCKET).upload(`${FOLDER}/${pasta}/${nomeArquivo}`, buf, {
    contentType: ext,
    upsert: true
  });
  if (error) throw new Error(`Falha ao salvar ${nomeArquivo} no storage: ${error.message}`);
}

// ------------------------------------------------------------------
// Filtro: extrai nome, código e situação
// ------------------------------------------------------------------
function filtrarDados(rawText: string): { codigo: string; nome: string; situacao: string }[] {
  let dados: any[];
  try {
    const json = JSON.parse(rawText);
    if (!Array.isArray(json?.dadoscadastrais)) throw new Error('Resposta sem a lista de dados cadastrais.');
    dados = json.dadoscadastrais;
  } catch (e) {
    throw new Error(`Falha ao interpretar JSON da API: ${e instanceof Error ? e.message : e}`);
  }

  const resultado: { codigo: string; nome: string; situacao: string }[] = [];
  for (const item of dados) {
    const codigo = String(item?.codcli ?? "").trim();
    if (!/^\d{4,6}$/.test(codigo)) throw new Error("A API retornou um código D.I. inválido; base anterior preservada.");
    const nome = numeroDoNome(String(item?.nomtit ?? ""));
    const situacao = String(item?.sitpen ?? "").trim().toUpperCase();
    if (!["A", "I", "P", "S", "D"].includes(situacao) || (situacao === "A" && !nome)) {
      throw new Error("A API retornou nome/situação inválidos; base anterior preservada.");
    }
    resultado.push({ codigo, nome, situacao });
  }
  return resultado;
}

// ------------------------------------------------------------------
// Sincronização com o Supabase (tabela dis_fenix)
// ------------------------------------------------------------------
async function sincronizarBanco(filtrados: { codigo: string; nome: string; situacao: string }[], rel: NfRelatorio): Promise<{ novos: { codigo: string; nome: string; situacao: string }[]; alterados: { codigo: string; nome: string; anterior: string; nova: string }[]; removidos: number }> {
  const client = supabaseClient();
  const existentes = [] as { codigo: string; nome: string; situacao: string }[];
  for (let offset = 0; ; ) {
    const { data, error } = await client.from("dis_fenix").select("codigo, nome, situacao").order("codigo").range(offset, offset + 499);
    if (error) throw new Error(`Falha ao ler dis_fenix: ${error.message}`);
    if (!data?.length) break;
    existentes.push(...data);
    offset += data.length;
  }
  // Backup completo dos registros usados pelo site antes de qualquer mutação.
  const backup = `BASE-ANTES-${rel.inicio.replace(/[:.]/g, "-")}.json`;
  await uploadArquivo("backups", backup, JSON.stringify(existentes));
  addLog("ok", "Backup da base de acesso salvo no Supabase antes da atualização.");
  const mapa = new Map(existentes.map(e => [String(e.codigo), e]));
  const recebidos = new Map(filtrados.map(e => [e.codigo, e]));
  if (recebidos.size !== filtrados.length) throw new Error("Resposta com códigos duplicados; atualização cancelada.");
  const ativos = filtrados.filter(e => e.situacao === "A");
  const novos = ativos.filter(e => !mapa.has(e.codigo) || mapa.get(e.codigo)?.situacao !== "A");
  const alterados = filtrados.filter(e => mapa.has(e.codigo) && mapa.get(e.codigo)?.situacao !== e.situacao)
    .map(e => ({ codigo: e.codigo, nome: e.nome, anterior: mapa.get(e.codigo)!.situacao, nova: e.situacao }));
  const remover = new Set(existentes.filter(e => e.situacao !== "A").map(e => String(e.codigo)));
  for (const e of filtrados) if (e.situacao !== "A" && mapa.has(e.codigo)) remover.add(e.codigo);
  // Um cadastro reativado não pode ser removido na limpeza da base legada.
  for (const e of ativos) remover.delete(e.codigo);
  addLog("info", `Atualizando ${ativos.length} ativo(s) recebido(s); removendo ${remover.size} registro(s) não ativo(s) da base de acesso.`);
  for (let i = 0; i < ativos.length; i += TAMANHO_LOTE_SYNC) {
    const lote = ativos.slice(i, i + TAMANHO_LOTE_SYNC);
    const { error } = await client.from("dis_fenix").upsert(lote, { onConflict: "codigo" });
    if (error) throw new Error(`Falha ao atualizar ativos: ${error.message}`);
  }
  const codigos = [...remover];
  for (let i = 0; i < codigos.length; i += 200) {
    const { error } = await client.from("dis_fenix").delete().in("codigo", codigos.slice(i, i + 200));
    if (error) throw new Error(`Falha ao retirar D.I.s sem acesso: ${error.message}`);
  }
  await recordMetrics([
    ...novos.map(e => ({ kind: "di_new" as const, entity_id: e.codigo, detail: { name: e.nome, previous: null, current: e.situacao } })),
    ...alterados.map(e => ({ kind: "di_status" as const, entity_id: e.codigo, detail: { name: e.nome, previous: e.anterior, current: e.nova } })),
  ]);
  return { novos, alterados, removidos: remover.size };
}

// ------------------------------------------------------------------
// Persistir estado + logs na config (para o card do admin)
// ------------------------------------------------------------------
async function persistirEstado(): Promise<void> {
  try {
    const client = supabaseClient();
    await client.from("config").upsert({ key: "nipponflexEstado", value: estado });
    await client.from("config").upsert({ key: "nipponflexLogs", value: logsAtual });
  } catch {
    // best-effort
  }
}

export async function carregarEstadoInicial(): Promise<void> {
  try {
    const client = supabaseClient();
    const { data } = await client.from("config").select("value").eq("key", "nipponflexEstado").maybeSingle();
    if (data?.value) estado = { ...estado, ...data.value };
    const { data: cursor } = await client.from("config").select("value").eq("key", "nipponflexCheckpoint").maybeSingle();
    if (typeof cursor?.value?.inicio === "string") checkpoint = cursor.value.inicio;
    else checkpoint = estado.ultimaSincronizacao;
    const { data: logs } = await client.from("config").select("value").eq("key", "nipponflexLogs").maybeSingle();
    if (Array.isArray(logs?.value)) logsAtual = normalizarUltimosNfLogs(logs.value);
  } catch {
    // usa o padrão em memória
  }

  // Recuperação de estado travado: num servidor recém-iniciado nenhuma sync está
  // rodando de verdade. Se o status persistido ficou "em_andamento" (ex.: o
  // processo caiu/foi reiniciado no meio do download), destrava para "ok" — senão
  // novas syncs ficariam bloqueadas para sempre e o polling de logs continuaria.
  if (estado.status === "em_andamento") {
    estado.status = "ok";
    estado.erro = null;
    try {
      await persistirEstado();
    } catch {
      // best-effort
    }
  }
}

export function getNfEstado(): NfEstado {
  return { ...estado };
}

// ------------------------------------------------------------------
// Limpeza de arquivos antigos (retenção 30 dias)
// ------------------------------------------------------------------
async function limparArquivosAntigos(): Promise<void> {
  const client = supabaseClient();
  try {
    const { data: lista, error } = await client.storage.from(BUCKET).list(`${FOLDER}/brutos`, { limit: 1000 });
    if (error) return;
    const corte = Date.now() - RETENCAO_DIAS * 24 * 60 * 60 * 1000;
    const antigos: string[] = [];
    for (const f of lista || []) {
      if (f.metadata?.lastModified) {
        const t = new Date(f.metadata.lastModified).getTime();
        if (t < corte) antigos.push(`${FOLDER}/brutos/${f.name}`);
      }
    }
    if (antigos.length > 0) {
      await client.storage.from(BUCKET).remove(antigos);
    }
  } catch {
    // best-effort
  }
}

// ------------------------------------------------------------------
// Sincronização completa (roda em background)
// ------------------------------------------------------------------
export async function executarSincronizacao(): Promise<{ success: boolean; relatorio?: NfRelatorio; erro?: string }> {
  if (syncInProgress) {
    addLog("aviso", "Sincronização já está em andamento.");
    return { success: false, erro: "Sincronização já em andamento." };
  }
  syncInProgress = true;
  logsAtual = [];

  const rel: NfRelatorio = {
    data: dataArquivo(),
    inicio: agoraISO(),
    fim: "",
    duracaoSeg: 0,
    status: "ok",
    etapas: [],
    baixados: 0,
    filtrados: 0,
    novosCadastrados: 0,
    novosDetalhes: [],
    situacoesAlteradas: [],
    erros: []
  };

  estado.status = "em_andamento";
  estado.erro = null;
  estado.proximaSincronizacao = null;
  addLog("info", `Iniciando sincronização com a API Nipponflex (${rel.data})...`);
  await persistirEstado();

  try {
    const tInicio = Date.now();

    // 1. Token
    const token = await obterToken(rel);
    await persistirEstado();

    // A referência só avança quando toda a rodada conclui. Nunca filtrar apenas
    // ativos na API: as saídas são necessárias para revogar acessos existentes.
    const dataBase = dataBaseIncremental(checkpoint);
    rel.modo = dataBase ? "incremental" : "completa";
    rel.dataBase = dataBase;
    estado.modoSincronizacao = rel.modo;
    estado.dataBaseConsulta = dataBase;
    addLog("info", dataBase ? `Consulta incremental: datbas=${dataBase}. Buscando novos cadastros e mudanças, inclusive situações não ativas.` : "Carga inicial completa: ainda não existe uma referência de sincronização.");
    const rawText = await baixarCadastro(token, rel, dataBase);
    const baixados = Buffer.byteLength(rawText, "utf8");
    rel.baixados = baixados;
    estado.baixados = baixados;
    await persistirEstado();

    // Os campos não usados pelo site não são copiados para o Storage.
    // 4. Filtrar
    addLog("info", "Filtrando dados (nome, código, situação)...");
    const filtrados = filtrarDados(rawText);
    rel.filtrados = filtrados.length;
    estado.filtrados = filtrados.length;
    addLog("ok", `${filtrados.length} D.I.s filtrados.`);
    await persistirEstado();

    // 5. Arquivo filtrado no storage
    const nomeFiltrado = `DIS-FENIX-${rel.data}.json`;
    addLog("info", "Salvando arquivo filtrado no Supabase Storage...");
    await uploadArquivo("filtrados", nomeFiltrado, JSON.stringify(filtrados));
    rel.etapas.push({ etapa: "arquivo_filtrado", ok: true, duracaoSeg: 0, detalhe: nomeFiltrado });
    estado.ultimoArquivoFiltrado = nomeFiltrado;
    addLog("ok", `Arquivo filtrado salvo: ${nomeFiltrado}.`);
    await persistirEstado();

    // 6. Sync banco
    addLog("info", "Sincronizando com o banco de dados (dis_fenix)...");
    const { novos, alterados, removidos } = await sincronizarBanco(filtrados, rel);
    rel.removidos = removidos;
    estado.removidos = removidos;
    rel.novosCadastrados = novos.length;
    rel.novosDetalhes = novos;
    rel.situacoesAlteradas = alterados;
    estado.novosCadastrados = novos.length;
    estado.novosDetalhes = novos;
    estado.situacoesAlteradas = alterados;
    estado.relatorioVersao = 2;
    addLog("ok", `${novos.length} novo(s) D.I.(s) cadastrado(s).`);
    if (alterados.length > 0) {
      addLog("info", `${alterados.length} D.I.(s) mudaram de situação.`);
    }
    await persistirEstado();

    // 7. Relatório no storage
    rel.fim = agoraISO();
    rel.duracaoSeg = Math.round((Date.now() - tInicio) / 1000);
    rel.status = "ok";
    const nomeRelatorio = `RELATORIO-${rel.data}.json`;
    addLog("info", "Gerando relatório do dia...");
    await uploadArquivo("relatorios", nomeRelatorio, JSON.stringify(rel, null, 2));
    estado.ultimoRelatorio = nomeRelatorio;
    addLog("ok", `Relatório salvo: ${nomeRelatorio}.`);

    const { error: checkpointError } = await supabaseClient().from("config").upsert({ key: "nipponflexCheckpoint", value: { inicio: rel.inicio, modo: rel.modo } });
    if (checkpointError) throw new Error(`Falha ao salvar referência: ${checkpointError.message}`);
    checkpoint = rel.inicio;
    // Estado final
    estado.status = "ok";
    estado.ultimaSincronizacao = agoraISO();
    estado.dataUltimaRodada = rel.data;
    addLog("ok", `Sincronização concluída com sucesso em ${rel.duracaoSeg}s.`);
    await persistirEstado();

    // Limpeza de antigos
    await limparArquivosAntigos();

    return { success: true, relatorio: rel };
  } catch (e: any) {
    rel.status = "erro";
    rel.erros.push(e.message || String(e));
    rel.fim = agoraISO();
    rel.duracaoSeg = Math.round((Date.now() - Date.parse(rel.inicio)) / 1000);

    estado.status = "erro";
    estado.erro = e.message || String(e);
    reportSystemError('Nipponflex', 'SYNC_FAILED', 'A sincronização não foi concluída. Consulte os Logs de Sincronização.');
    addLog("erro", `ERRO na sincronização: ${e.message || String(e)}`);
    await persistirEstado();

    // Salva relatório de erro
    try {
      const nomeRelatorio = `RELATORIO-${rel.data}.json`;
      await uploadArquivo("relatorios", nomeRelatorio, JSON.stringify(rel, null, 2));
    } catch {
      // best-effort
    }
    return { success: false, erro: e.message || String(e) };
  } finally {
    syncInProgress = false;
  }
}

// ------------------------------------------------------------------
// Verifica se deve rodar agora (02:30 Brasília) — chamado a cada minuto
// ------------------------------------------------------------------
export async function verificarAgendador(): Promise<void> {
  const agora = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date());
  if (agora !== "02:30") return;

  const hoje = dataArquivo();
  if (estado.dataUltimaRodada === hoje) return;

  if (syncInProgress) return;
  executarSincronizacao().catch(() => {});
}

// ------------------------------------------------------------------
// Métricas e listagem paginada (para o admin)
// ------------------------------------------------------------------
export async function obterMetricasDis(): Promise<{ total: number; porSituacao: Record<string, number> }> {
  const client = supabaseClient();
  const { count: total, error } = await client.from("dis_fenix").select("codigo", { count: "exact", head: true });
  if (error) return { total: 0, porSituacao: {} };

  const situacoes = ["A", "I", "P", "S", "D"];
  const porSituacao: Record<string, number> = {};
  for (const s of situacoes) {
    const { count } = await client.from("dis_fenix").select("codigo", { count: "exact", head: true }).eq("situacao", s);
    porSituacao[s] = count || 0;
  }

  const conhecido = Object.values(porSituacao).reduce((a, b) => a + b, 0);
  const outros = (total || 0) - conhecido;
  if (outros > 0) porSituacao["outros"] = outros;

  return { total: total || 0, porSituacao };
}

export async function obterDisPaginado(pagina: number, busca: string, situacao: string, porPagina = 50): Promise<{ itens: any[]; total: number; pagina: number; totalPaginas: number }> {
  const client = supabaseClient();
  const from = (pagina - 1) * porPagina;
  const to = from + porPagina - 1;

  let query = client.from("dis_fenix").select("codigo, nome, situacao, atualizado_em", { count: "exact" });
  const termo = safeDISearch(busca);
  if (busca.trim() && !termo) return { itens: [], total: 0, pagina, totalPaginas: 0 };
  if (termo) {
    query = query.or(`nome.ilike.%${termo}%,codigo.ilike.%${termo}%`);
  }
  if (situacao && situacao !== "todos") {
    query = query.eq("situacao", situacao);
  }
  const { data, count, error } = await query.order("nome", { ascending: true }).range(from, to);
  if (error) return { itens: [], total: 0, pagina, totalPaginas: 0 };

  const totalPaginas = Math.ceil((count || 0) / porPagina);
  return { itens: data || [], total: count || 0, pagina, totalPaginas };
}
