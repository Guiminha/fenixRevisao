import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import https from "node:https";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// ====================================================================
// Serviço de integração com a API Nipponflex (cadastro de D.I.s).
//
// Fluxo (uma vez ao dia às 02:30 Brasília, ou manual pelo botão no admin):
//  1. Autentica na API (get-token, token MD5 diário).
//  2. Baixa get-cadastro (timeout 15min + 5 retries: 30/60/120/240/500s).
//  3. Salva arquivo bruto  -> storage nipponflex/brutos/NF-DIS-<data>.json
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
  ts: string;        // HH:MM:SS (Brasília)
  nivel: "info" | "ok" | "erro" | "aviso";
  msg: string;
}

export interface NfRelatorio {
  data: string;
  inicio: string;
  fim: string;
  duracaoSeg: number;
  status: "ok" | "erro";
  etapas: { etapa: string; ok: boolean; duracaoSeg: number; detalhe?: string }[];
  baixados: number;
  filtrados: number;
  novosCadastrados: number;
  situacoesAlteradas: { codigo: string; nome: string; anterior: string; nova: string }[];
  erros: string[];
}

export interface NfEstado {
  status: "ok" | "erro" | "em_andamento";
  ultimaSincronizacao: string | null;
  ultimoArquivoBruto: string | null;
  ultimoArquivoFiltrado: string | null;
  ultimoRelatorio: string | null;
  baixados: number;
  filtrados: number;
  novosCadastrados: number;
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
  erro: null,
  proximaSincronizacao: null,
  dataUltimaRodada: null
};
let logsAtual: NfLogEntry[] = [];
let syncInProgress = false;
let supabase: SupabaseClient | null = null;

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
        res.on("end", () => resolve({ status: res.statusCode || 0, text: Buffer.concat(chunks).toString("utf8") }));
        res.on("error", (e) => reject(e));
      }
    );
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
  logsAtual.push({ ts: horaBrasilia(), nivel, msg });
  if (logsAtual.length > MAX_LOGS) logsAtual = logsAtual.slice(-MAX_LOGS);
  console.log(`[Nipponflex][${horaBrasilia()}] ${msg}`);
}

