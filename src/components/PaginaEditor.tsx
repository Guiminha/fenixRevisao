import React, { useEffect, useState } from "react";
import { Plus, Trash2, ArrowUp, ArrowDown, Eye, EyeOff, Save, Upload, RefreshCw, X, Pencil, FileText, Loader2 } from "lucide-react";
import { useStore } from "../store";
import { uploadFileWithProgress } from "../utils/uploadWithProgress";
import { PaginaBloco, PaginaBlocoCampos, PaginaBlocoTipo } from "../types";
import { PAGINA_TECNOLOGIAS_PADRAO, PAGINA_ELITE_PADRAO, PAGINA_BIOGRAFIA_PADRAO } from "../paginasPadrao";

type ChavePagina = "paginaTecnologias" | "paginaElite" | "paginaBiografia";

const PAGINAS: { chave: ChavePagina; label: string; descricao: string }[] = [
  { chave: "paginaTecnologias", label: "Tecnologias", descricao: "Página de Tecnologias Nipponflex — textos, fotos e chamadas." },
  { chave: "paginaElite", label: "Elite Milionária", descricao: "Página Elite Milionária — textos, fotos e chamadas." },
  { chave: "paginaBiografia", label: "Biografia (Grupo Fênix)", descricao: "Página Biografia do Grupo Fênix — textos, fotos, listas e FAQ." }
];

const TIPOS_BLOCO: { tipo: PaginaBlocoTipo; label: string }[] = [
  { tipo: "banner", label: "Banner (topo)" },
  { tipo: "hero_banner", label: "Banner de imagem (topo)" },
  { tipo: "hero_header", label: "Cabeçalho de seção" },
  { tipo: "card_tecnologia", label: "Card de tecnologia (foto)" },
  { tipo: "texto", label: "Texto" },
  { tipo: "imagem", label: "Imagem" },
  { tipo: "lista", label: "Lista de itens (checklist)" },
  { tipo: "faq", label: "Perguntas e respostas (FAQ)" },
  { tipo: "destaque", label: "Destaque dourado" },
  { tipo: "cta", label: "Chamada final (botão)" }
];

const ICONES_DISPONIVEIS = ["flame", "sparkles", "zap", "activity", "waves", "atom"];
const CORES_DISPONIVEIS = ["amber", "cyan", "rose", "indigo", "rosa"];

const CAMPO_BASE: PaginaBlocoCampos = {
  badge: "",
  badgeImagem: "",
  eyebrow: "",
  titulo: "",
  tituloDestaque: "",
  textos: [],
  destaqueTitulo: "",
  destaqueTexto: "",
  imagem: "",
  imagemAlt: "",
  legenda: "",
  botaoTexto: "",
  notaTexto: "",
  itens: [],
  faq: [],
  icone: "flame",
  cor: "amber"
};

