# Situação Atual do App — Plataforma Fênix

> Documento de contexto gerado em **13/08/2026** para que outra IA/agente entenda o projeto e continue editando sem quebrar nada.
> Fontes: `AGENTS.md`, `CORRECOES-SEGURANCA.md`, `DOCUMENTACAO.md` e levantamento real dos dados feito nesta data.
> Leia este arquivo + `AGENTS.md` antes de qualquer mudança.

---

## 1. Visão geral

Plataforma Fênix é um site + painéis administrativos de uma empresa de marketing digital (Grupo Fênix). Ele contém:

- **Site público** (home, novidades, cursos/materiais, Escola Fênix, Tecnologias, Elite Milionária, Fênix Social, Líderes, LeaderBio, Quero Fazer Parte).
- **Área do D.I.** (membro): conteúdo restrito, Escola Fênix com player, suporte ao cliente (`/suporte`).
- **Painel admin** (`adminfenix.*`): conteúdo (cursos/novidades/materiais), códigos D.I., suporte (caixa unificada + notificações por e-mail), Páginas (editor de blocos Tecnologias), moderação, backup & restauração, logs/auditoria.
- **Painel suporte** (`suporte.*`): caixa de atendimento em 3 colunas (pastas | lista | leitura), realtime via SSE, anexos.

### Stack

- **Front**: React 19 + Vite 6 + TypeScript, Tailwind CSS v4, Zustand (`src/store.ts`), Motion (`motion/react`), Lucide React, hls.js (dinâmico).
- **Back**: Express + `tsx` (`server.ts` na raiz), porta 3000.
- **Banco**: **Supabase = única fonte de dados** (`SUPABASE_ONLY=1`). Sem `data/db.json` (proibido recriar). Tabelas: `config` (JSON por chave), `novidades`, `cursos`, `materiais`, `tecnologias`, `fenix_posts`, `leader_bio`, `audit_logs`, `dis_codes`, `moderator_links`.
- **Mídia**: MinIO (compatível S3), bucket padrão `armazenamento`; vídeo via Vimeo/YouTube/HLS.
- **E-mail**: nodemailer (`src/server/mailService.ts`), opcional (SMTP via env; sem SMTP nada quebra).
- **IA**: Gemini (backend, moderação).

---

## 2. Como rodar e validar

```bash
npm install
dev-server.bat        # inicia Vite + Express :3000 em background (logs: dev-server.log / dev-server.err.log)
npm run build         # build de produção
npx tsc --noEmit      # typecheck — erros pré-existentes SÓ em src/ErrorBoundary.tsx (não corrigir sem permissão)
```

- **URLs**: `http://localhost:3000` (site), `http://adminfenix.localhost:3000/` (admin), `http://suporte.localhost:3000/` (suporte).
- **Admin local**: `admin@fenix.local` / `fenix-admin-local` (no `dev-server.bat`). Em produção o login é por e-mail Supabase (única conta: `j.aguimaraesfilmes@gmail.com`, role admin).
- **Restart obrigatório** após editar arquivos servidor (`Stop-Process` na porta 3000 e rodar `dev-server.bat` de novo; o bat persiste JWT em `data/.dev-jwt-secret`).
- **Rate limit de login**: 10 tentativas/15 min por IP (429). Restart do servidor limpa o contador em memória.
- **Não rodar `git`** (não instalado na máquina). NÃO usar `process.env.*` no frontend (bug histórico: Vite dev não substitui → página em branco; `App.tsx` detecta subdomínio por hostname).
- **Playwright headless** para validação de render (browser em `%LOCALAPPDATA%\ms-playwright`). Padrão: listeners de `response`/`pageerror`/`console` — zero 404 + zero pageerror.

---

## 3. Arquitetura / mapa de arquivos

