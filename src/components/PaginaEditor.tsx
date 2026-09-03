import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus, Trash2, ArrowUp, ArrowDown, Eye, EyeOff, Save, Upload, RefreshCw, X,
  FileText, Loader2, GripVertical, Copy, Monitor, Pencil, AlertTriangle, CheckCircle2, Grip
} from "lucide-react";
import { useStore } from "../store";
import { uploadFileWithProgress } from "../utils/uploadWithProgress";
import { PaginaBloco, PaginaBlocoCampos, PaginaBlocoTipo } from "../types";
import {
  PAGINA_TECNOLOGIAS_PADRAO, PAGINA_ELITE_PADRAO, PAGINA_BIOGRAFIA_PADRAO
} from "../paginasPadrao";
import PaginaBlocos from "./PaginaBlocos";

type ChavePagina = "paginaBiografia" | "paginaTecnologias" | "paginaElite";

const PAGINAS: { chave: ChavePagina; label: string; descricao: string; publico: string }[] = [
  { chave: "paginaBiografia", label: "Grupo Fênix", descricao: "Apresentação institucional, diferenciais, FAQ e chamada final.", publico: "Menu: Grupo Fênix" },
  { chave: "paginaTecnologias", label: "Tecnologias", descricao: "Banner, cabeçalhos e cards das tecnologias Nipponflex.", publico: "Menu: Tecnologias" },
  { chave: "paginaElite", label: "Elite Milionária", descricao: "Apresentação do programa Elite Milionária e chamada final.", publico: "Menu: Elite Milionária" }
];

const PADRAO_POR_CHAVE: Record<ChavePagina, PaginaBloco[]> = {
  paginaBiografia: PAGINA_BIOGRAFIA_PADRAO,
  paginaTecnologias: PAGINA_TECNOLOGIAS_PADRAO,
  paginaElite: PAGINA_ELITE_PADRAO
};

const TIPOS_BLOCO: { tipo: PaginaBlocoTipo; label: string; desc: string }[] = [
  { tipo: "banner", label: "Banner de topo", desc: "Texto com selo, título e marcadores" },
  { tipo: "hero_banner", label: "Banner com imagem", desc: "Imagem grande com título sobreposto" },
  { tipo: "hero_header", label: "Cabeçalho de seção", desc: "Ícone, rótulo, título e texto" },
  { tipo: "card_tecnologia", label: "Card (ícone + imagem)", desc: "Ícone, texto, imagem e destaque" },
  { tipo: "texto", label: "Texto", desc: "Rótulo, título e parágrafos" },
  { tipo: "imagem", label: "Imagem", desc: "Foto em destaque com legenda" },
  { tipo: "lista", label: "Lista com marcadores", desc: "Itens com ícone de verificação" },
  { tipo: "faq", label: "Perguntas & Respostas", desc: "Bloco de FAQ" },
  { tipo: "destaque", label: "Destaque dourado", desc: "Frase de impacto centralizada" },
  { tipo: "cta", label: "Chamada final", desc: "Botão de chamada para ação" }
];

const TIPO_LABEL: Record<PaginaBlocoTipo, string> = Object.fromEntries(
  TIPOS_BLOCO.map((t) => [t.tipo, t.label])
) as Record<PaginaBlocoTipo, string>;

// Quais campos cada tipo de bloco realmente usa no renderizador (PaginaBlocos).
const CAMPOS_POR_TIPO: Record<PaginaBlocoTipo, (keyof PaginaBlocoCampos | "faq")[]> = {
  banner: ["badge", "titulo", "tituloDestaque", "textos"],
  hero_banner: ["badge", "titulo", "tituloDestaque", "textos", "imagem", "imagemAlt"],
  hero_header: ["icone", "cor", "eyebrow", "titulo", "textos"],
  card_tecnologia: ["icone", "cor", "eyebrow", "titulo", "badge", "textos", "imagem", "imagemAlt", "destaqueTitulo", "destaqueTexto", "notaTexto"],
  texto: ["eyebrow", "titulo", "textos"],
  imagem: ["imagem", "imagemAlt", "legenda"],
  lista: ["eyebrow", "titulo", "itens"],
  faq: ["eyebrow", "titulo", "faq"],
  destaque: ["destaqueTitulo", "destaqueTexto"],
  cta: ["badge", "titulo", "textos", "botaoTexto", "notaTexto"]
};