function novoBloco(tipo: PaginaBlocoTipo): PaginaBloco {
  return {
    id: `bloco-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    tipo,
    ativo: true,
    ordem: 0,
    campos: { ...CAMPO_BASE }
  };
}

const LABEL_CAMPO: Record<string, string> = {
  badge: "Badge (etiqueta)",
  badgeImagem: "Imagem da badge",
  eyebrow: "Subtítulo (eyebrow)",
  titulo: "Título",
  tituloDestaque: "Destaque do título (gradiente)",
  textos: "Textos (um por linha)",
  destaqueTitulo: "Título do destaque",
  destaqueTexto: "Texto do destaque",
  imagem: "Imagem",
  imagemAlt: "Texto alternativo da imagem",
  legenda: "Legenda",
  botaoTexto: "Texto do botão",
  notaTexto: "Nota abaixo do botão",
  itens: "Itens (um por linha)",
  faq: "Perguntas & Respostas",
  icone: "Ícone",
  cor: "Cor"
};

export default function PaginaEditor({ chaveInicial = "paginaTecnologias" }: { chaveInicial?: ChavePagina }) {
  const publicData = useStore((s) => s.publicData);
  const token = useStore((s) => s.token);
  const fetchPublicData = useStore((s) => s.fetchPublicData);

  const [chave, setChave] = useState<ChavePagina>(chaveInicial);
  const [blocos, setBlocos] = useState<PaginaBloco[]>([]);
  const [editando, setEditando] = useState<PaginaBloco | null>(null);
  const [criando, setCriando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  const getAuthHeaders = () => {
    const authToken = token || localStorage.getItem("fenix_token");
    return authToken ? { Authorization: `Bearer ${authToken}` } : {};
  };

  const padraoPorChave: Record<ChavePagina, () => PaginaBloco[]> = {
    paginaTecnologias: () => PAGINA_TECNOLOGIAS_PADRAO,
    paginaElite: () => PAGINA_ELITE_PADRAO,
    paginaBiografia: () => PAGINA_BIOGRAFIA_PADRAO
  };

  const padrao = () => (padraoPorChave[chave] ? padraoPorChave[chave]() : []);

  useEffect(() => {
    setChave(chaveInicial);
  }, [chaveInicial]);

  useEffect(() => {
    const atual = (publicData as any)?.[chave];
    const fonte = atual && atual.length ? atual : padrao();
    setBlocos(fonte.map((b) => ({ ...b, campos: { ...b.campos } })));
    setEditando(null);
    setCriando(false);
  }, [chave, publicData, chaveInicial]);

  const salvar = async (blocosParaSalvar?: PaginaBloco[]) => {
    setSalvando(true);
    setMsg(null);
    try {
      const alvo = blocosParaSalvar || blocos;
      const ordenados = alvo.map((b, i) => ({ ...b, ordem: i }));
      const res = await fetch("/api/admin/paginas", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ chave, blocos: ordenados })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMsg({ tipo: "ok", texto: "Conteúdo da página salvo. As alterações já aparecem no site." });
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
    const pad = padrao().map((b) => ({ ...b, campos: { ...b.campos } }));
    setBlocos(pad);
    setEditando(null);
    setCriando(false);
    await salvar(pad);
  };

  const mover = (idx: number, dir: -1 | 1) => {
    const nova = [...blocos];
    const alvo = idx + dir;
    if (alvo < 0 || alvo >= nova.length) return;
    [nova[idx], nova[alvo]] = [nova[alvo], nova[idx]];
    setBlocos(nova);
  };

  const toggleAtivo = (idx: number) => {
    const nova = [...blocos];
    nova[idx] = { ...nova[idx], ativo: !nova[idx].ativo };
    setBlocos(nova);
  };

  const remover = (idx: number) => {
    const nova = [...blocos];
    nova.splice(idx, 1);
    setBlocos(nova);
    if (editando && editando.id === nova[idx]?.id) setEditando(null);
  };

  const uploadImagem = async (file: File, destino: keyof PaginaBlocoCampos) => {
    if (!file.type.startsWith("image/")) {
      setMsg({ tipo: "erro", texto: "Selecione um arquivo de imagem válido (PNG, JPG, WEBP)." });
      return;
    }
    setUploadingImg(true);
    setMsg(null);
    try {
      const res = await uploadFileWithProgress(file, "paginas", getAuthHeaders());
      if (res && res.success && (res.previewUrl || res.url)) {
        if (editando) {
          const novo = { ...editando, campos: { ...editando.campos, [destino]: res.previewUrl || res.url } };
          setEditando(novo);
          const idx = blocos.findIndex((b) => b.id === editando.id);
          if (idx >= 0) {
            const nova = [...blocos];
            nova[idx] = novo;
            setBlocos(nova);
          }
        }
        setMsg({ tipo: "ok", texto: "Imagem enviada para a pasta 'paginas/'." });
      } else {
        setMsg({ tipo: "erro", texto: res?.error || "Erro no upload da imagem." });
      }
    } catch (e) {
      setMsg({ tipo: "erro", texto: "Erro no upload da imagem." });
    } finally {
      setUploadingImg(false);
    }
  };

  const setCampo = (campo: keyof PaginaBlocoCampos, valor: string | string[]) => {
    if (!editando) return;
    const novo = { ...editando, campos: { ...editando.campos, [campo]: valor } };
    setEditando(novo);
    const idx = blocos.findIndex((b) => b.id === editando.id);
    if (idx >= 0) {
      const nova = [...blocos];
      nova[idx] = novo;
      setBlocos(nova);
    }
  };

  const abrirCriacao = (tipo: PaginaBlocoTipo) => {
    const bloco = novoBloco(tipo);
    setEditando(bloco);
    setCriando(true);
  };

  const confirmarCriacao = () => {
    if (!editando) return;
    if (criando) {
      setBlocos([...blocos, editando]);
    }
    setEditando(null);
    setCriando(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <FileText className="w-6 h-6 text-amber-400" />
          <div>
            <h4 className="text-lg font-bold text-white font-display">Editor de Páginas</h4>
            <p className="text-xs text-[#8a96a3]">Edite textos, fotos e blocos das páginas institucionais. Sempre salve antes de verificar no site.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={salvar}
            disabled={salvando}
            className="btn-gold-metallic px-4 py-2 rounded-xl text-xs font-bold cursor-pointer inline-flex items-center gap-2 hover:scale-[1.03] transition-transform disabled:opacity-50"
          >
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Salvar Alterações
          </button>
          <button
            onClick={restaurarPadrao}
            disabled={salvando}
            className="px-4 py-2 rounded-xl text-xs font-bold cursor-pointer inline-flex items-center gap-2 bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 transition-colors disabled:opacity-50"
          >
            <RefreshCw className="w-4 h-4" />
            Restaurar Padrão
          </button>
        </div>
      </div>

      {msg && (
        <div className={`px-4 py-3 rounded-xl text-xs font-semibold border ${msg.tipo === "ok" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-rose-500/10 border-rose-500/30 text-rose-300"}`}>
          {msg.texto}
        </div>
      )}

      {/* Seletor de página */}
      <div className="grid sm:grid-cols-2 gap-4">
        {PAGINAS.map((p) => (
          <button
            key={p.chave}
            onClick={() => setChave(p.chave)}
            className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${chave === p.chave ? "bg-amber-500/10 border-amber-500/40" : "bg-[#121820] border-white/10 hover:border-white/25"}`}
          >
            <span className={`text-sm font-bold font-display block ${chave === p.chave ? "text-amber-300" : "text-white"}`}>{p.label}</span>
            <span className="text-xs text-[#8a96a3] block mt-1">{p.descricao}</span>
          </button>
        ))}
      </div>

      {/* Formulário de bloco */}
      {editando && (
        <div className="bg-[#121820] border border-amber-500/30 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h5 className="text-sm font-bold text-amber-300 font-display">
              {criando ? "Novo bloco" : `Editando: ${editando.tipo}`}
            </h5>
            <button onClick={() => { setEditando(null); setCriando(false); }} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {!criando && (
              <label className="block">
                <span className="text-[10px] font-bold text-[#8a96a3] uppercase tracking-wider">Tipo de bloco</span>
                <select
                  value={editando.tipo}
                  disabled
                  className="mt-1 w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white disabled:opacity-50"
                >
                  <option value={editando.tipo}>{TIPOS_BLOCO.find((t) => t.tipo === editando.tipo)?.label || editando.tipo}</option>
                </select>
              </label>
            )}
            {(editando.tipo === "hero_header" || editando.tipo === "card_tecnologia") && (
              <>
                <label className="block">
                  <span className="text-[10px] font-bold text-[#8a96a3] uppercase tracking-wider">{LABEL_CAMPO.icone}</span>
                  <select
                    value={editando.campos.icone || ""}
                    onChange={(e) => setCampo("icone", e.target.value)}
                    className="mt-1 w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white"
                  >
                    {ICONES_DISPONIVEIS.map((i) => (
                      <option key={i} value={i}>{i}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[10px] font-bold text-[#8a96a3] uppercase tracking-wider">{LABEL_CAMPO.cor}</span>
                  <select
                    value={editando.campos.cor || ""}
                    onChange={(e) => setCampo("cor", e.target.value)}
                    className="mt-1 w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white"
                  >
                    {CORES_DISPONIVEIS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {["badge", "eyebrow", "titulo", "tituloDestaque", "imagemAlt", "legenda", "botaoTexto", "notaTexto", "destaqueTitulo"].map((campo) => (
              editando.campos.hasOwnProperty(campo) && campo !== "imagem" && (
                <label key={campo} className="block sm:col-span-1">
                  <span className="text-[10px] font-bold text-[#8a96a3] uppercase tracking-wider">{LABEL_CAMPO[campo]}</span>
                  <input
                    type="text"
                    value={(editando.campos as any)[campo] || ""}
                    onChange={(e) => setCampo(campo as keyof PaginaBlocoCampos, e.target.value)}
                    className="mt-1 w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white"
                  />
                </label>
              )
            ))}
          </div>

          {editando.campos.hasOwnProperty("destaqueTexto") && (
            <label className="block">
              <span className="text-[10px] font-bold text-[#8a96a3] uppercase tracking-wider">{LABEL_CAMPO.destaqueTexto}</span>
              <textarea
                rows={2}
                value={editando.campos.destaqueTexto || ""}
                onChange={(e) => setCampo("destaqueTexto", e.target.value)}
                className="mt-1 w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white"
              />
            </label>
          )}

          {editando.campos.hasOwnProperty("textos") && (
            <label className="block">
              <span className="text-[10px] font-bold text-[#8a96a3] uppercase tracking-wider">{LABEL_CAMPO.textos}</span>
              <textarea
                rows={4}
                value={(editando.campos.textos || []).join("\n")}
                onChange={(e) => setCampo("textos", e.target.value.split("\n"))}
                className="mt-1 w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white"
              />
            </label>
          )}

          {editando.campos.hasOwnProperty("itens") && (
            <label className="block">
              <span className="text-[10px] font-bold text-[#8a96a3] uppercase tracking-wider">{LABEL_CAMPO.itens}</span>
              <textarea
                rows={4}
                value={(editando.campos.itens || []).join("\n")}
                onChange={(e) => setCampo("itens", e.target.value.split("\n"))}
                className="mt-1 w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white"
              />
              <span className="text-[10px] text-[#8a96a3] mt-1 block">Um item por linha (aparecem como checklist).</span>
            </label>
          )}

          {editando.campos.hasOwnProperty("faq") && (
            <label className="block">
              <span className="text-[10px] font-bold text-[#8a96a3] uppercase tracking-wider">{LABEL_CAMPO.faq}</span>
              <textarea
                rows={6}
                value={(editando.campos.faq || []).map((f) => `${f.q || ""} |||${f.a || ""}`).join("\n")}
                onChange={(e) => {
                  const linhas = e.target.value.split("\n").filter((l) => l.trim() !== "");
                  const faq = linhas.map((linha) => {
                    const idx = linha.indexOf("|||");
                    return idx >= 0
                      ? { q: linha.slice(0, idx).trim(), a: linha.slice(idx + 3).trim() }
                      : { q: linha.trim(), a: "" };
                  });
                  setCampo("faq" as keyof PaginaBlocoCampos, faq as any);
                }}
                className="mt-1 w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-xs text-white"
              />
              <span className="text-[10px] text-[#8a96a3] mt-1 block">Formato: pergunta na linha, resposta após "|||" (ex.: "Preciso de experiência? ||| Não.")</span>
            </label>
          )}

          {editando.campos.hasOwnProperty("imagem") && (
            <div>
              <span className="text-[10px] font-bold text-[#8a96a3] uppercase tracking-wider">{LABEL_CAMPO.imagem}</span>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                {editando.campos.imagem && (
                  <img src={editando.campos.imagem} alt="" className="w-28 h-20 object-cover rounded-xl border border-white/10" />
                )}
                <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-xs text-slate-200 hover:bg-white/10 transition-colors">
                  <Upload className="w-3.5 h-3.5" />
                  {uploadingImg ? "Enviando..." : "Enviar foto"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploadingImg}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadImagem(f, "imagem");
                      e.target.value = "";
                    }}
                  />
                </label>
                {editando.campos.imagem && (
                  <button onClick={() => setCampo("imagem", "")} className="p-2 rounded-lg bg-white/5 hover:bg-rose-500/20 text-slate-300 cursor-pointer" title="Remover imagem">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => { setEditando(null); setCriando(false); }} className="px-4 py-2 rounded-xl text-xs font-bold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 cursor-pointer">
              Cancelar
            </button>
            {criando && (
              <button onClick={confirmarCriacao} className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30 cursor-pointer">
                Adicionar Bloco
              </button>
            )}
          </div>
        </div>
      )}

      {/* Adicionar bloco */}
      <div className="bg-[#121820] border border-white/10 rounded-2xl p-5 space-y-3">
        <h5 className="text-sm font-bold text-white font-display">Adicionar bloco</h5>
        <div className="flex flex-wrap gap-2">
          {TIPOS_BLOCO.map((t) => (
            <button
              key={t.tipo}
              onClick={() => abrirCriacao(t.tipo)}
              className="px-3 py-1.5 rounded-xl text-[11px] font-semibold bg-white/5 border border-white/10 text-slate-200 hover:bg-amber-500/15 hover:border-amber-500/40 cursor-pointer inline-flex items-center gap-1.5"
            >
              <Plus className="w-3 h-3" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de blocos */}
      <div className="space-y-2">
        {blocos.map((b, idx) => (
          <div key={b.id} className={`flex items-center gap-3 p-3 rounded-xl border ${b.ativo ? "bg-[#121820] border-white/10" : "bg-black/30 border-white/5 opacity-60"}`}>
            <span className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 text-[11px] font-mono text-[#8a96a3] flex items-center justify-center shrink-0">
              {idx + 1}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-white truncate">
                {TIPOS_BLOCO.find((t) => t.tipo === b.tipo)?.label || b.tipo}
              </p>
              <p className="text-[10px] text-[#8a96a3] truncate">{b.campos.titulo || b.campos.eyebrow || b.campos.badge || "Sem título"}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => mover(idx, -1)} disabled={idx === 0} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 cursor-pointer disabled:opacity-30" title="Mover para cima">
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => mover(idx, 1)} disabled={idx === blocos.length - 1} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 cursor-pointer disabled:opacity-30" title="Mover para baixo">
                <ArrowDown className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => toggleAtivo(idx)} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer" title={b.ativo ? "Ocultar bloco" : "Exibir bloco"}>
                {b.ativo ? <Eye className="w-3.5 h-3.5 text-emerald-400" /> : <EyeOff className="w-3.5 h-3.5 text-slate-500" />}
              </button>
              <button onClick={() => { setEditando({ ...b, campos: { ...b.campos } }); setCriando(false); }} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 cursor-pointer" title="Editar">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => remover(idx)} className="p-1.5 rounded-lg bg-white/5 hover:bg-rose-500/20 text-rose-400 cursor-pointer" title="Excluir bloco">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
        {blocos.length === 0 && (
          <p className="text-xs text-[#8a96a3] text-center py-6">Nenhum bloco nesta página. Adicione blocos acima ou use "Restaurar Padrão".</p>
        )}
      </div>

      <div className="flex items-center justify-between gap-4 pt-2 border-t border-white/10">
        <p className="text-[10px] text-[#8a96a3]">
          As alterações ficam visíveis imediatamente no site após salvar.
        </p>
        <button
          onClick={salvar}
          disabled={salvando}
          className="btn-gold-metallic px-5 py-2.5 rounded-xl text-xs font-bold cursor-pointer inline-flex items-center gap-2 hover:scale-[1.03] transition-transform disabled:opacity-50"
        >
          {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Salvar Alterações
        </button>
      </div>
    </div>
  );
}