| Arquivo | Papel |
|---|---|
| `server.ts` | API Express: auth JWT, rate limit, rotas públicas/admin/suporte, uploads MinIO, SSE realtime, anexos com sharp, moderação |
| `src/server/db.ts` | Acesso a dados (Supabase service_role p/ ops autenticadas; anon/RLS p/ leituras públicas), persistência de tickets/leads/configs, auditoria |
| `src/server/backupService.ts` | Backups do site (JSON no MinIO, checksum, restore exato/mesclado) |
| `src/server/mailService.ts` | E-mails SMTP fire-and-forget |
| `src/store.ts` | Zustand global (auth, dados, tickets, leads, ações de API) |
| `src/components/` | Views: `InicioView`, `EscolaFenixView`, `ConteudosView`, `TecnologiasView`, `EliteMilionarioView`, `FenixSocialView`, `LeaderBioView`, `SuporteClienteView`, `SupportApp` (painel), `AdminView` (painel admin), `PaginaBlocos`/`PaginaEditor` (editor de páginas), `QueroFazerParteModal`, `Reveal` (animações), `Sidebar`, `LoginModal`, `HeroCarousel` etc. |
| `src/paginasPadrao.ts` | Blocos padrão da página Tecnologias (8) — fallback quando não há config. (Elite Milionária é de texto fixo em `EliteMilionarioView.tsx`) |
| `src/types.ts` / `src/server/db.ts` | Tipos: `PaginaBloco`, `SupportTicket`, `SupportAnexo`, `OuvidoriaMessage`, `Curso` (com `secao`) etc. |
| `dev-tools/` | Scripts de validação E2E (Playwright `pw-*.cjs`), probes de API (`probe-*.cjs`) e cleanups |
| `backups-site/`, `backups-banco/` | Backups (MinIO/local — 3 famílias protegidas nas rotas públicas) |

**Segurança relevante**: JWT sem dados sensíveis (`{role, name, jti, exp}`); códigos D.I. resolvidos no servidor via `jtiSessions` (persistido em `data/jti_sessions.json`); service_role **sempre** para ops do servidor; `/api/admin/*` só no subdomínio admin (host principal → 403/404); mídias `materiais/*` exigem sessão; backups com guardas anti-vazamento; RLS aplicado (script `supabase-security-fix.sql`).

---

## 4. Fluxos do app

### Site público
- Home (hero + carousels), Conteúdos (cursos/materiais), Tecnologias (página de blocos), Elite Milionária (texto fixo estilo LeaderBio + modal próprio), Escola Fênix (3 seções: Cursos/Séries/Treinamentos), Fênix Social (posts + moderação), Líderes/LeaderBio, "Quero Fazer Parte" (modal em vários pontos → `POST /api/ouvidoria/submit`).
- Página em manutenção se config `manutencao.ativo`.

### Área D.I. (membro)
- Login por código (`DI-...`) → conteúdo restrito + Escola Fênix + `/suporte`.
- Suporte do D.I. (`SuporteClienteView`): abas Abertos/Em andamento/Fechados, "Novo chamado" dourado, anexos, status exibido por derivação: última msg do suporte → **"Respondido"** (verde), senão "Aguardando resposta", fechado → "Encerrado" (exibição apenas).

### Painel admin (`adminfenix.*`)
- Abas: Conteúdo (cursos/novidades/materiais — com seção Cursos/Séries/Treinamentos, vídeo Vimeo, editor de módulos), Códigos D.I. (+ CSV export), Suporte (caixa unificada + notificações por e-mail + backup PDF/ZIP), **Páginas** (editor de blocos Tecnologias: reordenar/ocultar/editar/excluir/Restaurar Padrão), Moderação, Backup & Restauração, Logs.

### Painel suporte (`suporte.*`) — CAIXA UNIFICADA
- Login e-mail/senha (staff = config `supportUsers` com conta Autenticada no Supabase).
- Layout 3 colunas: **pastas** (Entrada / Interessados · Prioridade / Chamados / Arquivados, com contadores Bell), **lista de cards**, **painel de leitura** (modal interno com ← Voltar).
- **Interessados** (Quero Fazer Parte, técnico: leads): sempre no topo com badge PRIORIDADE, telefone em destaque (WhatsApp wa.me + Copiar), mensagem, botão **"Já contatei"** (status `lida`) / Arquivar / Desarquivar.
- **Chamados** (tickets D.I.): thread, resposta (Ctrl+Enter), anexos (download-only via lightbox), Encerrar/Reabrir.
- **Realtime**: SSE `GET /api/support/realtime` (evento `support-changed`, sem payload — cada cliente refaz fetch) + polling 30s + refetch ao focar. `publishSupportChange()` em todas as rotas (submit ouvidoria, criar chamado, mensagem, status, reabrir, status do lead, anexos).
- **Cores dos cards (comportamento vigente — revisado em 13/08)**: ver seção 6.