const LABEL_CAMPO: Record<string, string> = {
  badge: "Selo (badge)",
  badgeImagem: "Imagem do selo",
  eyebrow: "Chamada (eyebrow)",
  titulo: "Título",
  tituloDestaque: "Destaque do título (gradiente)",
  textos: "Textos (um por linha)",
  destaqueTitulo: "Título do destaque",
  destaqueTexto: "Texto do destaque",
  imagem: "Imagem",
  imagemAlt: "Texto alternativo da imagem",
  legenda: "Legenda",
  botaoTexto: "Texto do botão",
  notaTexto: "Nota",
  itens: "Itens (um por linha)",
  faq: "Perguntas & Respostas",
  icone: "Ícone",
  cor: "Cor"
};

const ICONES_OPCOES: { v: string; r: string }[] = [
  { v: "flame", r: "Chama" },
  { v: "sparkles", r: "Brilho" },
  { v: "zap", r: "Raio" },
  { v: "activity", r: "Pulso" },
  { v: "waves", r: "Ondas" },
  { v: "atom", r: "Átomo" },
  { v: "award", r: "Troféu" },
  { v: "rocket", r: "Foguete" },
  { v: "shield", r: "Escudo" },
  { v: "moon", r: "Lua" },
  { v: "target", r: "Alvo" },
  { v: "crown", r: "Coroa" }
];

const CORES_OPCOES: { v: string; r: string }[] = [
  { v: "amber", r: "Dourado (âmbar)" },
  { v: "cyan", r: "Ciano (azul)" },
  { v: "rose", r: "Rosa (rose)" },
  { v: "indigo", r: "Índigo (azul-violeta)" },
  { v: "rosa", r: "Rosa Fênix" }
];

const NOVO_CAMPOS: Record<PaginaBlocoTipo, Record<string, unknown>> = {
  banner: { badge: "", titulo: "", tituloDestaque: "", textos: [""] },
  hero_banner: { badge: "", titulo: "", tituloDestaque: "", textos: [""], imagem: "", imagemAlt: "" },
  hero_header: { icone: "sparkles", cor: "amber", eyebrow: "", titulo: "", textos: [""] },
  card_tecnologia: { icone: "zap", cor: "amber", eyebrow: "", titulo: "", badge: "", textos: [""], imagem: "", imagemAlt: "", destaqueTitulo: "", destaqueTexto: "", notaTexto: "" },
  texto: { eyebrow: "", titulo: "", textos: [""] },
  imagem: { imagem: "", imagemAlt: "", legenda: "" },
  lista: { eyebrow: "", titulo: "", itens: [""] },
  faq: { eyebrow: "", titulo: "", faq: [] },
  destaque: { destaqueTitulo: "", destaqueTexto: "" },
  cta: { badge: "", titulo: "", textos: [""], botaoTexto: "", notaTexto: "" }
};