export function getNfLogs(): NfLogEntry[] {
  return [...logsAtual];
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
async function baixarCadastro(token: string, rel: NfRelatorio): Promise<string> {
  const baseUrl = process.env.NIPPONFLEX_BASE_URL || "";
  const t0 = Date.now();
  const delays = [30_000, 60_000, 120_000, 240_000, 500_000]; // 5 tentativas
  let ultimoErro = "";

  addLog("info", "Baixando dados cadastrais (get-cadastro)... isso pode levar vários minutos.");

  for (let tentativa = 0; tentativa <= 5; tentativa++) {
    const inicioTentativa = Date.now();
    const rotulo = tentativa === 0 ? "Download" : `Nova tentativa (${tentativa}/5)`;
    addLog("info", `${rotulo}: chamando a API Nipponflex...`);
    try {
      const { status, text } = await requestNipponflex(`${baseUrl}/api/rede/get-cadastro`, {
        method: "GET",
        headers: { "co-token": token },
        timeoutMs: 900_000 // 15 minutos
      });
      if (status !== 200) throw new Error(`HTTP ${status}`);
      if (!text || text.trim().length === 0) throw new Error("Resposta vazia");
      addLog("ok", `Download concluído: ${text.length} bytes recebidos em ${Math.round((Date.now() - t0) / 1000)}s.`);
      rel.etapas.push({ etapa: tentativa === 0 ? "download" : `download (retry ${tentativa})`, ok: true, duracaoSeg: Math.round((Date.now() - t0) / 1000) });
      return text;
    } catch (e: any) {
      const ehTimeout = e?.message === "timeout";
      ultimoErro = ehTimeout ? "Timeout ao baixar dados (15 min excedidos)" : e.message;
      addLog("erro", `${rotulo} falhou: ${ultimoErro}.`);
      if (tentativa < 5) {
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
    dados = Array.isArray(json?.dadoscadastrais) ? json.dadoscadastrais : [];
  } catch (e) {
    throw new Error(`Falha ao interpretar JSON da API: ${e instanceof Error ? e.message : e}`);
  }

  const resultado: { codigo: string; nome: string; situacao: string }[] = [];
  for (const item of dados) {
    const codigo = String(item?.codcli ?? "").trim();
    if (!codigo) continue;
    const nome = numeroDoNome(item?.nomtit ?? "");
    const situacao = String(item?.sitpen ?? "").trim().toUpperCase() || "I";
    resultado.push({ codigo, nome, situacao });
  }
  return resultado;
}

// ------------------------------------------------------------------
// Sincronização com o Supabase (tabela dis_fenix)
// ------------------------------------------------------------------
async function sincronizarBanco(filtrados: { codigo: string; nome: string; situacao: string }[]): Promise<{ novos: string[]; alterados: { codigo: string; nome: string; anterior: string; nova: string }[] }> {
  const client = supabaseClient();
  const novos: string[] = [];
  const alterados: { codigo: string; nome: string; anterior: string; nova: string }[] = [];

  addLog("info", "Lendo D.I.s já cadastrados no banco (dis_fenix)...");
  const { data: existentes, error: errExist } = await client.from("dis_fenix").select("codigo, situacao").range(0, 9999);
  if (errExist) throw new Error(`Falha ao ler dis_fenix: ${errExist.message}`);
  const mapaExistente = new Map<string, string>();
  for (const e of existentes || []) mapaExistente.set(e.codigo, e.situacao);

  const linhas = filtrados.map((f) => ({ codigo: f.codigo, nome: f.nome, situacao: f.situacao }));

  for (const l of linhas) {
    if (!mapaExistente.has(l.codigo)) {
      novos.push(l.codigo);
    } else {
      const anterior = mapaExistente.get(l.codigo);
      if (anterior !== l.situacao) {
        alterados.push({ codigo: l.codigo, nome: l.nome, anterior: anterior || "", nova: l.situacao });
      }
    }
  }

  addLog("info", `Gravando ${linhas.length} D.I.s no banco (em lotes de ${TAMANHO_LOTE_SYNC})...`);
  for (let i = 0; i < linhas.length; i += TAMANHO_LOTE_SYNC) {
    const lote = linhas.slice(i, i + TAMANHO_LOTE_SYNC);
    const { error } = await client.from("dis_fenix").upsert(lote, { onConflict: "codigo" });
    if (error) throw new Error(`Falha no upsert de dis_fenix (lote ${i}): ${error.message}`);
  }

  return { novos, alterados };
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
    const { data: logs } = await client.from("config").select("value").eq("key", "nipponflexLogs").maybeSingle();
    if (Array.isArray(logs?.value)) logsAtual = logs.value;
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

    // 2. Download
    const rawText = await baixarCadastro(token, rel);
    const baixados = rawText.length;
    rel.baixados = baixados;
    estado.baixados = baixados;
    await persistirEstado();

    // 3. Arquivo bruto no storage
    const nomeBruto = `NF-DIS-${rel.data}.json`;
    addLog("info", "Salvando arquivo bruto no Supabase Storage...");
    await uploadArquivo("brutos", nomeBruto, rawText);
    rel.etapas.push({ etapa: "arquivo_bruto", ok: true, duracaoSeg: 0, detalhe: nomeBruto });
    estado.ultimoArquivoBruto = nomeBruto;
    addLog("ok", `Arquivo bruto salvo: ${nomeBruto} (${(baixados / 1024).toFixed(1)} KB).`);
    await persistirEstado();

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
    const { novos, alterados } = await sincronizarBanco(filtrados);
    rel.novosCadastrados = novos.length;
    rel.situacoesAlteradas = alterados;
    estado.novosCadastrados = novos.length;
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
    rel.duracaoSeg = 0;

    estado.status = "erro";
    estado.erro = e.message || String(e);
    estado.ultimaSincronizacao = null;
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
  if (busca) {
    query = query.or(`nome.ilike.%${busca}%,codigo.ilike.%${busca}%`);
  }
  if (situacao && situacao !== "todos") {
    query = query.eq("situacao", situacao);
  }
  const { data, count, error } = await query.order("nome", { ascending: true }).range(from, to);
  if (error) return { itens: [], total: 0, pagina, totalPaginas: 0 };

  const totalPaginas = Math.ceil((count || 0) / porPagina);
  return { itens: data || [], total: count || 0, pagina, totalPaginas };
}