### Editor de páginas
- Config key `paginaTecnologias` (existe, 8 blocos) — editor salva via `POST /api/admin/paginas`; uploads na pasta `paginas/`; fallback `PAGINA_TECNOLOGIAS_PADRAO` em `src/paginasPadrao.ts`. **Elite Milionária não é editável** — texto fixo em `EliteMilionarioView.tsx` (13/08).

---

## 5. Estado atual dos dados (13/08/2026 — levantamento real)

| Item | Quantidade | Detalhes |
|---|---|---|
| Tickets de suporte | 2 | **#1 "Problema no Produto X"** (real, aberto, 4 msgs) · **#2 "Teste"** (real, órfão sem `criadoPor`, aguardando_resposta, 3 msgs — **NÃO alterar/apagar**) · os 3 tickets `PW Ticket Encerramento` (teste E2E) foram **removidos** na limpeza de 13/08 |
| Interessados (leads) | 3 | **"Johnnatan"** (real, arquivada, 08/09) · **"Fernando"** (real, `lida` — teste do usuário) · **"Sergio"** (real, `pendente` — teste do usuário) · os leads `PW Interessado` (teste E2E) foram **removidos** na limpeza de 13/08 |
| Cursos | 3 | "Treinamento em Vendas" (real) · "Estrategias de Apresentação e Fechamento de Vendas" (real) · "Treinamento de Teste" (teste, **mantido por decisão do usuário**) |
| Materiais | 1 | "FOLDER ALCALINE MAX SQUEEZE" (real, `is_public: true`) |
| Novidades | 0 | — |
| `leader_bio` | 1 | "Lideranças / Grupo Fênix" |
| Configs | 14 | banners, ouvidoriaConfig, ouvidoriaMessages, categoriasMateriais, hiddenHomeCardIds, logoUrl, minioConfig, vimeoConfig, moderatorLinks, diCodes (2: `DI-123456` Maria Silva, `DI-654321` João Pereira), supportUsers, supportTickets, manutencao, **paginaTecnologias** (8 blocos) |
| Códigos D.I. | 2 | `DI-123456` (user), `DI-654321` (user) — os 9 antigos foram apagados em 08/09 e o usuário optou por NÃO restaurar |
| `tecnologias` / `fenix_posts` | 0 | tabelas vazias (config `tecnologias` é usada pela página) |

**SQL `escola-secoes.sql` APLICADO (13/08, tarde)**: usuário colou no Supabase — coluna `secao` existe e os 3 cursos estão com `secao:"cursos"` (`created_at` preenchido). **Pendência encerrada.**

---

## 6. Revisão das notificações e cores dos cards (13/08/2026)

**Revisão das notificações (auditada)**: `publishSupportChange()` presente nas 7 rotas (server.ts: 2281 submit, 2729 create, 2779 mensagens, 2812 status, 2844 reabrir, 2900 status do lead, 3060 anexos). SSE autenticado com heartbeat 25s + retry 5000; polling 30s; refetch ao focar. Badges por sessão (`lastSeen` em memória, semeado no login): contam **mensagens do cliente** mais recentes que a última abertura; toast "🔔 Nova mensagem recebida" ao passar de 0 → >0. Contadores das pastas: Entrada = total, Interessados = leads novos, Chamados = tickets com nova msg de cliente.