function novoBloco(tipo: PaginaBlocoTipo): PaginaBloco {
  return {
    id: `bloco-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tipo,
    ativo: true,
    ordem: 0,
    campos: JSON.parse(JSON.stringify(NOVO_CAMPOS[tipo]))
  };
}

function ordenados(blocos: PaginaBloco[]): PaginaBloco[] {
  return blocos.map((b, i) => ({ ...b, ordem: i }));
}

export default function PaginaEditor() {
  const publicData = useStore((s) => s.publicData);
  const token = useStore((s) => s.token);
  const fetchPublicData = useStore((s) => s.fetchPublicData);

  const [chave, setChave] = useState<ChavePagina>("paginaBiografia");
  const [blocos, setBlocos] = useState<PaginaBloco[]>([]);
  const [snapshot, setSnapshot] = useState("");
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [mostrarPreview, setMostrarPreview] = useState(true);
  const dragIdx = useRef<number | null>(null);

  const getAuthHeaders = () => {
    const t = token || localStorage.getItem("fenix_token");
    return t ? { Authorization: `Bearer ${t}` } : {};
  };

  const padrao = () => PADRAO_POR_CHAVE[chave];

  const fonteDoBanco = (publicData as any)?.[chave] as PaginaBloco[] | undefined;
  const salvoNoBanco = Array.isArray(fonteDoBanco) && fonteDoBanco.length > 0;

  // Carregar a página atual (do banco se houver, senão o padrão).
  useEffect(() => {
    const fonte = salvoNoBanco ? (fonteDoBanco as PaginaBloco[]) : padrao();
    const copia = JSON.parse(JSON.stringify(ordenados(fonte))) as PaginaBloco[];
    setBlocos(copia);
    setSnapshot(JSON.stringify(ordenados(copia)));
    setSelecionado(null);
    setMsg(null);
  }, [chave, fonteDoBanco]);

  const dirty = useMemo(() => {
    if (!snapshot) return false;
    return JSON.stringify(ordenados(blocos)) !== snapshot;
  }, [blocos, snapshot]);

  const setCampo = (nome: keyof PaginaBlocoCampos, valor: unknown) => {
    if (!selecionado) return;
    setBlocos((prev) =>
      prev.map((b) =>
        b.id === selecionado
          ? { ...b, campos: { ...b.campos, [nome]: valor } }
          : b
      )
    );
  };

  const editarCampos = (b: PaginaBloco): PaginaBlocoCampos => b.campos || {};

  const salvar = async (blocosParaSalvar?: PaginaBloco[]) => {
    setSalvando(true);
    setMsg(null);
    try {
      const alvo = ordenados(blocosParaSalvar || blocos);
      const res = await fetch("/api/admin/paginas", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ chave, blocos: alvo })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setBlocos(alvo);
        setSnapshot(JSON.stringify(ordenados(alvo)));
        setMsg({ tipo: "ok", texto: "Página salva e publicada no banco (Supabase). As alterações já aparecem no site." });
        await fetchPublicData();
      } else {
        setMsg({ tipo: "erro", texto: data.error || "Erro ao salvar a página." });
      }
    } catch (e) {
      setMsg({ tipo: "erro", texto: "Falha de conexão ao salvar." });
    } finally {
      setSalvando(false);
    }
  };

  const restaurarPadrao = async () => {
    if (!window.confirm("Restaurar o conteúdo padrão desta página? As alterações atuais serão sobrescritas e salvas no banco.")) return;
    const pad = JSON.parse(JSON.stringify(ordenados(padrao()))) as PaginaBloco[];
    setBlocos(pad);
    await salvar(pad);
  };

  const mover = (idx: number, dir: -1 | 1) => {
    setBlocos((prev) => {
      const alvo = idx + dir;
      if (alvo < 0 || alvo >= prev.length) return prev;
      const nova = [...prev];
      [nova[idx], nova[alvo]] = [nova[alvo], nova[idx]];
      return nova;
    });
  };

  const toggleAtivo = (idx: number) => {
    setBlocos((prev) => prev.map((b, i) => (i === idx ? { ...b, ativo: !b.ativo } : b)));
  };

  const duplicar = (idx: number) => {
    setBlocos((prev) => {
      const nova = [...prev];
      const copia = JSON.parse(JSON.stringify(nova[idx])) as PaginaBloco;
      copia.id = `bloco-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      nova.splice(idx + 1, 0, copia);
      return nova;
    });
  };

  const remover = (idx: number) => {
    const b = blocos[idx];
    if (selecionado === b.id) setSelecionado(null);
    setBlocos((prev) => prev.filter((_, i) => i !== idx));
  };

  const adicionarTipo = (tipo: PaginaBlocoTipo) => {
    const novo = novoBloco(tipo);
    setBlocos((prev) => [...prev, novo]);
    setSelecionado(novo.id);
    setMsg({ tipo: "ok", texto: `Bloco "${TIPO_LABEL[tipo]}" adicionado. Preencha os campos e clique em Salvar.` });
  };

  const uploadImagem = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setMsg({ tipo: "erro", texto: "Selecione uma imagem válida (PNG, JPG, WEBP)." });
      return;
    }
    setUploadingImg(true);
    setMsg(null);
    try {
      const res = await uploadFileWithProgress(file, "paginas", getAuthHeaders());
      if (res && res.success && (res.previewUrl || res.url)) {
        setCampo("imagem", res.previewUrl || res.url);
        setMsg({ tipo: "ok", texto: "Imagem enviada (pasta paginas/)." });
      } else {
        setMsg({ tipo: "erro", texto: res?.error || "Erro no upload da imagem." });
      }
    } catch (e) {
      setMsg({ tipo: "erro", texto: "Erro no upload da imagem." });
    } finally {
      setUploadingImg(false);
    }
  };

  const setFaq = (idx: number, campo: "q" | "a", valor: string) => {
    if (!selecionado) return;
    setBlocos((prev) =>
      prev.map((b) => {
        if (b.id !== selecionado) return b;
        const faq = Array.isArray(b.campos.faq) ? [...b.campos.faq] : [];
        faq[idx] = { q: faq[idx]?.q || "", a: faq[idx]?.a || "", ...faq[idx], [campo]: valor };
        return { ...b, campos: { ...b.campos, faq } };
      })
    );
  };
  const addFaq = () => {
    if (!selecionado) return;
    setBlocos((prev) =>
      prev.map((b) =>
        b.id === selecionado
          ? { ...b, campos: { ...b.campos, faq: [...(Array.isArray(b.campos.faq) ? b.campos.faq : []), { q: "", a: "" }] } }
          : b
      )
    );
  };
  const delFaq = (idx: number) => {
    if (!selecionado) return;
    setBlocos((prev) =>
      prev.map((b) =>
        b.id === selecionado
          ? { ...b, campos: { ...b.campos, faq: (Array.isArray(b.campos.faq) ? b.campos.faq : []).filter((_, i) => i !== idx) } }
          : b
      )
    );
  };

  const blocoEditado = blocos.find((b) => b.id === selecionado) || null;

  const renderCampo = (nome: string, campos: PaginaBlocoCampos) => {
    const valorTexto = String((campos as any)[nome] || "");
    if (nome === "imagem") {
      return (
        <div>
          <span className="text-[10px] font-bold text-[#8a96a3] uppercase tracking-wider">{LABEL_CAMPO.imagem}</span>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            {campos.imagem && (
              <img src={campos.imagem} alt="" className="w-28 h-20 object-cover rounded-xl border border-white/10" />
            )}
            <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-slate-200 hover:bg-white/10 transition-colors">
              <Upload className="w-3.5 h-3.5" />
              {uploadingImg ? "Enviando..." : (campos.imagem ? "Trocar imagem" : "Enviar imagem")}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploadingImg}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadImagem(f);
                  e.target.value = "";
                }}
              />
            </label>
            {campos.imagem && (
              <button onClick={() => setCampo("imagem", "")} className="p-2 rounded-lg bg-white/5 hover:bg-rose-500/20 text-slate-300 cursor-pointer" title="Remover imagem">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      );
    }
    if (nome === "icone") {
      return (
        <label className="block">
          <span className="text-[10px] font-bold text-[#8a96a3] uppercase tracking-wider">{LABEL_CAMPO.icone}</span>
          <select value={String(campos.icone || "sparkles")} onChange={(e) => setCampo("icone", e.target.value)} className="mt-1 w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white">
            {ICONES_OPCOES.map((o) => (
              <option key={o.v} value={o.v}>{o.r}</option>
            ))}
          </select>
        </label>
      );
    }
    if (nome === "cor") {
      return (
        <label className="block">
          <span className="text-[10px] font-bold text-[#8a96a3] uppercase tracking-wider">{LABEL_CAMPO.cor}</span>
          <select value={String(campos.cor || "amber")} onChange={(e) => setCampo("cor", e.target.value)} className="mt-1 w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white">
            {CORES_OPCOES.map((o) => (
              <option key={o.v} value={o.v}>{o.r}</option>
            ))}
          </select>
        </label>
      );
    }
    if (nome === "textos" || nome === "itens") {
      return (
        <label className="block">
          <span className="text-[10px] font-bold text-[#8a96a3] uppercase tracking-wider">{LABEL_CAMPO[nome]}</span>
          <textarea
            rows={4}
            value={(Array.isArray((campos as any)[nome]) ? (campos as any)[nome] : []).join("\n")}
            onChange={(e) => setCampo(nome as keyof PaginaBlocoCampos, e.target.value.split("\n"))}
            className="mt-1 w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white"
            placeholder={nome === "textos" ? "Um parágrafo por linha" : "Um item por linha"}
          />
          <span className="text-[10px] text-[#8a96a3] mt-1 block">
            {nome === "textos" ? "Cada linha vira um parágrafo." : "Cada linha vira um item com marcador ✓."}
          </span>
        </label>
      );
    }
    if (nome === "faq") {
      const faq = Array.isArray(campos.faq) ? campos.faq : [];
      return (
        <div>
          <span className="text-[10px] font-bold text-[#8a96a3] uppercase tracking-wider">{LABEL_CAMPO.faq}</span>
          <div className="mt-1 space-y-2">
            {faq.map((f, i) => (
              <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr,1fr,auto] gap-2">
                <input
                  type="text"
                  value={f.q || ""}
                  placeholder="Pergunta"
                  onChange={(e) => setFaq(i, "q", e.target.value)}
                  className="px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white"
                />
                <input
                  type="text"
                  value={f.a || ""}
                  placeholder="Resposta"
                  onChange={(e) => setFaq(i, "a", e.target.value)}
                  className="px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white"
                />
                <button onClick={() => delFaq(i)} className="p-2 rounded-lg bg-white/5 hover:bg-rose-500/20 text-rose-400 cursor-pointer">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
          <button onClick={addFaq} className="mt-2 px-3 py-1.5 rounded-xl text-[11px] font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 cursor-pointer inline-flex items-center gap-1.5">
            <Plus className="w-3 h-3" /> Adicionar pergunta
          </button>
        </div>
      );
    }
    if (nome === "destaqueTexto") {
      return (
        <label className="block">
          <span className="text-[10px] font-bold text-[#8a96a3] uppercase tracking-wider">{LABEL_CAMPO.destaqueTexto}</span>
          <textarea rows={3} value={valorTexto} onChange={(e) => setCampo(nome as keyof PaginaBlocoCampos, e.target.value)} className="mt-1 w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white" />
        </label>
      );
    }
    return (
      <label className="block">
        <span className="text-[10px] font-bold text-[#8a96a3] uppercase tracking-wider">{LABEL_CAMPO[nome] || nome}</span>
        <input
          type="text"
          value={valorTexto}
          onChange={(e) => setCampo(nome as keyof PaginaBlocoCampos, e.target.value)}
          className="mt-1 w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white"
        />
      </label>
    );
  };

  const previewBlocos = useMemo(() => ordenados(blocos), [blocos]);

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <FileText className="w-6 h-6 text-amber-400" />
          <div>
            <h4 className="text-lg font-bold text-white font-display">Editor de Páginas</h4>
            <p className="text-xs text-[#8a96a3]">Edite Grupo Fênix, Tecnologias e Elite Milionária. Salve para publicar no banco (Supabase).</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setMostrarPreview((v) => !v)}
            className="px-3 py-2 rounded-xl text-xs font-bold cursor-pointer inline-flex items-center gap-2 bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition-colors"
          >
            <Monitor className="w-4 h-4" />
            {mostrarPreview ? "Ocultar prévia" : "Mostrar prévia"}
          </button>
          <button
            onClick={restaurarPadrao}
            disabled={salvando}
            className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer inline-flex items-center gap-2 bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            <RefreshCw className="w-4 h-4" />
            Restaurar Padrão
          </button>
          <button
            onClick={() => salvar()}
            disabled={salvando || !dirty}
            className="btn-gold-metallic px-5 py-2 rounded-xl text-xs font-bold cursor-pointer inline-flex items-center gap-2 hover:scale-[1.03] transition-transform disabled:opacity-50"
          >
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar e publicar
          </button>
        </div>
      </div>

      {/* Status de rascunho */}
      <div className={`px-4 py-3 rounded-xl text-xs font-semibold border flex items-center gap-2 ${dirty ? "bg-amber-500/10 border-amber-500/30 text-amber-300" : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"}`}>
        {dirty ? (
          <>
            <AlertTriangle className="w-4 h-4" /> Alterações não salvas — clique em "Salvar e publicar".
          </>
        ) : (
          <>
            <CheckCircle2 className="w-4 h-4" /> Tudo salvo. Nada pendente.
          </>
        )}
        {!salvoNoBanco && !dirty && <span className="text-[#8a96a3]">(exibindo conteúdo padrão; será gravado no banco ao salvar)</span>}
      </div>

      {msg && (
        <div className={`px-4 py-3 rounded-xl text-xs font-semibold border ${msg.tipo === "ok" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-rose-500/10 border-rose-500/30 text-rose-300"}`}>
          {msg.texto}
        </div>
      )}

      {/* Seletor de página */}
      <div className="grid sm:grid-cols-3 gap-4">
        {PAGINAS.map((p) => {
          const dados = (publicData as any)?.[p.chave] as PaginaBloco[] | undefined;
          const temSalvo = Array.isArray(dados) && dados.length > 0;
          const ativa = chave === p.chave;
          return (
            <button
              key={p.chave}
              onClick={() => setChave(p.chave)}
              className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${ativa ? "bg-amber-500/10 border-amber-500/40 ring-1 ring-amber-500/30" : "bg-[#121820] border-white/10 hover:border-white/25"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`text-sm font-bold font-display block ${ativa ? "text-amber-300" : "text-white"}`}>{p.label}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${temSalvo ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30" : "bg-white/5 text-[#8a96a3] border border-white/10"}`}>
                  {temSalvo ? `${(dados as PaginaBloco[]).length} blocos · salvo` : "Padrão · não salvo"}
                </span>
              </div>
              <p className="text-[11px] text-[#8a96a3] mt-1.5 leading-snug">{p.descricao}</p>
              <p className="text-[10px] text-[#8a96a3]/60 mt-1">{p.publico}</p>
            </button>
          );
        })}
      </div>

      {/* Conteúdo: lista + form | prévia */}
      <div className="grid grid-cols-1 xl:grid-cols-[420px,1fr] gap-6">
        {/* Coluna esquerda: lista de blocos + paleta de adicionar */}
        <div className="space-y-5">
          {/* Adicionar bloco */}
          <div className="bg-[#121820] border border-white/10 rounded-2xl p-5 space-y-3">
            <h5 className="text-sm font-bold text-white font-display flex items-center gap-2">
              <Plus className="w-4 h-4 text-amber-400" /> Adicionar bloco
            </h5>
            <div className="flex flex-wrap gap-2">
              {TIPOS_BLOCO.map((t) => (
                <button
                  key={t.tipo}
                  title={t.desc}
                  onClick={() => adicionarTipo(t.tipo)}
                  className="px-3 py-1.5 rounded-xl text-[11px] font-semibold bg-white/5 border border-white/10 text-slate-200 hover:bg-amber-500/15 hover:border-amber-500/40 cursor-pointer inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3 h-3" /> {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Lista de blocos */}
          <div className="space-y-2">
            <h5 className="text-sm font-bold text-white font-display flex items-center gap-2">
              <GripVertical className="w-4 h-4 text-[#8a96a3]" /> Blocos da página ({blocos.length})
            </h5>
            {blocos.map((b, idx) => (
              <div
                key={b.id}
                draggable
                onDragStart={() => (dragIdx.current = idx)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  const from = dragIdx.current;
                  if (from === null || from === idx) return;
                  setBlocos((prev) => {
                    const nova = [...prev];
                    const [m] = nova.splice(from, 1);
                    nova.splice(idx, 0, m);
                    return nova;
                  });
                  dragIdx.current = null;
                }}
                onClick={() => setSelecionado(b.id)}
                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer ${b.ativo ? "bg-[#121820] border-white/10" : "bg-black/30 border-white/5 opacity-60"} ${selecionado === b.id ? "ring-2 ring-amber-500/50" : ""}`}
              >
                <span className="text-[#8a96a3] cursor-grab shrink-0"><Grip className="w-4 h-4" /></span>
                <span className="w-6 h-6 rounded-lg bg-white/5 border border-white/10 text-[10px] font-mono text-[#8a96a3] flex items-center justify-center shrink-0">{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white truncate">{TIPO_LABEL[b.tipo]}</p>
                  <p className="text-[10px] text-[#8a96a3] truncate">{b.campos?.titulo || b.campos?.eyebrow || b.campos?.badge || "Sem título"}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0 flex-wrap sm:flex-nowrap" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => mover(idx, -1)} disabled={idx === 0} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 cursor-pointer disabled:opacity-30" title="Subir">
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => mover(idx, 1)} disabled={idx === blocos.length - 1} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 cursor-pointer disabled:opacity-30" title="Descer">
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => toggleAtivo(idx)} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer" title={b.ativo ? "Ocultar" : "Exibir"}>
                    {b.ativo ? <Eye className="w-3.5 h-3.5 text-emerald-400" /> : <EyeOff className="w-3.5 h-3.5 text-slate-500" />}
                  </button>
                  <button onClick={() => duplicar(idx)} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 cursor-pointer" title="Duplicar">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setSelecionado(b.id)} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-amber-300 cursor-pointer" title="Editar">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => remover(idx)} className="p-1.5 rounded-lg bg-white/5 hover:bg-rose-500/20 text-rose-400 cursor-pointer" title="Excluir">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
            {blocos.length === 0 && (
              <p className="text-xs text-[#8a96a3] text-center py-6">Nenhum bloco. Adicione um acima ou use "Restaurar Padrão".</p>
            )}
          </div>
        </div>

        {/* Coluna direita: form + prévia */}
        <div className="space-y-5">
          {blocoEditado ? (
            <div className="bg-[#121820] border border-amber-500/30 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h5 className="text-sm font-bold text-amber-300 font-display">
                  Editando: {TIPO_LABEL[blocoEditado.tipo]}
                </h5>
                <button onClick={() => setSelecionado(null)} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[10px] text-[#8a96a3] -mt-2">{TIPOS_BLOCO.find((t) => t.tipo === blocoEditado.tipo)?.desc}</p>
              <div className="grid sm:grid-cols-2 gap-4">
                {CAMPOS_POR_TIPO[blocoEditado.tipo].map((nome) => (
                  <div key={nome} className={nome === "textos" || nome === "itens" || nome === "faq" || nome === "destaqueTexto" || nome === "imagem" ? "sm:col-span-2" : "sm:col-span-1"}>
                    {renderCampo(nome, blocoEditado.campos)}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-[#121820] border border-white/10 rounded-2xl p-5 text-center">
              <p className="text-xs text-[#8a96a3]">Clique em um bloco na lista ao lado para editá-lo, ou adicione um novo bloco.</p>
            </div>
          )}

          {mostrarPreview && (
            <div className="rounded-2xl overflow-hidden border border-white/10">
              <div className="px-4 py-2 bg-[#121820] border-b border-white/10 flex items-center gap-2">
                <Monitor className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-white">Prévia ao vivo — {PAGINAS.find((p) => p.chave === chave)?.label}</span>
                <span className="ml-auto text-[10px] text-[#8a96a3]">{dirty ? "não salva" : "salva"}</span>
              </div>
              <div className="bg-[#0b0f14] px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10 max-h-[70vh] overflow-y-auto">
                <PaginaBlocos blocos={previewBlocos} ctaModal={chave === "paginaElite" ? "elite" : "queroFazerParte"} preview />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Rodapé com salvar */}
      <div className="flex items-center justify-between gap-4 pt-2 border-t border-white/10">
        <p className="text-[10px] text-[#8a96a3]">
          Salvar grava no banco (Supabase) e publica no site imediatamente.
        </p>
        <button
          onClick={() => salvar()}
          disabled={salvando || !dirty}
          className="btn-gold-metallic px-5 py-2.5 rounded-xl text-xs font-bold cursor-pointer inline-flex items-center gap-2 hover:scale-[1.03] transition-transform disabled:opacity-50"
        >
          {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Salvar e publicar
        </button>
      </div>
    </div>
  );
}