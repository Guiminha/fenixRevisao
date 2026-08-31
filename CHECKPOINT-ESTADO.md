# CHECKPOINT DE ESTADO — PLATAFORMA FÊNIX
**Data:** 2026-08-09 (manhã) · **Sessão:** continuação deste ponto

> Documento de estado para retomar o trabalho em uma NOVA sessão sem perder contexto.
> REGRA DE OURO: **SUPABASE = ÚNICA FONTE DE VERDADE. NUNCA criar/recriar `db*.json`, `data/db.json` ou qualquer banco local. NUNCA re-plantar conteúdo a partir de backups antigos.**

---

## 1. Como o servidor está / como rodar

- Servidor ativo na porta **3000**: `node dist/server.cjs` com ambiente:
  - `NODE_ENV=production` (OBRIGATÓRIO — sem isso o server.ts entra em modo dev/Vite e o site fica BRANCO)
  - Iniciado via: `Set-Content Env:NODE_ENV production; node dist/server.cjs` (start CWD = raiz do projeto)
- Rebuild completo (depois de mexer em server.ts/db.ts): `npm run build` (vite build + esbuild → `dist/server.cjs`) e reiniciar com `NODE_ENV=production`.
- `.env` ativo com chaves REAIS do Supabase + `SUPABASE_ONLY=1`. **NUNCA desativar** (o login por e-mail do admin depende do Supabase Auth).

## 2. Estado atual (verificado nesta sessão)
- **Fonte de dados:** Supabase `rawfrmcaoxcvgcpbkcqm.supabase.co` (tabelas: novidades, cursos, materiais, leader_bio, config [key/value], fenix_posts; Auth com 1 conta admin).
- **Conteúdo na nuvem (APÓS as limpezas):**
  - Novidades: `0`
  - Cursos: **2** — `c-1785856845570` Treinamento em Vendas; `c-1785940967033` Estrategias de Apresentação e Fechamento de Vendas (capas no MinIO → `/api/minio/preview/cursos%2Fcapas%2F1786243...jpg` — 200)
  - Materiais: **1** — `m-mat-1785941433865` FOLDER ALCALINE MAX SQUEEZE (thumbnail leve: `/api/minio/preview/materiais%2F1786243760522_folder_thumb.jpg` — 200, ~32KB)
  - **D.Is (`config: diCodes`): `0 (variado)`** — só existirá o que o admin cadastrar pelo painel
  - Links de moderação: **1** (Johnnatan Guimarães `mod-johnnatan-guimaraes-2w3k0a`)
- **NUNCA re-criar/restaurar**: os backups `db.json` antigos foram APAGADOS e NÃO devem existir; todo "conteúdo antigo" que o usuário apagou NAO pode voltar.

## 3. Acessos
- Admin e-mail: `admin@local.fenix` / `fenix-local-jurado` (login local por e-mail via Auth; suporta o painel).
- D.I.: nenhum ativo (zaitev: só os cadastrados pelo painel valerão resultado).
- URL do painel: `http://adminfenix.localhost:3000` (Host header admin para API).
- MinIO remoto: `http://169.255.167.146:9000` (bucket `armazenamento`). Não roda local — proxy do servidor (`/api/minio/*`) acessa o remoto.

## 4. Correções já aplicadas NESTA sessão (NÃO refazer)
1. **Whitelist do host admin** (server.ts `isAdminApiPath`): liberadas `/api/fenix-social/*`, `/api/vimeo/*`, `/api/minio/*` — antes, o painel dava "Rota não disponível neste host." ao criar links de moderação (agora funciona).
2. **CRUD de posts do Fênix Social em modo nuvem** (src/server/db.ts — `deleteFenixPost`, `updateFenixPost`, `approveFenixPost`, `likeFenixPost`) — ficaram *cloud-first* (procuraram a lista local vazia → davam "Publicação não encontrada"; agora operam direto no Supabase).
3. **D.ID zerado**: `config.diCodes = []`. Os antigos (sem campo `id`) causavam "Código D.I. não encontrado" — o painel cadastra EXCL com `id` e exclui normally (validado: criar→listar→excluir).
4. **thumb do FOLDER** comprimida e serve rápida; capas dos 2 cursos mantidas.
5. **Cadastro em lote de D.I.s (.csv) [NOVO 09/08]**: aba D.I. do painel ganhou card "Cadastro em Lote" — botão **Baixar Modelo (.csv)** (`GET /api/admin/dis/template`) e upload **somente .csv** (`POST /api/admin/dis/import`, multer dedicado 3 MB). Parser próprio em `src/server/diImport.ts` (RFC 4180, vírgula/aspas, `;` de Excel pt-BR auto, BOM, linhas `#` ignoradas, cabeçalho `Nome do DI,Código do DI` ignorado, máx 5.000 linhas, células sanitizadas). `src/server/db.ts → importDIsBatch` normaliza igual ao form (trim/MAIÚSCULA/prefixo DI-), duplicados ignorados, 1 única escrita no `config.diCodes`, audit `CADASTRO_LOTE_DI`. Front: `src/store.ts` (downloadDiTemplate, importDiCodes) + `AdminView.tsx` (card com relatório: importados/duplicados/erros por linha). 1ª coluna = Nome do D.I. | 2ª = Código. Validado em produção (3+1 importados, duplicado detectado, teste limpo — lista 0).

## 4. PENDÊNCIAS / PRÓXIMA SESSÃO
- Nada em aberto crítico. O usuário pediu: NÃO mexer além do que foi pedido.
- Reprodução de um**: se o usuário apagar conteúdos/mídias, o `MinIO` também apaga?? — objetos órfãos do MinIO ficaram (ex: capas antigas `1785856657...` e o png 4.7MB) — avaliar limpeza com o usuário (não deletar por conta própria).

## 5. VERIFICAÇÕES RÁPIDAS (uma linha)
- `curl http://localhost:3000/api/content/public` → novidades 0, cursos 2, materiais 1 (is_public).
- `curl -H "Host: adminfenix.localhost:3000" http://localhost:3000/api/admin/stats-and-logs` (com token admin) → 200.
- `curl http://localhost:3000/` → HTML com `/assets/index-*.js` (se for `/src/main.tsx`/`@vite/client` → o server está em DEV: reiniciar com NODE_ENV=production).