**Mudança de visual aplicada nesta data (exibição apenas — dados intactos)**:
- **Interessado `pendente` (novo, querendo fazer parte)**: card com **contorno dourado âmbar 2px** (`border-2 border-amber-400/90`, fundo escuro normal, nome branco, telefone âmbar, avatar/badge PRIORIDADE dourados). **O contorno só sai quando o atendente marca "Já contatei"** (status `lida`) — abrir e fechar o card não remove. *Histórico do estilo (lições): (1) moldura grossa gradiente `p-[2px]` foi testada e **recusada pelo usuário** ("horrível") — revertida; (2) `border-gold-metallic/60` era **classe fantasma** (gold-metallic não é token Tailwind — só classes CSS custom) → borda caía para `currentColor` (branca); (3) `#d12a62` é o "dourado" do tema mas é na verdade **rosa/magenta** → borda saiu vermelha; (4) **final = âmbar de verdade** (`amber-400`), validado por cor computada no E2E (`pw-support-cards` rejeita o rosa `0.200945` do oklab do #d12a62).* Notificações "Nova" (vermelha)/bolinha permanecem.
- **Interessado `lida` (após "Já contatei")**: card **opaco/sem cor** — sem contorno, borda neutra, textos esmaecidos, avatar dessaturado, badge esmaecida; notificação vermelha continua se houver.
- **Chamado respondido** (última msg do suporte, ticket ativo): card **sem cor** — borda/fundo neutros `border-white/5`, textos esmaecidos, avatar dessaturado, chip de status com opacity reduzida; **a bolinha/badge vermelha de notificação permanece como única cor** (não confundir o atendente).
- **Chamado com nova mensagem do cliente**: **a cor volta ao card** — destaque sutil vermelho (`border-red-500/20 bg-red-500/[0.04]`) + avatar/nome coloridos + badge/toast.
- **Área do D.I. (`/suporte` — mesma data, espelho do staff)**: card com última msg do **suporte** ("Respondido") → **borda verde VÍVIDA 2px** (`border-2 border-emerald-400/90` + fundo `bg-emerald-500/[0.03]`, destaque de mensagem recebida); card com última msg do **D.I.** ("Aguardando resposta") → **sem cor e opaco** (borda `border-white/5`, nome `text-white/55`, `#NNNN` esmaecido, avatar `opacity-55 grayscale`, chip `opacity-45`; badge vermelha permanece como única cor). Encerrado inalterado. Exibição apenas.
- Terminais (fechado/resolvido/arquivado): neutros como antes.

---

## 7. Regras de imutabilidade (CRÍTICO)

- **Nenhum conteúdo do site pode ser apagado/sobrescrito/alterado** — só o que o admin excluir no painel.
- Tickets reais #1 e #2 (incluindo o órfão) **intactos**: nunca deletar/alterar via script (limpeza de teste foi PATCH direto service_role por exceção documentada; o padrão é `cleanup-probe-inbox.cjs` para dados PW).
- Mensagens não podem ser editadas/apagadas (auditoria imutável; `persistSupportTickets` grava com service_role).
- `audit_logs` imutável (copiado nos dumps de backup, nunca restaurado).
- **Supabase = única fonte**: nunca recriar `data/db.json` ou ressembrar a nuvem a partir de local.
- `data/db.json` **não pode existir** (foi apagado por ordem do usuário; contém credenciais MinIO).
- Backups: sempre criar antes de update/deploy; nunca restaurar saves vazias (`193208`, `200223-pré`, `202751-pré`) sem força explícita.

---

## 8. Convenções / armadilhas do ambiente

- **PowerShell 5.1**: one-liners com aspas/acentos quebram — preferir here-strings (`@' ... '@ | node`) ou arquivos temp em `%TEMP%\opencode`. O wrapper de shell remove aspas duplas em strings single-quoted.
- Servidor: `Stop-Process` no PID da porta 3000 + `Start-Process cmd.exe /c dev-server.bat` (background, ~15s). Restart limpa o rate limit de login.
- `fetch` do Node (undici) descarta header `Host` — para subdomínios usar `http.request` com `Host` manual (padrão dos probes).
- SPA não mapeia URL→view: em testes Playwright clicar nos links de navegação (`#nav-*`, `#admin-nav-*`).
- Ovos de Páscoa no código: `*.bak-mojibake` são cópias antigas com texto corrompido — ignorar.
- Dados de teste em E2E usam prefixos `PW ` / `Probe ` e são removidos por `dev-tools/cleanup-probe-inbox.cjs` (tickets + interessados + anexos MinIO/local) e `cleanup-probes-escola.cjs` (cursos órfãos).

---

## 9. Validações e estado dos testes

- Baselines recentes (todas verdes): `pw-paginas-editor.cjs` 26/0 (editor sem Elite), `pw-elite-topbar-check.cjs` 17/0 (novo), `pw-elite-modal-logado.cjs` 4/0 (novo), `pw-escola-secoes.cjs` 39/0, `pw-realtime-layout.cjs` 25/0, `pw-inbox-check.cjs` 46/0, `pw-suporte-crash.cjs` 9/0, `pw-suporte-di.cjs` 6/0, `probe-inbox.cjs` 28–32/0, `probe-anexos.cjs` 42/0, `probe-realtime.cjs` 7/0, `val-regras.cjs` 39/0, `val-privacidade.cjs` 39/0, `val-sessao-parte1/2` 5/0.
- Novo nesta data: `dev-tools/pw-support-cards.cjs` **15 OK / 0 FALHOU** (fluxo visual dos cards com realtime: contorno dourado âmbar 2px no lead pendente → "Já contatei" perde o contorno/opaco; chamado vermelho → respondido sem cor → cor volta via SSE + badge "1 nova"; **cor computada da borda conferida** — reprova se voltar o rosa #d12a62). `dev-tools/pw-di-cards.cjs` (novo) **11 OK / 0 FALHOU** (D.I.: staff responde → card com borda verde vívida 2px "Respondido" → D.I. responde → card sem cor/opaco; teardown service_role). `pw-realtime-layout` usa `button[title="Visualizar no site"]` para o lightbox (seletor `has-text("Ver")` casava o card do ticket por substring).
- Typecheck: `npx tsc --noEmit` limpo exceto `ErrorBoundary.tsx` (pré-existente). Build OK (~277.8KB, chunking manual).

---

## 9b. Estado atual do app (registro final — 13/08/2026, após a última rodada)

**Últimas mudanças aplicadas e validadas (tudo verde)**:
- Cards da caixa do suporte: interessado `pendente` com **contorno dourado âmbar 2px** (`border-2 border-amber-400/90`; histórico: moldura gradiente recusada pelo usuário; `border-gold-metallic/60` era classe fantasma → branca; `#d12a62` é rosa → vermelha; **final = âmbar**); `lida` opaco; chamado com msg do cliente → destaque vermelho; chamado respondido → sem cor (só notificação); nova msg → cor volta (SSE).
- **Área do D.I. (`/suporte`)**: última msg do suporte → **borda verde vívida 2px** (`border-2 border-emerald-400/90` + fundo sutil); última msg do D.I. → card **sem cor/opaco** (espelho do staff).
- **Página do player (`EscolaFenixView`, 13/08)**: removidos breadcrumb "Voltar ao Catálogo" e bloco de título/categoria/professor acima do player; botão "Voltar" flutuante dentro do player (`#course-back-btn`, absolute, sobreposto no vídeo); margens negativas no container para colar o player no topo e expandir a largura (`-mt-6 sm:-mt-8 lg:-mt-10 -mx-4 sm:-mx-6 lg:-mx-10`); import `User` órfão removido. Validado via Playwright (btn flutuante, sem título, aspect 16/9, 0 pageerror/404).
- Validação desta rodada: `pw-support-cards` **15/0** (cor computada contra o rosa), `pw-di-cards` (novo) **11/0** (verde vívido conferido por classe), `pw-suporte-di` 6/0, `pw-realtime-layout` **25/0**, tsc só ErrorBoundary, build OK. Demais baselines da seção 9 permanecem.
- **Dados (Supabase, conferidos ao final)**: 2 tickets reais (#1 "Problema no Produto X", #2 "Teste" órfão — ambos `aguardando_resposta`); 3 leads reais ("Fernando" `lida`, "Sergio" `pendente`, "Johnnatan" `arquivada` — testes do usuário via "Quero Fazer Parte", **não apagar**); 3 cursos (2 reais + "Treinamento de Teste" mantido); 1 material; 0 novidades; `paginaTecnologias` (8 blocos) mantida; `paginaElite` inexistente (Elite agora é de texto fixo, sem config).
- Nenhum dado PW de teste presente (cleanup final rodado).

---

## 10. Trabalhos em andamento / próximos passos

1. **Redesign da página Elite Milionária no estilo Grupo Fênix (13/08, tarde) — CONCLUÍDO**: o redesign âmbar/dourado aplicado em `PaginaBlocos.tsx` (branch `elite`) foi **REJEITADO pelo usuário**. Resultado final: `EliteMilionarioView.tsx` reescrita como página de **texto fixo estilo LeaderBioView** (banner topo full-width com `heroBannerImg`, `Reveal`, `card-modern`, destaques dourados, CTA `btn-gold-metallic` "FAZER PARTE DA ELITE MILIONÁRIA"), **sem FAQ**, com **novo modal** `EliteMilionarioModal.tsx` que roteia: **não logado** → caixa Interessados (leads `tipo:"parceria"`, `tipoParceria:"Elite Milionária - Candidatura de Equipe"`); **logado (D.I.)** → caixa de suporte do D.I. (`createSupportTicket("Elite Milionária — Quero fazer parte da Elite", mensagem)`). **Elite removida do editor de Páginas** (`PaginaEditor` agora só Tecnologias; `ChavePagina` sem `paginaElite`); branch `elite` removido do `PaginaBlocos` **sem alterar o layout de Tecnologias** (só as classes que Tecnologias renderizava foram mantidas); `PAGINA_ELITE_PADRAO` e seus imports de imagem removidos de `src/paginasPadrao.ts` (conteúdo agora fixo no componente). Validado: `tsc` só ErrorBoundary, `build` OK, `pw-elite-topbar-check.cjs` (novo) **17/0** (topbar suporte + Tecnologias + Elite + modal anônimo), `pw-elite-modal-logado.cjs` (novo) **4/0** (modal logado), `pw-paginas-editor.cjs` **26/0** (atualizado: editor sem Elite).
2. **Página do player (`EscolaFenixView`) — FEITA em 13/08**: breadcrumb + título/categoria/professor removidos; botão "Voltar" flutuante dentro do player (`#course-back-btn`, `absolute top-3 left-3 z-30`); container com margens negativas `-mt-6 sm:-mt-8 lg:-mt-10 -mx-4 sm:-mx-6 lg:-mx-10` (player colado no topo e responsivo). Validado via Playwright.
3. **Topo do painel suporte (13/08, tarde) — CONCLUÍDO**: topbar em grid 3 colunas (`grid grid-cols-[1fr_auto_1fr] items-center gap-3`): esquerda = texto "Central de Suporte" (h1 `text-2xl sm:text-4xl md:text-5xl`) + "Caixa de entrada · atendimento aos membros D.I." (`text-sm sm:text-xl md:text-3xl`) — 3× no desktop com escala no mobile; centro = logo `<img>` sempre renderizada (`h-30 max-w-[480px] object-contain`); direita = avatar + Sair. **Fallback Sparkles de logo removido** do topbar e da tela de login do `SupportApp` (logo sempre presente). Validado via `pw-elite-topbar-check.cjs` (48px h1 / 30px subtítulo / logo centralizada com desvio 0px).
4. Manutenção: retenção de backups (15 saves / 10 dumps) e integridade MinIO (`backups-site` órfãos).

---

## 11. Histórico resumido (sessões)

- **08/08**: migração total para Supabase, segurança (service_role, RLS), sessões duráveis, fonts locais, code-splitting.
- **09/08**: página branca corrigida (redirect `/@react-refresh`), backup do suporte (PDF/ZIP), subdomínio admin/suporte.
- **10/08**: backup & restauração completo (§22), regras A/B de exclusão + dump do banco + CSV (§23), incidente 08/09 documentado (dados apagados, decisão de não restaurar; restore `183841`).
- **11/08**: inbox unificado + SMTP (§28), "Interessados" (§29), validações de privacidade (§26).
- **12/08**: anexos no suporte (sharp, MinIO) (§30-31), sessões jti persistidas + ticket órfão (§32), caixa de e-mail 3 colunas + SSE + lightbox (§33), Escola Fênix em 3 seções + status "Respondido" + logo 3x (§34).
- **13/08**: paleta do suporte, Nível removido, labels da home, editor de Páginas (§35) — ver `CORRECOES-SEGURANCA.md` §35; revisão de notificações/cores dos cards do suporte + **cards do D.I. (borda verde quando o suporte responde; opaco quando o D.I. responde)** + **contorno âmbar 2px no card de Interessados** (após 3 iterações: moldura → classe fantasma branca → rosa #d12a62 → âmbar final; fix documentado na seção 6) + E2E `pw-di-cards` 10/0 (este documento, seção 6); **Elite Milionária = texto fixo estilo LeaderBio + modal próprio + removida do editor de Páginas; topo do painel suporte com texto 3x à esquerda e logo centralizada; fallback Sparkles de logo removido** (seção 10, itens 1 e 3 concluídos).
- **14/08**: **área do D.I. (`/suporte`) virada caixa de e-mail (desejo do usuário)**: pastas **Suporte** (ativos) e **Arquivados** (encerrado/resolvido/arquivado) à esquerda (espelho do staff) + lista de chamados no centro **ordenados do mais novo (criadoEm desc) primeiro** + busca + leitor de thread à direita (desktop) com textos negrito/larguras originais. **Novos botões do D.I.**: **Arquivar** (`arquivado`) / **Encerrar** (`fechado`) nos cards da lista e no header do thread; **Reabrir** (`aberto`) em terminados. Backend: status `arquivado` adicionado a `SupportTicketStatus` (`types.ts`, `db.ts`) e a `SUPPORT_VALID_STATUSES` (`server.ts`); `setSupportTicketStatus` em `db.ts` agora valida por papel (D.I. só do próprio chamado; encerrar/arquivar de ativo, reabrir de terminal; demais 400); `addSupportMessage` bloqueia mensagem em `fechado|resolvido|arquivado`. Core visual dos cards do D.I. (borda verde vívida 2px `border-2 border-emerald-400/90`/opaco) **mantido** — E2E `pw-di-cards` **11/0** e `pw-suporte-di` **6/0** continuam verdes (testes atualizados para a pasta Arquivados e para ignorar 404 de mídias órfãs da home — banners/capas/professores ausentes no MinIO, pré-existentes). tsc só ErrorBoundary, build OK. Servidor retomado; rate limit de login zerado no restart.
- **14/08 (round 2)**: **cards da lista do D.I. e do STAFF agora são iguais (espelho completo, desejo do usuário)** — **mensagem NOVA (não lida)** → contorno **VERDE VÍVIDO 2px** (`border-2 border-emerald-400/90` + fundo `bg-emerald-500/[0.03]`) + badge `N nova` + avatar/nome coloridos; **já lida** → contorno **BRANCO sutil** (`border-white/30`) + card "apagado" (textos esmaecidos, avatar dessaturado `opacity-55 grayscale`, chip `opacity-45`). D.I.: não-lida = msg do **suporte** mais recente que a última abertura (SSE); staff: não-lida = msg do **cliente** mais nova que `lastSeen`. **Ordenação da lista = atividade mais recente (`atualizadoEm` desc) nos DOIS painéis** — a mensagem que chega vai ao topo (ordem de chegada, mais nova em 1º; empate usa `criadoEm` desc). **Interessados/Quero Fazer Parte NÃO mudaram** (âmbar `border-2 border-amber-400/90` p/ pendente, `border-white/5` após "Já contatei" — estilo original mantido). Separador visual entre cards na lista do D.I. foi **removido** (usado contorno branco por card, a pedido). Botões Encerrar/Arquivar/Reabrir na **lista** do D.I. foram **removidos** — passaram a existir **só dentro do thread**. Código morto removido do `SupportApp` (`FILTER_ORDER`, `awaitingReply`). E2E atualizados: `pw-di-cards` (novo fluxo: branco → staff responde via SSE → verde → abre → branco) **10/0**, `pw-support-cards` **15/0** (branco p/ lida; DI responde via SSE → VERDE + badge; Interessados intactos). tsc só ErrorBoundary, build (dev + `npm run build`) OK. Dados reais intactos (4 tickets, 3 leads, sem PW).
- **14/08 (round 3)**: **botão "Não lida" no painel do staff** (`SupportApp.tsx`, header do thread, ao lado de **Encerrar**, só p/ ativos): `markUnread(id)` zera a última abertura do chamado em `lastSeen` (`setLastSeen({...prev,[id]:1})`) → as mensagens do cliente voltam a contar como novas → card fica **verde** + badge + toast "Chamado marcado como não lido." (mesma sinfonia do SSE). **Ordenação em 3 níveis no staff**: (0) mensagem NOVA real (chegou via SSE após a sessão) no topo → (1) **não lida MARCADA manualmente** (fica acima de lidos/respondidos, mas ABAIXO das novas reais) → (2) lidas/respondidas; dentro do mesmo nível, `atualizadoEm` desc (chegada). Distinção por flag `manuUnread` (set true no "Não lida", removido no `markSeen` ao abrir). E2E `pw-support-cards` ampliado (fluxo: abre → lida/branco → "Não lida" → verde + badge + acim de um lido por boundingBox) **20 OK / 0 FALHOU**. tsc só ErrorBoundary. Dados reais intactos (sem PW).

---

## 12. Referências

- `AGENTS.md` — guia de continuidade (stack, dados, regras, segurança).
- `CORRECOES-SEGURANCA.md` — histórico detalhado por seção (§19–§35) com validações.
- `DOCUMENTACAO.md` — documentação completa do site (rotas, banco, APIs, builds).
- `dev-tools/` — scripts de validação e limpeza.