# Correções de Segurança — Plataforma Fênix

Documento das correções de segurança aplicadas/planejadas. **Correções 1 a 13 já aplicadas localmente** (modo sem Supabase). As correções 14–16 dependem do ambiente (Supabase / deploy) e devem ser feitas no servidor de produção.

**Status: ✅ aplicado localmente | ⏳ pendente (produção/Supabase)**

---

## 1. ✅ Remover bypass de autenticação no JWT (assinatura ignorada)

**Arquivo:** `server.ts` — função `verifyJWT`

**Correção aplicada:** O fallback que analisava o payload **sem verificar a assinatura HMAC** foi eliminado. Agora:
- Token com 3 segmentos é validado apenas se a assinatura HMAC-SHA256 conferir com a `JWT_SECRET`;
- Payload com `exp` no passado é rejeitado;
- Qualquer token forjado (assinatura falsa) retorna `null` → `loggedIn: false`.

**Teste:** ✅ `Bearer eyJ...({role:admin,exp:futuro}).assinatura_falsa` → `loggedIn:false`.

---

## 2. ✅ Remover token em texto puro como admin

**Arquivo:** `server.ts` (linha ~138)

**Correção:** Removida a condição que aceitava strings `"admin"`, `"admin_token"` e `"123456"` como identidade de administrador.

**Teste:** ✅ `Authorization: Bearer admin` → `loggedIn:false`.

---

## 3. ✅ Mover JWT_SECRET para variável de ambiente

**Arquivo:** `server.ts` (linha ~68)

**Correção:** `JWT_SECRET` agora:
- Obrigatória via ambiente em **produção** (aborta o boot se ausente);
- Em **dev**, se ausente, gera valor aleatório por boot com `console.warn` (sessões reset em cada reinício);
- Secret hardcoded `fenix-secret-metallic-gold-identity-key-2026` removido do código.

**Local:** defina `JWT_SECRET` no `dev-server.bat` (ou `.env`).

---

## 4. ✅ Remover credenciais admin hardcoded

**Arquivos:** `server.ts` (login), `src/store.ts` (fallback client)

**Correção:**
- `server.ts`: comparação de `admin@grupofenix.com/admin123` e `user@grupofenix.com/user123` substituída por requisição ao Supabase Auth **ou** contas locais configuráveis via env (`ADMIN_EMAIL` / `ADMIN_PASSWORD`) — apenas para ambiente local/dev;
- `src/store.ts`: **blocos hardcoded removidos** do fallback client-side (email/senha e códigos 123456/654321). Sem servidor, só resta Supabase client Auth.

**Teste local:** ✅ login `admin@fenix.local` via env funciona; `123456` → 401.

---

## 5. ✅ Remover códigos-mestre D.I. hardcoded

**Arquivos:** `src/server/db.ts` (`validateDICode`), `src/store.ts`

**Correção:** Checagens fixas de `"123456"`, `"DI-ADMIN-123456"`, `"654321"`, `"DI-654321"` removidas. A validação agora consulta **apenas a base** (`di_codes` local via `db.json` / Supabase em produção). Papel admin é derivado da convenção `DI-ADMIN-` presente nos dados do banco.

**Testes:** ✅ `123456` → 401 | `DI-ADMIN-123456` → admin | `DI-654321` → user | `999999` → 401.

---

## 6. ✅ Remover `db.json` (e arquivos sensíveis) do alcance do servidor

**Arquivos:** `data/db.json` (novo local), `src/server/db.ts:DB_FILE`

**Correção:**
- `db.json` (com credenciais MinIO/Vimeo, D.I., tokens de moderador) movido para `data/db.json`, **fora** da raiz servida;
- `DB_FILE`2 suporta `DB_FILE_PATH` via env (`src/server/db.ts`);
- `.gitignore` atualizado: `data/`, `*.zip`, `dev-server.*`, `tail.txt`, `public_res*.json`, `metadata.json`, `uploads/`, `dist/`.

**Arquivos órfãos** (`test-import.ts`, `test-sb.ts`, `fix-db.cjs`, `patch.cjs`, `kill-3000.js`, `public_res.json`, `public_response.json`, `tail.txt`, zip de backup) movidos para `dev-tools/` (fora do build e do typecheck).

**Teste:** ✅ `GET /db.json` retorna o HTML do SPA (fallback), não os dados.

---

## 7. ✅ Rate limiter não confia em spoofs (IP do socket + trust proxy opcional)

**Arquivo:** `src/server/rateLimiter.ts`, `server.ts`

**Correção:**
- `clientKey` é `req.ip` (nunca o header `X-Forwarded-For` manual);
- `trust proxy` agora é **desligado por padrão** (`req.ip` = IP do socket, XFF ignorado) e configurável via env `TRUST_PROXY=1` apenas quando rodar atrás de proxy reverso em produção;
- ❌ **Falha detectada e corrigida na verificação**: `trust proxy:1` fixo permitia contornar o bloqueio enviando `X-Forwarded-For` forjado por request (5 tentativas + IP fake → 401 em vez de 429). Após a correção: 11 requests com IPs falsos → **429 a partir do 5º** (bucket único por socket).

---

## 7b. ✅ Bloquear acesso do Vite dev server a dados internos (fs.deny)

**Arquivo:** `vite.config.ts`

**Falha detectada e corrigida:** o dev server do Vite (middleware mode) expunha **qualquer arquivo do diretório do projeto** — `GET /data/db.json` retornava o JSON completo (77 KB, com credenciais MinIO/Vimeo e códigos D.I.), e `package.json`/`server.ts` eram servíveis.

**Correção:** Restrições `server.fs.deny`:
- `data/**` (banco local), `dev-tools/**`, `uploads/**`
- `.env`, `.env.*`, `db.json`, `*.db`, `*.sqlite`
- Arquivos-fonte raiz: `package.json`, `package-lock.json`, `bun.lock`, `tsconfig.json`, `vite.config.ts`, `server.ts`, `metadata.json`

**Testes:** ✅ `/data/db.json`, `/package.json`, `/server.ts` → **403**; `/index.html` e `/api/*` seguem OK.

---

## 8. ✅ Reduce limites de payload/upload (DoS)

**Arquivos:** `server.ts`

**Correção:**
- Multer: **5 GB → 500 MB** (ainda comporta vídeos grandes);
- `express.json` / `express.urlencoded`: **200 MB → 10 MB**.

---

## 9. ✅ Sanitizar CSV export (anti formula injection)

**Arquivos:** `server.ts`

**Correção:** Criada função `csvSafe()` que prefixa `'` para valores iniciados com `=`, `+`, `-` ou `@` (aplicada a todos os campos do export da Ouvidoria).

---

## 10. ✅ Reforçar `stripTags` (sanitização de entrada)

**Arquivos:** `server.ts`

**Correção:** `stripTags` agora remove também: tags `<script>`, atributos `on*` (ex.: `onerror`), `href="javascript:..."` e qualquer `javascript:` de texto.

---

## 11. ✅ Headers de segurança (helmet)

**Arquivo:** `server.ts`

**Correção:** Adicionado `helmet` (dependência instalada). `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` ativos. CSP desativado temporariamente para compatibilidade com o Vite dev (recomenda-se reativar em produção com `contentSecurityPolicy`).

**Teste:** ✅ Headers confirmados no response.

---

## 12. ⏳ Revisar/armazenar `supabase_schema.sql` fora do repo + habilitar RLS

**Ambiente:** Supabase (produção)

**Ação:** Remover o arquivo do repo e **habilitar RLS** nas tabelas do Supabase (leitura pública apenas para `leader_bio`, `novidades`, `cursos`, `materiais`, `banners`, `tecnologias`; escrita apenas via server com service role). Não aplicável ao ambiente local sem Supabase.

---

## 13. ✅ Limpeza de desenvolvimento

**Status:** ✅ aplicado (arquivos dev movidos para `dev-tools/`; `.gitignore` cobre logs e builds; `tsconfig.json` exclui `dev-tools/`, `dist/` e `node_modules` do typecheck).

---

## 14. ⏳ Dependências — atualizar e revisar

**Ação:** Rodar `npm audit fix` em ambiente apropriado e revisar os 5 pacotes com scripts pendentes do `allow-scripts` (esbuild, @google/genai, protobufjs, core-js). **Não executado** para não quebrar o build local em uso — priorizar antes do deploy.

---

## 15. ✅ Logs com email anonimizado

**Arquivo:** `server.ts` — função `maskEmail()` aplicada aos logs do Supabase Auth (login falho/sucesso/informação de role).

---

## 16. ✅ Remover acesso direto ao Supabase no frontend (browser)

**Arquivos:** `src/store.ts`

**Vulnerabilidade:** O `src/store.ts` criava um cliente Supabase **no browser** com a anon key e fazia login direto, SELECTs amplos e até **upserts/inserts** (novidades, cursos, materiais, config, audit_logs) no cliente. Isso violava o princípio de "nenhuma API exposta no frontend / nenhuma validação no frontend" — ataques via browser conseguiam forjar conteúdo.

**Correção:** Removido `createClient`/`SupabaseClient`/`clientSupabase` de `src/store.ts`. Todo acesso a dados agora passa exclusivamente pela API do servidor (`/api/*`), que usa `getSupabaseTrustedClient()` (service_role) para escritas autenticadas — credenciais nunca vão ao browser. Retrievals públicos seguem via rotas anon (somente leitura).

**Validação:** `npx tsc --noEmit` limpo (exceto erros pré-existentes do `ErrorBoundary.tsx`); grep confirma zero ocorrências de `clientSupabase`/`createClient` fora de `src/server/db.ts`.

---

## 17. ✅ Área administrativa isolada em subdomínio próprio (Host-based)

**Arquivos:** `server.ts` (gate de host), `src/App.tsx` (detecção no front), `vite.config.ts` (define), `dev-server.bat` (envs locais)

**Vulnerabilidade:** a área admin (`/adminfenix`, `/api/admin/*`) vivia no mesmo host do site público — apenas escondida por UI; qualquer pessoa que descobrisse a URL via navegador podia alcançar a tela de login e os endpoints (protegidos por JWT, mas presentes no host).

**Correção (08/08/2026):**
- Env: `ADMIN_HOST_PREFIX` (padrão `adminfenix.`) e `ADMIN_HOSTS` (ex.: `adminfenix.grupofenix.online`).
- No **host do admin** (`adminfenix.*` ou `ADMIN_HOSTS`): `/api/*` com **whitelist** — só `/api/auth/*`, `/api/admin/*`, `/api/content/*`, `/api/moderacao*` e `/api/download-status-md`; qualquer outro `/api/*` → 403 "Rota não disponível neste host". A raiz (**`/`**) serve a SPA — o App.tsx abre o painel de login direto; **nenhuma rota com path `/admin...`** (URL final = `http://adminfenix.localhost:3000/` em dev, `https://adminfenix.grupofenix.online/` em produção).
- No **host principal**: `/api/admin/*` → **403** e `/adminfenix` → **404** (área inexistente para o público).
- Frontend público sem botão/URL para a área admin (removido `"admin"` de `validViews` do `HeroCarousel`; sidebar só renderiza o painel quando já está nele). Acesso **somente digitando a URL** do subdomínio.

**Validado (Host header):** host público `/api/admin/dis`→403, `/adminfenix`→404; host admin `/api/ouvidoria/*`→403, login→200, `/api/admin/dis` (com token)→200, cadastro/exclusão D.I.→200. `npx tsc --noEmit` limpo (exceto ErrorBoundary); build OK.

**Produção (seu passo):** CNAME `adminfenix` apontando para o servidor + cert SSL (Let's Encrypt/Caddy/nginx) — só DNS, sem código.

---

## 18. ✅ Aplicar `supabase-security-fix.sql` no Supabase (RLS/GRANTS)

**Arquivo:** `supabase-security-fix.sql` — **v2 idempotente (10/08/2026)**. A v1 falhava na re-execução com 42710 ("policy already exists"): os `DROP POLICY IF EXISTS` usavam nomes antigos, mas os `CREATE POLICY` usavam nomes novos. A v2 adiciona `DROP POLICY IF EXISTS` com o **mesmo nome** antes de cada CREATE (incluindo as 8 políticas da seção 7, que não tinham DROP) e garante `ENABLE ROW LEVEL SECURITY` em todas as tabelas protegidas (idempotente). **Pode colar no SQL Editor quantas vezes for necessário, sem erro.**

**Vulnerabilidades encontradas nos testes com a anon key:**
1. `audit_logs` INSERT **permitido a anon** (policy `WITH CHECK (true)` + `GRANT INSERT TO anon`) — qualquer visitante forjava logs de auditoria.
2. `config` com `FOR SELECT USING (true)`: o schema previa leitura total da tabela de config por anon; hoje só as 5 chaves públicas vazam (minioConfig/diCodes/vimeoConfig protegidos na prática), mas a permissão de leitura ampla deve ser fechada no SQL.
3. `GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated` — largamente permissivo (autoriza qualquer usuário a qualquer operação nas tabelas, limitado apenas por RLS).
4. `moderator_links` policy `FOR ALL USING (true)` — qualquer um lê/altera links de moderador.

**Correção no script:**
- `REVOKE ALL` para `anon` e `authenticated`; GRANTs finos por tabela/operação;
- `config`: SELECT restrito à whitelist de chaves públicas (logoUrl, categoriasMateriais, banners, hiddenHomeCardIds, ouvidoriaConfig); chaves sensíveis invisíveis para anon/authenticated (backend lê com service_role);
- `audit_logs`: INSERT só authenticated; SELECT só admin;
- `moderator_links`: apenas admin (app_metadata role=admin);
- `fenix_posts`: INSERT anon proibido; criação de posts com `status = 'pendente'` apenas para authenticated (moderação preservada);
- políticas de escrita das demais tabelas restritas a admin.

**Testes após a aplicação (recomendado repetir):** com anon key: `INSERT audit_logs` → negado; `SELECT config` → só chaves públicas; `SELECT moderator_links` → vazio.

---

## 19. ✅ Endurecimento F1 — rotas críticas e exposição (10/08/2026)

- **Credenciais → env**: `VIMEO_CLIENT_ID/SECRET/TOKEN` e MinIO `rootUser/rootPassword` saíram do código (server.ts usa `process.env.*`, fallback vazio). Aba "Servidores Externos" do painel (novo splice em `AdminView.tsx`) apenas altera a config persistida no Supabase — nenhum segredo novo guardado em código.
- **Servidor não serve segredos**: static guard em produção → 404 para server.ts, .env*, db.json, data/, uploads/, logs, package.json, AGENTS.md, estado_plataforma.md, dev-tools/. Vite dev com `fs.deny` (data/, dev-tools/, uploads/, dist/, backups-site/, .env*, *.log, dev-server.bat, db/*.db/sqlite, package*.json, tsconfig, vite.config.ts, server.ts, metadata.json).
- **Traversal HLS**: master de aula e `/api/stream` exigem hash `^[a-f0-9]{32}$` e segmento `^seg_\d+\.ts$` + containment (server.ts:2903-2916); `/api/preview` e `/api/stream` rejeitam chaves `..`/`\`/>`500 chars com 400. `/api/*` sem rota → 404 JSON (não mais fallback HTML do SPA).
- **Upload**: multer em memória + magic bytes (PNG/JPEG/GIF/PDF/MP4/AVI/WEBM/ZIP) — HTML/spoof rejeitados; `x-content-type-options: nosniff`; resposta `attachment` em `/api/uploads/:filename` (só `path.basename`); bucket sempre da config (nunca `req.query.bucket`); HLS de stream/preview sem `&bucket=`.
- **Admin por `app_metadata`**: requireAdmin ignora claims falsificáveis (só `email` e `app_metadata.role === "admin"` ou D.I. `DI-ADMIN-`); sem `ADMIN_EMAIL/ADMIN_PASSWORD` → sem bypass em produção; portas usam `PORT` env (padrão 3000).
- **Validação**: Playwright 19/19 em dev (hosts público/adminfenix./suporte., aba Servidores sem valores de credencial — nomes de env não contam), build prod sem sourcemaps, prod em 3001 com static guard 404 em todos os sensíveis.

## 20. ✅ Endurecimento F2 — sessões, upload, backup (10/08/2026)

- **JWT com `jti`**: payload originalmente `{ role, code, name, jti }` — NUNCA `supabaseToken` no token do cliente. Servidor resolve o token Supabase do usuário via `jtiSessions` (Map em memória + persistência `data/refresh_sessions.json`, poda >2000). `GET /api/auth/me` não devolve `supabaseToken`. **ATUALIZADO em 11/08 (§26)**: o `code` também saiu do payload — JWT agora é `{ role, name, jti, exp }`; o code (e o supabaseToken) são resolvidos no servidor via `getJtiSession(decoded.jti)`.
- **Uploads**: allowlist `ALLOWED_UPLOAD_FOLDERS` (geral, banners, materiais, institucional, professores, cursos, cursos/capas, cursos/videos) + `sanitizeUploadFolder()` (≤60 chars, sem `..`); `objectKey` limitado a 400 chars nas rotas de upload.
- **Backup com autenticidade**: snapshot agora assinado com HMAC-SHA256 (`BACKUP_HMAC_SECRET || JWT_SECRET`); `parseAndValidateSnapshot` verifica HMAC (saves novas) com fallback para o sha256 antigo; teto `RESTORE_MAX_ROWS=10000`/`RESTORE_MAX_CONFIG_KEYS=500` checado ANTES de qualquer escrita. Restauro corrompido → 400 sem efeito; volume acima do teto → 400 sem efeito.
- **Rate limit por IP puro**: `getUserOrIpKey` = `ip:<client_ip>` (sem `usuarioNome`/`user.code` da body); `trust proxy` aceita só inteiros ≥1; keepAlive/headers timeouts (5000/61000).
- **Erros genéricos**: mensagens internas substituídas por 400/500 genéricos em upload, Vimeo (account/about/my-videos/info), backup; handler global para `/api/*` (multipart malformado → 400 JSON).
- **Vimeo info autenticada**: `/api/vimeo/info` exige login (`authenticateUser`) + rate limit próprio (60/15min por IP).
- **Validação**: controle com Supabase real — backup com HMAC criado e listado; restore corrompido/estouro de teto rejeitados sem efeito (lista de backups estável); `?token=` removido da moderação (ver F3); zero `supabaseToken` em `/me` e AdminView.

## 21. ✅ Endurecimento F3 — moderação, postMessage, arquivos (10/08/2026)

- **Moderação header-only**: token do moderador SÓ via `x-moderator-token` (GET /moderacao, POST /aprovar, POST /recusar) — `?token=` da URL removido do `store.ts` e do servidor (nada de token em logs/referrers). Validação com `GET /api/fenix-social/moderacao`: sem header 403, com header válido 200, query ignorada 200.
- **Bug latente corrigido**: `validateModeratorToken` (db.ts) usava cliente **anon/RLS** (SELECT `config` podia ser negado → links de moderador sempre 403); agora usa service_role (é validação de authfeita pelo servidor).
- **postMessage com origem**: `EscolaFenixView.tsx` só envia embeds para `https://player.vimeo.com` / `https://www.youtube.com` e só aceita mensagens de origens em whitelist (`player.vimeo.com`, `www.youtube.com`, `www.youtube-nocookie.com`) — sem `*` em `targetOrigin` nem handler sem origem.
- **`fileUrl` de materiais**: `POST /api/admin/materiais` aceita apenas caminhos do próprio site (`/api/minio/`, `/api/uploads/`, `/uploads/`) — `http(s)://`, `data:`, `javascript:` → 400 (anti XSS por href).
- **Dependências**: `npm audit` → **0 vulnerabilidades** (corrigido body-parser <1.20.6, nanoid <=3.3.16, postcss ≤8.5.22).
- **Validação final**: Playwright 19/19 no dev (checker de credenciais do painel refinado para detectar apenas VALORES de segredo); build prod limpo; scan de credenciais no código (vimeo `vk_*`, `fenix-minio-*`, `AIzaSy`, JWT literais, chaves 24+caps) → **zero ocorrências**.

---

## 22. ✅ Auditoria do sistema de backup + novas funcionalidades (10/08/2026)

**Incidente que motivou a auditoria**: o usuário fez backup → apagou conteúdo (2 cursos, 1 material, 2 DIs) → restaurou. O primeiro restore (do `183841`, correto) FUNCIONOU, mas um segundo restore exato a partir do `193208` (backup VAZIO, criado nos testes F2) sobrescreveu o site para vazio. Não era bug do restore — os restores aplicam fielmente o que a save contém; a lista não indicava o conteúdo de cada save e não havia proteção contra sobrescrever com uma save vazia.

**Correções aplicadas:**
- **Guarda anti-save-vazia**: restore em modo exato de save com 0 conteúdo (cursos+materiais+novidades+tecnologias+fenix_posts) quando o site atual tem conteúdo → `400` com mensagem clara. Override com `forceVazio=true` (checkbox "Forçar" no painel, mostrado quando a save selecionada está vazia). **⚠ Regra (bug real encontrado): a contagem NÃO pode incluir `leader_bio`/`config`** — toda save tem 1 leader_bio e 13 configs; se contassem, `totalSave` nunca seria 0 e a guarda nunca dispararia (foi o que aconteceu na primeira implementação; `conteudoTotalDaSave` agora conta só conteúdo de usuário).
- **Resumo na lista**: `listSiteBackups` lê o `resumo` gravado em cada save (com cache de 60s por `modificadoEm::key`) e devolve na resposta; UI mostra "2 cursos, 1 material, ..." por linha + badge vermelho **save VAZIA** + badge **proteção automática** para `*-pré-restauração*`.
- **Verificação pós-restore**: após aplicar, o servidor lê contagens REAIS do banco (`currentContentCounts`) e devolve em `verificacao` + grava no audit — não é mais a contagem da save.
- **Download em .zip**: `GET /api/admin/backup/download/:nome` (`requireAdmin`) — valida o nome, baixa a save do MinIO, empacota com `jszip` e serve `application/zip` + `attachment; filename="<nome>.zip"` (antes o link do painel apontava para `/api/minio/stream`, público, e abria o JSON inline no navegador). Cache de 5s por nome.
- **Exclusão definitiva**: `DELETE /api/admin/backup/delete` (`requireAdmin`) — valida `String(key)` (prefixo `backups-site/`, sem `..`/`\`, `.json`, ≤500 chars), remove do MinIO, audit `EXCLUIR_BACKUP`; bloqueada se `restoreInProgress`. UI com lixeira em cada linha, confirmação em 2 cliques (arma "Excluir mesmo assim?" por 4s).
- **Papel admin em contas recriadas**: `applyAuthUsers`/`collectAuthUsers` gravam papel em `app_metadata` E `user_metadata` (antes só `user_metadata` — admin recriado por restore perdia o painel, pois `requireAdmin` lê `app_metadata`).
- **Fix bônus — crash na página de curso (`EscolaFenixView`)**: o efeito de `postMessage` do player Vimeo/YouTube referenciou `embedInfo` (declarado dentro do bloco `if (activeCourse)`) — TS2304 + ReferenceError em runtime ao abrir qualquer curso. O efeito agora deriva a origem do player da aula atual sozinho (mesma lógica de `getVideoEmbedInfo`, sem depender do escopo do bloco).

**Validação (todas passaram)**: restore `183841` (verificação real 2 cursos/1 material/2 contas/13 configs) + restore `174122` idem; guarda bloqueou `193208` com `400` ("Esta save está VAZIA...") com o site em 2/1 e liberou com `forceVazio:true`; download ZIP (`PK` + `Content-Disposition: attachment; filename="*.zip"`); create→delete de backup de teste (confirmado removido da lista); `tsc` sem novos erros, `npm run build` ok, Playwright **19/19**.

**Estado final (10/08 ~20:40 local)**: site restaurado — 2 cursos, 1 material, 0 novidades, 2 DIs, 13 configs. Saves com conteúdo: `174122`, `183841`, `200317-pré-restauração`; vazias (exigem força): `193208`, `200223-pré-restauração`, `202751-pré-restauração`. Retenção automática (15) + exclusão manual agora disponível.

---

## Checklist final

- [x] `server.ts`: removido fallback JWT sem assinatura
- [x] `server.ts`: removidos tokens em texto puro
- [x] `server.ts`: `JWT_SECRET` via env (aleatório em dev, obrigatório em prod)
- [x] `server.ts` + `store.ts`: sem credenciais/códigos hardcoded
- [x] `db.ts` + `store.ts`: sem códigos-mestre D.I. fixos
- [x] `db.json` movido para `data/` + `.gitignore` completo
- [x] `rateLimiter.ts`: key = `req.ip` + `trust proxy` configurado
- [x] Limites de payload/upload reduzidos (10 MB / 500 MB)
- [x] CSV sanitizado (anti formula injection)
- [x] `stripTags` reforçado (on*, javascript:)
- [x] `helmet` instalado e aplicado
- [x] Arquivos dev removidos do build/typecheck (dev-tools/)
- [x] Logs com email anonimizado
- [x] Frontend sem acesso direto ao Supabase (browser usa só `/api/*`)
- [x] Área admin isolada por subdomínio Host-based (sem botão/URL no frontend)
- [x] `supabase-security-fix.sql` aplicado no Supabase (RLS/GRANTS) — **v2 idempotente criada 10/08; colar no SQL Editor e rodar limpo**
- [x] RLS habilitado no Supabase (produção) — **garantido pelo próprio script (§0, `ENABLE ROW LEVEL SECURITY` em todas as tabelas protegidas)**
- [x] `npm audit fix` + revisão de scripts pending (produção) — **0 vulnerabilidades (10/08); allow-scripts warning do npm é local, benigno**

## Observações de dados (10/08/2026)

- `config.diCodes` está `[]` no Supabase → login D.I. (`DI-123456`) retorna 401. Estado pré-existente, NÃO regressão desta sessão (AGENTS.md lista 2 códigos, mas a config real não os contém).
- `materiais` no Supabase: **0 registros** (o "1 material" do 08/10 já não existia antes dos testes; os materiais de teste "XSS" criados na validação F3 foram removidos via API admin — lista voltou a 0). Não restaurar conteúdo sem ordem expressa.
- Backup de teste legítimo mantido: `backups-site/backup-2026-08-10_193208.json` (HMAC assinado).

## §23 — 10/08/2026 — Exclusão com mídia, dump do banco, integridade e CSV (Regras A/B)

- **Regra A — exclusão com mídia (aplicada a TODOS os DELETEs admin: banners, novidades, cursos, materiais, posts do Fênix Social e links de moderação)**: o servidor chama `ensureDeleteProtection` (em `src/server/backupService.ts`) **antes** de apagar — cria backup automático `backups-site/backup-<data>_<hora>-pré-exclusão.json` do estado atual (máx. 1 por 10 min por backup de pré-exclusão → throttle, sem spam), audit `BACKUP_PRE_EXCLUSAO`; em seguida remove o(s) registro(s) e apaga do MinIO **somente as mídias que ficaram sem nenhuma referência** (`collectMediaKeys` percorre configs + todas as tabelas; `removeOrphanMedia` verifica refs no MinIO). Mídia compartilhada entre 2+ itens fica; backups nunca são tocados. Resposta: `{ success, protecao: { backupCriado, backupNome }, midias: { removidas, mantidas } }`. Bônus: o mapeamento de backups do manifesto (`excludeBackups`) agora ignora as 3 famílias `backups-site/`, `backups-banco/`, `backup-suporte/` (Regra B — mídia de backup não é "mídia de conteúdo").
- **Dump completo do banco — `POST /api/admin/backup/dump`**: grava `backups-banco/banco-<data>_<hora>.json` no MinIO com **configs + todas as tabelas (novidades, cursos, materiais, tecnologias, fenix_posts, moderator_links, leader_bio) + contas + cópia imutável dos audit_logs** (últimos 20.000, ordem desc); rotas `GET /api/admin/backup/banco-list` (com resumo por dump), `DELETE /api/admin/backup/banco-delete`, `GET /api/admin/backup/banco-download/:nome` (ZIP, valida prefixo `backups-banco/`); retenção automática de **10 dumps**; audit `BACKUP_BANCO_CRIADO`/`BACKUP_BANCO_EXCLUIDO`. O botão "Criar Backup Agora" do painel **também gera o dump automaticamente** (campo `dump` na resposta).
- **Verificador de integridade — `GET /api/admin/backup/integrity`** (leitura, admin; audit `VERIFICAR_INTEGRIDADE`): cruza cada mídia citada (`/api/minio/stream|preview/...`) em configs+tabelas contra os objetos do MinIO → `ausentes` (somem do bucket, com a origem) e `semReferencia` (órfãos, com nome/tamanho). Corre **sozinho ao final de cada restauração** (campo `integridade` no retorno + o painel exibe o resumo). No estado atual (10/08): 9/9 presentes, 0 ausentes, 65 órfãos reais (ex.: `2026/07/28/*`, `banners/*`, `fenix_social/*`, raiz com arquivos soltos) — prontos para limpar pelo painel.
- **Limpar mídias órfãs — `POST /api/admin/backup/cleanup-orphans`**: recebe lista de chaves (painel marca com checkbox), re-verifica cada uma no MinIO no momento da exclusão (ninguém passou a referenciar no meio-tempo), **nunca toca** em `backups-site/`, `backups-banco/` nem `backup-suporte/` (guarda `BACKUP_PREFIXES`), bloqueada durante restauração em andamento (`isRestoreInProgress`); audit `EXCLUIR_MIDIA_ORFA`.
- **CSV dos D.I.s — `GET /api/admin/dis/export-csv`**: BOM UTF-8 + cabeçalho `Nome do DI;Codigo do DI;Papel;Status`; Papel = Admin quando o código tem prefixo `DI-ADMIN-`, senão Usuario; botão "Baixar CSV dos D.I.s cadastrados" no painel, ao lado do botão do modelo.
- **Validado 10/08 (fim da tarde, servidor dev em 3000)**: `node dev-tools/val-regras.cjs` → **39 OK / 0 FALHOU** (Regra A determinística: proteção pré-exclusão criada no 1º DELETE, throttle no 2º, mídia única removida, compartilhada mantida, removida após última referência; dump manual + automático + download ZIP; integrity; CSV; restore + verificação 2/1/0 + integridade pós-restore 9/9; estado final 2/1/0); `node dev-tools/pw-novas-regras.cjs` → **5 OK / 0 FALHOU** (UI: dump, integridade, CSV); `node dev-tools/pw-check.cjs` → 5/5; `npm run build:all` → OK. Nota: rate limit de login (10 por 15 min/IP) — scripts que logam repetidamente podem receber 429; aguardar para rodar de novo.

## §24 — 10/08/2026 (noite) — Privacidade dos backups + download do backup do suporte

- **Guardas `isBackupFamilyKey` (obrigatórias em TODAS as rotas públicas de mídia)**: `stream`, `preview` e `hls` agora recusam com 404 (idêntico ao de arquivo inexistente, para não vazar existência) qualquer objeto cuja chave comece com `backups-site/`, `backups-banco/` ou `backup-suporte/` (`BACKUP_FAMILY_PREFIXES` em `server.ts`) — **mesmo com token de admin** (guardas incondicionais, antes de qualquer auth); validação de envio (tamanho/`..`/`\`) fica antes da guarda. O `hls` também ganhou a guarda no parse de `?key=` (antes só `stream`/`preview` protegiam).
- **Nova rota de download do backup do suporte — `GET /api/admin/backup/suporte-download/*`**: `requireAdmin` (subdomínio do admin), recebe a chave relativa (`backup-suporte/<ano>/<data>/<arquivo>.zip`), chama `buildSuporteBackupZip` (que transfere e valida o objeto do MinIO; chave inexistente → erro → 400). Resposta: ZIP com `Content-Disposition` seguro + `X-Content-Type-Options: nosniff`; audit `SUPORTE_BACKUP_BAIXADO`. O painel admin ("Baixar ZIP" no card Backup do Suporte) usa esta rota — **não usa mais `/api/minio/stream`** (que está bloqueado).
- **Regra**: públicos (D.I.s e visitantes) **nunca** têm acesso aos 3 tipos de backup nem pelas rotas de mídia nem por API; o download existe exclusivamente na área admin.
- **Validado 10/08 (noite, servidor dev 3000)**: `node dev-tools/val-privacidade.cjs` → **29 OK / 0 FALHOU** — 8 guardas (stream/preview nas 3 famílias + hls + com token admin), regressão de mídia de conteúdo (upload→stream 200→cleanup→404), suporte-download (inválida 400 / anônimo 401 / banco-list regressão), isolamento entre D.I.s reais (`DI-123456`/`DI-654321` só veem os próprios chamados; host público para `/api/support/*` pois no subdomínio do admin a whitelist nega), e `/api/content/public` sem `supportTickets`/`diCodes`/`minioConfig`/`vimeoConfig`. Correção do script: chamadas de suporte devem usar Host público (`localhost:3000`), não `adminfenix.localhost` (whitelist do subdomínio → 403). Teste: `npx tsc --noEmit` limpo (só erros pré-existentes do ErrorBoundary) + `npm run build` (vite + esbuild `dist/server.cjs`) OK.
- **Requisito pendente do usuário (anotado)**: gerar o backup do suporte **automaticamente** quando houver chamados fechados a exportar (hoje é manual pelo painel; sem chamados fechados a rota responde 400 com mensagem informativa).

## §25 — 11/08/2026 — Auditoria de segurança completa + endurecimento (sessões, uploads, tokens)

Auditoria read-only dos 3 agentes (server.ts, db/backup/minio, frontend) + greps manuais. **Nada de RCE, SQLi ou SSRF de host**; auth JWT, cookies, uploads com magic bytes e backups HMAC já estavam sólidos. Correções aplicadas nesta sessão:

- **Sessões (server.ts)**:
  - `refresh_sessions.json` agora criptografa o `supabaseToken` **at-rest** (AES-256-GCM, chave derivada do `JWT_SECRET` via sha256; formato `iv.tag.data` base64; legado em texto puro é aceito 1x e re-criptografado no próximo persist).
  - **Teto absoluto da sessão = 30 dias** (`REFRESH_MAX_AGE_MS`): o refresh token continua rotacionando (7d rolante), mas a sessão expira 30d após a criação (`createdAt` persistido) — acabou a "sessão perpétua".
  - **Logout revoga o access token**: o `jti` vai para `revokedJtis` (persistido) e sai de `jtiSessions` — `authenticateUser`/`optionalAuthenticateUser`/`/api/auth/me` rejeitam JTIs revogados (antes o token valia 24h mesmo após logout). Logout aceita cookie OU `Authorization` (mesmo fallback do authenticateUser).
  - **Poda de `usedRefreshTokens`**: agora `Map<token, timestamp>` com retenção de 30d e teto de 10.000 itens (o arquivo não infla para sempre).
  - `verifyJWT` com **`crypto.timingSafeEqual`** (assinatura HS256 sem timing side-channel).
- **Tokens de moderação (db.ts)**: gerados com `crypto.randomBytes(6).toString("hex")` (48 bits, CSPRNG) no lugar de `Math.random().toString(36).substring(2,8)` (~31 bits previsíveis).
- **Rate limits (rateLimiter.ts + server.ts)**:
  - Moderação do Fênix Social (`/api/fenix-social/moderacao*`): novo limiter 30 ações/15min por IP (`fenixModeracaoRateLimiter`).
  - Ouvidoria: o rate limit custom usava `X-Forwarded-For` (spoofável) → agora usa **`req.ip`** (respeita trust proxy configurado).
- **Uploads — magic bytes (server.ts)**:
  - `saveBase64MediaFile` (Fênix Social, usuário autenticado): o conteúdo REAL precisa ser imagem/vídeo pela assinatura (JPEG/PNG/GIF/WEBP/MP4/WEBM) e da mesma família declarada; HTML/SVG disfarçado de PNG → 400 (testado: fake → 400, PNG real → 200).
  - `/api/admin/upload-file`: mesma verificação para tipos com assinatura conhecida (imagem/vídeo/PDF); outros (`txt`/octet-stream) seguem permitidos (provas usam `application/octet-stream`).
  - **Entropia das chaves de upload**: `Math.floor(Math.random()*1000)` → `crypto.randomBytes(4).toString("hex")` nas 3 rotas (admin upload-file, fallback de disco, `/api/minio/upload`) — keys de objeto deixam de ser previsíveis (capacidade de acesso a streams públicos menos enumerável).
- **Comentário do Fênix Social**: limite de 2.000 caracteres no servidor (antes só `stripTags`, payload de até 10MB caía no banco).
- **Erros admin**: `vimeo/me`, `vimeo/my-videos` não expõem mais `err.message` cru (log server-side, resposta genérica; support-users já era genérico).
- **Frontend**:
  - `store.ts`: fallback offline do `fetchUser` só marca `loggedIn` com token de formato JWT válido e `exp` no futuro (`looksLikeValidJwt`) — token forjado não loga mais.
  - `ConteudosView.tsx`: `handleDownload` só navega para `http(s)/caminhos relativos` (nunca `javascript:`/`data:`), e o link ganhou `rel="noopener noreferrer"`.
- **db.ts**: `getSupabaseTrustedClient` emite `console.warn` se cair no fallback anon sem `SERVICE_ROLE_KEY` (deploy mal configurado deixa de ser silencioso); `saveOuvidoriaMessage` retém só as **2000 mensagens mais recentes** (config JSONB não cresce sem teto).
- **Bug fix (pré-existente descoberto na auditoria)**: `rejectFenixPost` (moderação "recusar") lia colunas camelCase da row crua do Supabase (`mediaUrls`/`mediaUrl`) mas as colunas são `media_url`/`media_urls` → 500 `Cannot read properties of undefined (reading 'startsWith')` ao recusar; agora aceita ambos os formatos e a rota ignora entradas `undefined` (testado: recusar → 200).
- **Achados NÃO corrigidos (decisões/documentados)**:
  - `stream`/`preview` públicos continuam (mídia de conteúdo é pública por design — logos/banners/aulas da escola; vídeos pagos vivem no Vimeo). Mitigação parcial: keys agora imprevisíveis.
  - `materiais` privados (`is_public:false`) visíveis a qualquer D.I. logado em `/api/content/restricted` — **por design** (área de membros = todos os D.I.s); recomendação: filtrar `is_public` na rota pública se quiser esconder metadados de visitantes.
  - Likes/comentários sem auth (spam limitado por rate limit) — design atual do Fênix Social.
  - Backups contêm `minioConfig`/`vimeoConfig` com credenciais em claro (necessário p/ restore de conexões); mitigação: bucket + guardas `isBackupFamilyKey` + HMAC.
  - Fallback HMAC `"fenix-backup-hmac-local"` e reuso de `JWT_SECRET` — só ativos sem env (impossível em prod, que aborta sem `JWT_SECRET`).
  - Saves "legadas" sem HMAC aceitas com sha256 sem segredo (restore é admin-only; buckets com credencial admin comprometida já é perda total).
  - CSP desligado (Helmet) — documentado; sem `dangerouslySetInnerHTML` no client, risco residual baixo.
  - Token de acesso devolvido no corpo do login (o client mantém em `localStorage`) — migração total para cookie httpOnly seria quebra de compat (iframe/3rd-party cookies); mitigado por revogação de jti no logout.
- **Validado 11/08**: `npx tsc --noEmit` limpo (só ErrorBoundary pré-existente); `npm run build` OK; `val-privacidade.cjs` 29/29; `val-regras.cjs` **39 OK / 0 FALHOU** (1ª rodada teve 429 de rate limit por excesso de logins nos testes — rerun após a janela passou tudo); `pw-check.cjs` 19/19; fluxos manuais: logout revoga access token (jti), magic bytes (HTML→400 / PNG→200), recusar post→200.

## §26 — 11/08/2026 — Exposição de dados no frontend: materiais protegidos, JWT sem identificadores, mídias sem download

Análise de exposição do bundle `dist/assets` + mapa de rotas + estado real do Supabase (1 material público, 0 posts, 13 configs). **Antes**: códigos D.I. reais hardcoded no bundle (mock data do AdminView), PDF do material baixável anonimamente (HTTP 200 sem sessão), mídias do Fênix Social baixáveis, `code`/email no payload do JWT (decodificável), IDs Vimeo de exemplo no bundle. Bundle já não continha URL do Supabase, sourcemaps nem senhas.

- **Fix A — códigos D.I. fora do bundle** (`AdminView.tsx`, 2 blocos de mock data ~linhas 144/2404): `DI-654321`…`DI-991024`/`DI-ADMIN-123456` → `DI-000000…DI-000004`/`DI-ADMIN-000000`. O código ativo do prod (`DI-654321`) **saiu do bundle** (grep após build: zero `DI-\d{6}` reais).
- **Fix B — mídias de materiais protegidas por sessão** (`server.ts`):
  - Novo `isMaterialMediaAllowed(req, res)`: vale cookie httpOnly `access_token` **ou** `Authorization: Bearer` (mesmo fallback do `authenticateUser`, para `<img>`/`<video>`/`<a href>` seguirem funcionando); usa `verifyJWT` + `revokedJtis` + `handleRefreshFlow`. Loopback (próprio servidor) passa **somente** com header interno `X-Internal-Ffmpeg: 1`, que o ffmpeg do remux HLS agora envia (`-headers`).
  - Guarda aplicada em `preview`, `stream` e `hls master.m3u8` quando a chave começa com `materiais/`: **anônimo recebe o mesmo 404 de arquivo inexistente** (não revela existência). Backup families continuam 404 incondicional.
  - **Rota de download real**: `POST /api/content/download/:id` (antes só incrementava contador) agora **entrega o arquivo** — parse do `fileUrl`, validações de chave (500/`..`/`\`), `statObject`, MIME por extensão (servidor), `Content-Disposition: attachment` com título sanitizado, suporte a `/uploads/` (sendFile) — tudo atrás do `authenticateUser` (anônimo = 401). `db.ts`: novo `getMaterialById`.
  - **Frontend** (`ConteudosView.tsx`): `handleDownload` agora faz `fetch(fileUrl, {credentials:"same-origin", Authorization: Bearer se token})` → blob → download via objectURL (o href direto morria 404/401 sem cookie).
  - **Fix B2**: thumbnail do material movida de `materiais/` (agora protegida) para pasta pública **`materiais-thumbs/`** (copyObject no MinIO + `UPDATE materiais.thumbnail` no Supabase) — capa continua visível na home sem quebrar.
- **Fix C — Fênix Social com download bloqueado** (decisão do usuário: público, mas **só visualização**):
  - Servidor: mídias `fenix_social/*` são **sempre inline** (sem `Content-Disposition: attachment`), mesmo com extensão fora do allowlist — validação com objeto `.bin` de teste (200 sem attachment; removido).
  - Front: `draggable={false}`, `onContextMenu` bloqueado, `controlsList="nodownload"` em `FenixSocialView` (feed + lightbox), `FenixMediaCarousel` (lightbox + thumbs) e `CustomVideoPlayer`.
- **Fix D — JWT sem `code`/email** (`server.ts`): payload do JWT agora é só `{ role, name, jti, exp }`. O `code` (e o `supabaseToken`) ficam **somente no servidor**, resolvidos via `jtiSessions` (`getJtiSession`, adiciona `code` ao registro — mesmo padrão do supabaseToken). Login (DI e email) chama `registerJtiSession(supabaseToken, userCode)`; `authenticateUser`/`optionalAuthenticateUser`/`/api/auth/me` resolvem o code pela sessão — **isolamento de tickets/auditoria por código continua funcionando sem transportar o código no token**. Verificado: payload = `role,name,jti,exp` (sem code/email), `/api/auth/me` segue devolvendo o code do próprio usuário.
- **Fix E — IDs Vimeo de exemplo fora do bundle** (`AdminView.tsx`): `videoUrl` de exemplo `vimeo.com/76979871` → `""`; placeholder `987654321` → `123456789` (com `<iframe>` escapado).
- **Credenciais MinIO** (decisão do usuário: o app ainda é só dev, a chave **não vazou** — objetivo é não expor quando subir): varredura total — credenciais só no `.env` (ignorado por `.gitignore`). **Anonimizados**: `dev-tools/fix-db.cjs` e `dev-tools/patch.cjs` agora leem `process.env.MINIO_ACCESS_KEY/SECRET_KEY` (com `dotenv` carregando o `.env` do projeto); `dev-tools/tail.txt` (log com creds) **deletado**; `data/db.json` (recriação local com creds) **deletado** — Supabase é a única fonte, `SUPABASE_ONLY=1`. Rotação de chave via console MinIO (9001) fica documentada como procedimento manual (a credencial atual não é admin — não dá para automatizar).
- **Checklist de produção (quando subir)**: `.env` **nunca** vai para o repositório/deploy (criar no servidor); `TRUST_PROXY=1` atrás do proxy Hostinger; rodar `npm audit`; criar usuário dedicado `fenix-app` no MinIO com policy restrita ao bucket `armazenamento` e desabilitar a chave atual; pensar em migrar o token do corpo do login para cookie-only.
- **Validado 11/08 (noite)**: `tsc` limpo (só ErrorBoundary), `build` OK (`dist/server.cjs` 265.1kb); **`val-privacidade.cjs` 39 OK / 0 FALHOU** (10 casos novos: preview/stream/hls de `materiais/` anônimo = 404 idêntico, thumb pública 200, material com sessão D.I. = 200, download real 200 + 401 sem sessão, JWT sem code/email); testes manuais: login DI → JWT `role,name,jti,exp`, download PDF real (`FOLDER…SQUEEZE.pdf`, 5.5MB, attachment), `fenix_social/` inline, curso/capa públicos intactos, `/api/content/public` 2 cursos + 1 material.

---

## 27. Auditoria de segurança ao vivo + JWT_SECRET dinâmico + stripTags em suporte (11/08/2026, madrugada)

- **Dev-server.bat sem secret estático**: `JWT_SECRET` era uma string fixa (41 chars), igual em toda máquina (se conhecida, forjaria JWTs em qualquer dev). Agora o `dev-server.bat` gera um valor aleatório (2 GUIDs) na primeira execução e persiste em `data/.dev-jwt-secret` (gitignorado) — **estável entre restarts** (sessões não expiram), único por máquina. Se o arquivo for apagado, o secret muda e as sessões locais expiram uma vez (re-login). Produção inalterada (só `.env`).
- **Fix: XSS armazenado em tickets de suporte** (`server.ts`): `POST /api/support/tickets` gravava `assunto`/`texto` com HTML cru (ex.: `<script>alert(1)</script>`, `<img onerror=…>`, `<a href="javascript:…">`). Agora `stripTags()` (mesma sanitização de ouvidoria/Fênix Social) é aplicada em `assunto`+`texto` no create e em `texto` em `/api/support/tickets/:id/mensagens`. O React já escapava na renderização (não era explorável), mas o conteúdo também alimenta o PDF do backup de suporte — defesa em profundidade. **Validação**: ticket com payload XSS → armazenado limpo (`Assunto XSS`, texto `link corpo`); tickets de teste removidos via PATCH service_role (`supportTickets` de volta a 0).
- **Bateria de probes ao vivo (dev)**: login admin local e D.I. (cookies `HttpOnly` + `SameSite=Strict`, sem `Secure` em dev — documentado), host gates (admin API 403 no host público / 200 no `adminfenix.*` / `/adminfenix` 302 / SPA inválida 302 / subdomínio `suporte.` bloqueia `/api/admin`), upload (HTML mascarado de PNG → 400 por magic bytes; folder traversal e fora da allowlist → 400), HLS (hash inválido 400, segmento inexistente 404, traversal 400), `/api/uploads` traversal 404, moderação (anônimo 403 com ou sem `?token=` na URL; header falso 403; admin 200 por desenho), famílias de backup 404 incondicional, `materiais/` anônimo 404, `/api/vimeo/info` 401, **rotação de refresh com detecção de replay** (token reusado → revoga a sessão), jti revogado no logout (Bearer também), brute-force de login → 429. **Rodada final 39/39** (failures intermediárias eram artefatos de ordem/jar de cookie do próprio probe, não do app).
- **RLS verificado AO VIVO com a chave anon** (`dev-tools/rls-live-check.mjs`): `config` expõe só as 5 chaves públicas (minioConfig/vimeoConfig/diCodes/moderatorLinks/ouvidoriaMessages invisíveis), `materiais` só `is_public`, INSERT/SELECT `audit_logs` negados, INSERT `fenix_posts` negado + SELECT só `aprovado`, `moderator_links` invisível. Nota: a tabela `ouvidoria_messages` nega INSERT para anon — **sem impacto**: o app grava ouvidoria na config `ouvidoriaMessages` com service_role (a tabela é vestigial; a negação é até mais restritiva que o grant planejado na v2 do script).
- **Estado final**: integridade do MinIO **9/9 presentes, 0 ausentes, 0 órfãos** (o 8/9 transitório durante o `val-regras` era o delta criado pelo próprio teste); `val-regras` **39 OK / 0 FALHOU** (com backup+dump+restore round-trip; estado 2/1/0 preservado); `tsc --noEmit` limpo (só ErrorBoundary pré-existente); `npm run build` OK (`dist/server.cjs` 265.1kb). Limpeza de dados de teste concluída.

## 28. Suporte + ouvidoria unificados: inbox com leads em prioridade + notificações por e-mail (SMTP) (11/08/2026, sessão 11/08)

União do suporte (chamados D.I.) com a caixa de contatos da ouvidoria dentro do painel dos atendentes, e envio real de e-mails opcional via SMTP. **Nada quebra se o e-mail falhar**: o envio é fire-and-forget e credenciais vivem só no `.env` do servidor.

- **Inbox unificado (`SupportApp.tsx` + `GET /api/support/inbox`)**: a fila do subdomínio `suporte.` mostra **leads "Quero Fazer Parte" no topo com badge PRIORIDADE** (dourado) e depois os chamados de suporte. Abas da fila: `Todos | Leads · Prioridade | Chamados`; cards de estatísticas novos "Leads pendentes" e "Leads (Quero Fazer Parte)"; busca cobre leads (`nome/email/telefone/tipoParceria/cidade/estado/pais`). Detalhe do lead: dados de contato com **botão "Abrir WhatsApp"** (`https://wa.me/55` + dígitos normalizados; nº com até 11 dígitos ganha prefixo `55`), `mailto:`, localização, mensagem e status (`pendente/lida/resolvida/arquivada`) via `PUT /api/support/ouvidoria/:id/status` (só staff; `authenticateUser` + `isSupportStaffRole`). Rota de inbox exige staff (admin/técnico) — D.I. recebe 403; sem auth 401.
- **Admin = só configuração**: aba **"Ouvidoria" removida do painel** (item do `Sidebar`, JSX da caixa de entrada e handlers excluídos; rotas antigas `/api/admin/ouvidoria/*` permanecem por compatibilidade — mensagens históricas continuam na config `ouvidoriaMessages`). A aba **"Suporte"** ganhou o card **"Notificações por E-mail"**: destinos `emailSuporte`/`emailParcerias`, **2 toggles independentes** (`notifySuporteEmail` para novos chamados, `notifyParceriaEmail` para novos leads — default OFF), status SMTP (host/porta/user mascarado, sem segredos) e botão "Enviar e-mail de teste". Rotas novas `requireAdmin`: `GET/POST /api/admin/support/email-config` (valida e persiste via `updateOuvidoriaConfig`, que agora também grava os booleans) e `POST /api/admin/support/email-test` (usa o destino de suporte configurado; 400 informativo sem SMTP).
- **`mailService.ts` (novo, nodemailer)**: envs `SMTP_HOST`, `SMTP_PORT` (padrão 465), `SMTP_SECURE` (padrão: 465=SSL, 587=STARTTLS; `"true"/"false"` sobrepõe), `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM_NAME`. `sendEmail` é **fire-and-forget** — falha/ausência de SMTP NUNCA quebra a API ou o formulário (log `[E-mail][SKIPPED]`/`[OK]`/`[ERRO]` com destinatário mascarado, ex. `su***@grupofenix.com`); sem SMTP configurado, nenhum envio é tentado e a plataforma funciona como antes. Corpo do e-mail: HTML sanitizado com `escapeHtml` (conteúdo de usuário é sempre escapado; anti HTML injection no e-mail).
- **Disparos (somente na abertura)**: ticket criado (`POST /api/support/tickets`) com `notifySuporteEmail` → e-mail com assunto #NNNN + mensagem inicial + dados do D.I.; lead de parceria (`POST /api/ouvidoria/submit`) com `notifyParceriaEmail` → e-mail com nome/e-mail/**WhatsApp em destaque + link wa.me**. Atendimento continua 100% no sistema (tickets) e fora do sistema para leads (WhatsApp/e-mail) — e-mails são notificação inicial, sem auto-responder.
- **WhatsApp obrigatório/validado para parceria**: `POST /api/ouvidoria/submit` passou a exigir telefone com **10–13 dígitos após remover não-numéricos** (400 "informe um WhatsApp válido com DDD"); `QueroFazerParteModal` espelha a validação no cliente (label "WhatsApp (com DDD)" + selo "Contato prioritário").
- **Validação (11/08)**: probes `dev-tools/probe-inbox.cjs` **28 OK / 0 FALHOU** (host gates das rotas novas — `/api/admin/*` 403 fora do adminfenix, inbox 401 sem auth / 403 para D.I.; WhatsApp curto 400; lead criado pela API → aparece no inbox → status ida e volta; config salva/persiste/reverte; email-test 400 informativo; ticket aberto com toggle ON não quebra sem SMTP — log `[E-mail][SKIPPED]`); limpeza via `dev-tools/cleanup-probe-inbox.cjs` (PATCH service_role: `supportTickets` e `ouvidoriaMessages` de volta ao estado); Playwright `dev-tools/pw-inbox-check.cjs` **13 OK / 0 FALHOU** (home, painel suporte com leads, admin sem aba Ouvidoria, card de e-mails com toggles e status SMTP); `val-regras` **39/0** e `val-privacidade` **39/0** inalterados; `tsc --noEmit` só ErrorBoundary; `npm run build` OK (`dist/server.cjs` 277.8kb com nodemailer). **Atenção**: baterias de probe usam login admin — aguardar o rate limit de 10/15min entre rodadas ou reiniciar o servidor (in-memory).
- **Produção (Hostinger)**: `smtp.hostinger.com` (Titan: `smtp.titan.email`), 465 SSL ou 587 STARTTLS, usuário = e-mail completo da caixa; para não cair em spam, configurar SPF (`v=spf1 include:_spf.mail.hostinger.com ~all`), DKIM e DMARC no DNS do domínio remetente.

## 29. Suporte simplificado: lista única + modais + "Interessados" + avisos de mensagens novas (11/08/2026, noite)

Decisão do usuário: quem envia "Quero Fazer Parte" **não é "Lead" nem "parceiro" — são futuros integrantes do Grupo Fênix**. Termo de exibição em toda a interface: **"Interessados"** (nome técnico interno permanece `leads`/`parceria` em rotas, config e JSON — sem migração).

- **Layout do painel `suporte.` simplificado (`SupportApp.tsx`)**: removidos os cards de estatísticas e o split lista+detalhe. Agora é **lista única de largura total** (busca + abas `Todos | Interessados · Prioridade | Chamados`): seção "Interessados — Quero Fazer Parte" **sempre no topo em destaque** (contêiner com borda/badge dourado `PRIORIDADE`, preview com telefone verde + prévia da mensagem) e "Chamados de suporte (D.I.)" logo abaixo (com prévia da última mensagem).
- **Tudo em modal** (AnimatePresence-free, overlay fixo + Esc/fundo para fechar + trava de scroll): **Interessado** — nome/tipo/status/data, **telefone em destaque (mono grande)** com ações **Ligar (`tel:`)/Copiar/Adicionar contato (.vcf baixável)** + WhatsApp + e-mail (com copiar), localização, mensagem completa, botão **"Entrar em contato (WhatsApp)"**, rodapé com status (`pendente/lida/resolvida/arquivada`). **Chamado** — thread completa + campo de resposta (Ctrl+Enter) + **botão "Encerrar Chamado"** em destaque (status `fechado`; com aviso "Chamado encerrado" e **"Reabrir"** quando fechado/resolvido).
- **Avisos de mensagens novas (casos em aberto)**: polling do inbox **a cada 30s** + refetch imediato ao ganhar foco/`visibilitychange`; controle `lastSeenAt` por item **em memória da sessão** (semeado no login — sem badge em massa ao reabrir). Badges: `Nova`/`1 nova(s)` no item, contadores na aba e no cabeçalho da seção, **toast "🔔 Nova mensagem recebida"** quando chega algo durante a sessão; thread do modal aberto é sincronizado com os dados frescos a cada poll.
- **Renome nos textos visíveis**: painel suporte, admin (aba Suporte: "Notificar novos interessados", "Destino — Interessados 'Quero Fazer Parte'", textos explicativos), e-mails (`Novo interessado — Quero Fazer Parte`), audit/toast (`Status do interessado alterado para "…"`), busca ("…ou interessado"). Internos/API intactos: `GET /api/support/inbox` continua expondo `leads`/`counts.leads*`; `notifyParceriaEmail`; `tipo: "parceria"`.
- **Validação (11/08, noite)**: `node dev-tools/pw-inbox-check.cjs` (reescrito: 40 checks E2E com Playwright) **40 OK / 0 FALHOU** — interessado criado via API aparece na lista; modal com telefone/ações de contato/mensagem; D.I. responde chamado aberto → badge "1 nova" + toast após refetch; thread atualizado; **Encerrar Chamado** → chip Fechado + aviso + Reabrir; admin sem Ouvidoria + card de e-mails com toggles; `node dev-tools/cleanup-probe-inbox.cjs` (agora também remove `PW Interessado`/`PW Ticket*`); `probe-inbox.cjs` **28/0**; `val-regras` **39/0**; `val-privacidade` **39/0**; `tsc` só ErrorBoundary; `npm run build` OK (277.8kb). Atenção ao rate limit de login (10/15min) — reiniciar o servidor entre baterias.

## 30. Anexos no suporte (fotos/documentos no chat) (12/08/2026)

D.I. agora pode **anexar arquivos às mensagens do chamado** (até 5 por mensagem, 10 MB cada) e o atendente baixa pelo painel. Histórico continua imutável: anexos ficam dentro das mensagens do `supportTickets` (config) com metadados (id/nome/tamanhoKb/mime/key/storage/isImage); **o solicitante NUNCA baixa anexos — nem os que ele mesmo enviou** (Download do anexo = só staff). **ATUALIZADO (12/08, tarde — §31)**: regra revertida — **staff E D.I. dono do chamado baixam tudo**; 403 apenas para D.I. que não é dono nem staff.

- **Permitidos**: imagens JPG/PNG/WebP, PDF e Office (doc/docx/xls/xlsx). Dupla validação no servidor: **extensão** (`SUPPORT_ANEXO_EXT`) + **sniff de magic bytes** (`sniffSupportAnexo`: `ÿØÿ`→jpeg, `89 50 4E 47`→png, `RIFF....WEBP`, `%PDF-`, `PK`→ZIP/docx/xlsx, `D0 CF 11 E0`→OLE/doc/xls). Arquivo com extensão proibida **ou** conteúdo corrompido → **400** sem gravar nada.
- **Rotas** (`server.ts`, logo após o status do interessado): `POST /api/support/tickets/:id/anexos` (multipart `files[]` + campo `texto` opcional; `uploadRateLimiter` + `authenticateUser`; multer memória 10 MB × 5; staff responde ou D.I. dono anexa — D.I. de outro chamado → 403; sem arquivos nem texto → 400; só texto também cria mensagem) e `GET /api/support/tickets/:id/anexos/:anexoId` (**staff ou D.I. dono** (12/08, tarde — §31); 404 para anexo/chamado inexistente; imagens servidas `inline` (preview direto no navegador), demais `attachment`; `?download=1` força attachment até em imagem; filename sanitizado, sem barras/aspas).
- **Armazenamento**: MinIO na pasta **`suporte-anexos/<ticketId>/`** (`Content-Type` real do sniff), com fallback local `data/suporte-anexos/` (fora do `public/`, servido só pela rota do staff). Chave `localPath` + `storage: "minio"|"local"` nas novas interfaces `SupportAnexo` (`src/types.ts` e `src/server/db.ts`).
- **Privacidade**: pasta **`suporte-anexos/` adicionada às famílias protegidas** (`BACKUP_FAMILY_PREFIXES` em `server.ts`) — `/api/minio/stream`, `/preview` e `/hls` respondem **404 incondicional** (nem com token) para anexos. Validado com a chave real do anexo: anônimo e com cookie admin → 404 nos dois.
- **Frontend**: `SupportApp.tsx` (painel) — chips clicáveis por anexo na thread (ícone imagem/arquivo, nome, tamanho, MIME; link abre o download na aba). `SuporteClienteView.tsx` (D.I.) — chips **sem link** com cadeado (o download é da equipe) + **botão papel-clipe** no compositor (picker com os tipos permitidos, máx. 5, removível, preview de tamanho; envia via `attachSupportFiles` na store com `FormData` sem `Content-Type` manual — o fetch define o boundary). **ATUALIZADO (12/08, tarde — §31)**: chips do D.I. agora **baixáveis** (anchor com `?download=1`, sem cadeado); papel-clipe também no form de **novo chamado** (anexos vão na primeira mensagem via `createSupportTicket(assunto, texto, files?)` → FormData).
- **Robustez**: `addSupportMessage` (`db.ts`) faz push no array (cópia local, nunca muta o cache) e **deduplica ids** de mensagem e de anexos contra os já existentes no chamado (while-collision); `persistSupportTickets` segue gravando com service_role.
- **Validação (12/08)**: `node dev-tools/probe-anexos.cjs` **26 OK / 0 FAIL** (ciclo completo 2×; logins admin + 2 D.I.s; cria chamado "Probe Anexos"; vazio→400; `.txt` com magic PNG→400; PDF corrompido→400; upload PNG+docx+texto→200 com 2 anexos; só-texto→200; DI baixa→403; staff baixa PNG 200 + magic + `image/png` + inline; `?download=1`→attachment; docx attachment + PK magic; anexoId inexistente→404; stream/preview com e sem token→404; DI2 no chamado de DI1→403). `cleanup-probe-inbox.cjs` estendido: remove tickets `Probe Anexos` + **objetos MinIO `suporte-anexos/*` + arquivos locais `data/suporte-anexos/*`** (endpoint da config vem com esquema e porta embutidos — parse `host:port` para o cliente MinIO). Render web nas 3 origens (playwright) sem 404/pageerror; `tsc` só ErrorBoundary; `npm run build` OK (dist\server.cjs 284.9kb). Regressões `val-regras`/`val-privacidade`: aguardar o rate limit de login expirar (10/15min por IP — a bateria de probes consumiu a janela).

## 31. Suporte minimalista + arquivamento automático + compactador de imagens (12/08/2026, tarde)

Continuando a sessão 12/08 (após §30), o painel `suporte.` ganhou **UI minimalista**, os itens encerrados **arquivam automaticamente** para a aba **Arquivados**, e os anexos de imagem passam por **compactação com sharp** no upload (tanto nas respostas quanto no create-ticket).

### Download dos anexos — regra final (12/08, tarde)

- **Quem baixa**: staff **E** o D.I. dono do chamado (`ticket.criadoPor === req.user.code`). D.I. que não é dono → **403**. Anônimo → 401. Anexo/chamado inexistente → 404 idêntico.
- Validado por probe: dono 200 (inline sem `?download=1`, attachment com), DI2 403, staff 200, conteúdo com magic bytes do **MIME armazenado** (imagem pode ter virado WebP pós-compressão).

### Compactador de imagem (sharp) — `compressSupportImage` + `buildSupportAnexosFromFiles`

- JPG/JPEG → **JPEG q80 (mozjpeg)**; PNG/WebP → **WebP q85**; **resize máx. 1920px** (`fit: inside`, sem ampliar).
- **Garantia anti-degradação**: o original é mantido se o comprimido ficar **maior** (`out.length < buffer.length` senão `null`). O MIME armazenado reflete o formato final (ex.: PNG → `image/webp`), o nome do arquivo continua o original; download serve com `Content-Type` do MIME real.
- `sharp` é dependência nativa — **`--packages=external` no build** (`esbuild` no `npm run build`): a lib fica no `node_modules` do servidor (runtime), não é bundlada no `dist/server.cjs` (`require("sharp")` lazy dentro da função).

### Upload no create-ticket

- `POST /api/support/tickets` agora usa `supportAnexoMulter.array("files", 5)` (multer ignora corpo JSON → compat plena com o front antigo). Anexos caem na **primeira mensagem** do chamado via `db.createSupportTicket({ assunto, texto, anexos? })`.
- `SuporteClienteView`: botão "Anexar arquivos" no form de novo chamado (mesmos limites: 5 arquivos, 10 MB, tipos permitidos) → `createSupportTicket(assunto, texto, files?)` na store monta FormData quando há arquivos.
- `server.ts`: o multer do suporte foi **hoistado** para antes da rota de create (erro TS2448 "used before declaration" na 1ª rodada de `tsc`).

### Arquivamento automático (filtro de exibição — sem migração de dados)

- **Tickets**: `fechado | resolvido | arquivado` são **terminais** (`isTerminalTicket`) → label "Encerrado", cor neutra e **fora da caixa ativa**; só aparecem na aba **Arquivados** (`STATUS_FILTERS` virou `Ativos | Arquivados`). Reabrir (`aberto`) devolve para a caixa ativa. Status interno/enum **não muda** — nada foi migrado.
- **Interessados**: caixa ativa mostra apenas `pendente` (novo) + `lida` (em andamento); `arquivada | resolvida` só na aba Arquivados. Rodapé do modal virou **Já contatei** (`lida`) / **Arquivar** (`arquivada`) / **Desarquivar** (`lida`, volta à caixa) — removidos os 4 chips de status antigos.
- `GET /api/support/inbox` expõe `counts.leadsEmAndamento` (= `lida`) e `counts.leadsArquivados` (= `arquivada`+`resolvida`).

### UI minimalista do painel (SupportApp.tsx)

- Cards de chamados/interessados **menores** (py-2.5, avatar 36px, sem prévia longa da mensagem, chip de status do card de interessado removido).
- Modal de chamado: **removidos** os botões "Em andamento" e "Resolver" — ficam **Encerrar Chamado** (→ `fechado`) e **Reabrir**. Compositor do staff: **papel-clipe** (anexos na resposta via `attachSupportFiles`, até 5, prévia com tamanho e remoção) + atalho **"Pedir arquivo"** (preenche o texto pedindo o anexo).
- Modal de interessado: chip de status do header removido (mantém badge Prioridade), telefone `text-lg` (era 2xl), **removidos** Ligar (`tel:`) e Adicionar contato (`.vcf`) — restam Copiar, WhatsApp (wa.me) e e-mail; `downloadVCard` apagado.
- Botão "Anexar" do compositor habilita o envio mesmo sem texto (`!replyText.trim() && staffFiles.length === 0` desabilita).
- SuporteClienteView: `STATUS_LABEL` de `resolvido`/`fechado` → "Encerrado" (consistência).

### Validação (12/08, tarde)

- `npx tsc --noEmit`: só os erros pré-existentes do `ErrorBoundary.tsx`.
- `npm run build`: OK (vite + esbuild; dist\server.cjs 286.8kb, sharp externo).
- `dev-tools/probe-anexos.cjs` **reescrito**: DI dono download → 200 + magic do MIME armazenado + `?download=1`→attachment; DI2 → 403; staff 200; criação de chamado **com arquivo já no create** (PNG 2500×2000 via sharp): anexo na 1ª mensagem, `mime === "image/webp"`, `tamanhoKb < original` (compressão menor), download → sharp.metadata `width/height ≤ 1920`, DI2 → 403; guardas de stream/preview mantidas.
- `dev-tools/probe-inbox.cjs`: asserts de `counts.leadsEmAndamento`/`leadsArquivados` nas transições `lida`→`arquivada`→`pendente`.
- Pendente de rodada (rate limit de login 10/15min por IP): render Playwright nas 3 origens, `val-regras.cjs`, `val-privacidade.cjs` e rodada completa dos probes ao vivo.

## 32. Sessões jti persistidas + guarda anti-órfão + anti-crash do painel de suporte (12/08/2026, noite)

Incidente reportado pelo usuário: **"ticket da área do D.I. sumiu"** + **TypeError `Cannot read properties of undefined (reading 'length')` ao carregar a página de suporte**.

### Causa raiz — sessão "logada sem código" após restart do servidor

- O JWT local carrega só `{ role, name, jti }` (§26); o `code` D.I. e o `supabaseToken` ficam no mapa **em memória** `jtiSessions` (`server.ts`).
- `refreshSessions` é persistido em `data/refresh_sessions.json`, mas o mapa `jti` **não** era → um restart derrubava o mapeamento das sessões já logadas. O JWT (24h) continuava **válido** (assinatura OK), `getJtiSession` voltava `undefined` e `authenticateUser` seguia com `req.user.code = undefined` **sem erro**.
- Consequência no suporte:
  1. `GET /api/support/tickets` filtra D.I. por `t.criadoPor === req.user?.code` (server.ts:2528) → com code `undefined`, **nenhum ticket do dono aparecia** → "meu ticket sumiu".
  2. O ticket criado nesse estado era gravado com `criadoPor` ausente (JSON descarta `undefined`) → **órfão permanente**: com sessão correta, `undefined === "DI-123456"` é `false`, então o ticket **nunca mais volta** para a lista do dono (fica visível só ao staff).
  3. Ticket órfão quebrava o painel `suporte.`: `avatarColorOf(t.criadoPor)` faz `code.length` com `code = undefined` → **TypeError "reading 'length'"** e o render inteiro da lista caía.

### Correções

- **Persistência das sessões jti** (`server.ts`): `data/jti_sessions.json` (mesmo padrão do `refresh_sessions.json` — `supabaseToken` criptografado at-rest com AES-256-GCM derivado do `JWT_SECRET`). `loadJtiSessionsFromDisk()` no boot (prune de expirados); `persistJtiSessions()` no register/prune/expiração/logout/revogação.
- **Recuperação automática** em `authenticateUser`/`optionalAuthenticateUser`: JWT válido mas jti sem sessão → tenta `handleRefreshFlow` (rotaciona access token e **re-registra** o jti com code/supabaseToken vindos da sessão de refresh persistida) → o usuário não perde a sessão nem precisa re-login.
- **Guarda anti-órfão** nos POSTs de suporte do D.I. (create, mensagens, status, reabrir, anexos): `req.user?.code` ausente → **401 "Sessão expirada. Faça login novamente."** — nunca mais grava ticket/mensagem sem dono (validação: JWT forjado com jti não registrado → 401, nada gravado no banco).
- **Anti-crash no front**: `avatarColorOf(t.criadoPor || t.criadoPorNome || "?")` (SupportApp: lista, modal, thread — eram `avatarColorOf(t.criadoPor)` puro); `(t.mensagens || [])` nos usos sem guarda de `mensagens` (SupportApp `.some`/`.filter`/`.length`; SuporteClienteView `.length`) — qualquer ticket com shape legado/incompleto renderiza sem derrubar a página.

### Regra permanente do usuário — imutabilidade do conteúdo

- **Nenhum conteúdo do site pode ser apagado, sobrescrito ou alterado** — tickets de suporte, D.I.s cadastrados, cursos, materiais, configs etc. ficam **intactos sempre**. A única exceção: conteúdo que o **próprio admin excluir** via painel (esse pode ser removido). Todo o trabalho desta seção respeitou a regra: **zero alterações de dados** (o ticket órfão #2 "Teste" permanece como está — visível apenas ao staff).

### Validação (12/08, noite)

- `npx tsc --noEmit`: só os erros pré-existentes do `ErrorBoundary.tsx`.
- `npm run build`: OK (vite + esbuild; `dist/server.cjs` 289.6kb).
- **Continuidade de sessão** (novos scripts `dev-tools/val-sessao-parte1.cjs` / `val-sessao-parte2.cjs`): login DI → salvar JWT → **restart do servidor** → reusar o mesmo JWT: `/api/auth/me` segue devolvendo `code: "DI-123456"` e `/api/support/tickets` segue mostrando o ticket do dono. **5 OK / 0 FAIL** (antes do fix: code `undefined` e lista vazia).
- **Guarda anti-órfão**: JWT forjado (jti não registrado, secret do dev) em `POST /api/support/tickets` → **401**, banco inalterado.
- `dev-tools/probe-inbox.cjs` **32 OK / 0 FALHOU**; `cleanup-probe-inbox.cjs` OK (tickets de teste removidos; tickets reais #1 e #2 intactos no Supabase).
- `dev-tools/probe-anexos.cjs` **39 OK / 1 FAIL** na 1ª rodada ("pdf corrompido -> 400" recebeu 500 — flake de corrida), **40/0 na re-execução**; fluxo de anexos completo verde.
- Playwright **`dev-tools/pw-suporte-crash.cjs` 9 OK / 0 FALHOU**: painel `suporte.` renderiza com o ticket órfão (#2, `criadoPor` ausente) presente — **zero pageerror/TypeError** — e o modal do ticket órfão abre sem crash (era o cenário exato do erro do usuário).
- Playwright **`dev-tools/pw-suporte-di.cjs` 6 OK / 0 FALHOU**: fluxo real do D.I. (login pela home → menu Suporte) renderiza "Central de Suporte" e mostra o ticket #0001 do dono, sem pageerror.
- Dica para testes futuros: o rate limit de login é **10/15min por IP** (`src/server/rateLimiter.ts`) — probes com múltiplos logins precisam esperar a janela entre rodadas (429 no meio de um script não é bug do código).

## 33. Suporte como caixa de e-mail + realtime SSE + anexos download-only (12/08/2026)

Redesenho do suporte nos dois lados (painel do staff em `suporte.` e área do D.I. em `/suporte`) com navegação de caixa de e-mail em 3 colunas, atualização em tempo real e anexos protegidos. Sem alteração de dados (regra de imutabilidade do §32 mantida).

### Decisões do usuário (confirmadas)

- **Realtime = SSE + polling 30s de fallback** (não Socket.io); o painel refaz o fetch completo a cada evento (fonte única de verdade).
- **Anexos = download-only + lightbox interno**: imagem abre `<img>` e PDF `<iframe>` dentro do site; doc/docx/xls/xlsx só botão Baixar. Download nunca abre em aba nova (`target=_blank` abolido).
- **Redesign nos dois lados** (staff e D.I.), com setas de voltar sempre visíveis.
- **Layout 3 colunas**: pastas | lista | painel de leitura (padrão caixa de e-mail).

### Backend

- **SSE** (`server.ts`, antes das rotas de suporte): `const sseClients = new Set<import("express").Response>()` (tipo completo para não colidir com o `Response` global do fetch); `GET /api/support/realtime` exige `authenticateUser`, responde `text/event-stream`, heartbeat 25s (`id` sequencial), `retry: 5000`, remove o cliente em `res.on("close")`. **O evento `support-changed` não carrega dados** — cada cliente refaz o próprio fetch e o servidor filtra por papel/dono (sem vazamento de conteúdo entre D.I.s).
- **`publishSupportChange()`** disparado após sucesso em: create-ticket, `POST .../mensagens`, `POST .../anexos`, `POST .../status`, `POST .../reabrir`, `PUT /api/support/ouvidoria/:id/status` e `POST /api/ouvidoria/submit` (novo lead chega em tempo real no painel).
- **Texto obrigatório nas respostas**: `POST /api/support/tickets/:id/anexos` valida texto primeiro (400 "Escreva a mensagem.") e exige arquivo (400 "Envie pelo menos um arquivo."); o fallback "📎 Anexos" foi removido.
- **Download sempre attachment**: removida a exibição inline de imagem; `?download=1` permanece por compatibilidade, mas todas as respostas já são `Content-Disposition: attachment`.
- **Esc no front**: fecha o lightbox primeiro; sem lightbox, fecha o painel de leitura (antes fechava tudo junto).

### Frontend

- **`src/components/AnexoLightbox.tsx`** (novo): busca o binário com Bearer (`useStore.getState().token`), blob URL, `Esc`/fundo fecham, botão Baixar interno com `?download=1`, estados de loading/erro.
- **`SupportApp.tsx` reescrito** (staff): topbar fixa; sidebar de pastas **Entrada / Interessados·Prioridade / Chamados / Arquivados** com contadores + ícone Bell (notificações padronizadas); lista com busca + linhas (avatar, negrito quando não lido, ponto, hora, chip de status, 📎, badge Bell); painel de leitura com **← Voltar** sempre visível, thread em balões, anexos **Ver/Baixar**, composer obrigatório (Ctrl+Enter), **Encerrar/Reabrir**, painel de lead (telefone + Copiar/WhatsApp/e-mail + Já contatei/Arquivar/Desarquivar); mobile com chips de pastas; toast fixo; SSE + polling 30s + refetch ao focar.
- **`SuporteClienteView.tsx` reescrito** (D.I.): botão dourado **Novo chamado** (estilo Compor), abas **Abertos / Em andamento / Fechados**, lista com `#numero`, badge Bell + pontinho de não lido, prévia da última mensagem, thread com **← Voltar** (ArrowLeft), anexos Ver/Baixar, composer obrigatório, `lastSeen`/`seedSeen`/`markSeen`, toast "🔔 Nova mensagem do suporte", SSE + polling 30s + refetch ao focar.
- **markSeen**: agora avança sempre para `Date.now()` ao abrir (o badge limpa ao reabrir — antes só gravava se ausente).

### Validação (12/08)

- `npx tsc --noEmit`: só os erros pré-existentes do `ErrorBoundary.tsx`; `npm run build`: OK (`dist/server.cjs` 290.6kb).
- **`dev-tools/probe-anexos.cjs` 42 OK / 0 FAIL** (atualizado: anexo sem texto → 400 "Escreva a mensagem."; só-texto via `/anexos` → 400 "Envie pelo menos um arquivo."; staff E DI dono sempre `attachment`, com e sem `?download=1`).
- **`dev-tools/probe-realtime.cjs` (novo) 7 OK / 0 FAIL**: EventSource autenticado recebe `support-changed` após create e após mensagem (5s); chamado de teste removido ao final.
- **`dev-tools/pw-realtime-layout.cjs` (novo) 24 OK / 0 FALHOU** (E2E de 2 páginas): painel staff com 3 colunas sem modal; painel de leitura abre e ← Voltar retorna; anexo com Ver/Baixar (`?download=1`, sem `target=_blank`); lightbox abre imagem (blob) e Esc fecha sem fechar o painel; **realtime DI → staff e staff → DI via SSE sem refresh**; zero pageerror/404; chamado de teste removido ao final.
- **`dev-tools/pw-suporte-crash.cjs` 9 OK / 0 FALHOU** (atualizado para o novo layout: abre o ticket órfão #2 no painel de leitura) e **`dev-tools/pw-suporte-di.cjs` 6 OK / 0 FALHOU**.
- **`dev-tools/probe-inbox.cjs` 32 OK / 0 FALHOU** (re-rodada com a janela de rate limit zerada — os 17 FAIL da rodada anterior eram só 429 do login) e **`dev-tools/pw-inbox-check.cjs` 46 OK / 0 FALHOU** (reescrito para o novo layout: pastas da caixa de e-mail, painel de leitura do interessado com Copiar/WhatsApp/Já contatei/Arquivar, badge "1 nova" + toast via SSE sem refresh, Encerrar → chip Encerrado + Reabrir, ticket encerrado sai da Entrada e aparece em Arquivados, admin sem aba Ouvidoria + card de e-mails).
- Imutabilidade conferida após toda a bateria: **2 tickets reais intactos** no Supabase — #1 "Problema no Produto X" (DI-123456, 2 mensagens + anexo) e #2 "Teste" (órfão, `criadoPor` ausente, 2 mensagens). Todos os itens de probe (PW Ticket, PW Interessado, Probe E2E/Realtime/Anexos) removidos ao final.

## 34. ✅ Escola Fênix em 3 seções (Netflix) + status "Respondido" + logo 3x (12/08/2026)

### A. Status de resposta correto na área do D.I.
- **Causa**: o servidor marca `aguardando_resposta` quando o staff responde (`db.ts` addSupportMessage); o D.I. exibia o chip direto de `t.status`, então após resposta do suporte o chamado continuava "Aguardando resposta" (rótulo significava "aguardando o cliente" — confuso para o lado do D.I.).
- **Fix (exibição apenas, dados intactos)**: `SuporteClienteView.tsx` — `diStatusOf(t)` deriva o chip da **última mensagem**: fechado/resolvido → "Encerrado"; última mensagem `tipo:"suporte"` → **"Respondido"** (verde); senão → "Aguardando resposta". Aplicado na lista, no badge do thread e no rodapé ("Este chamado está..."). Staff (`SupportApp.tsx`) continua usando o status do servidor (inalterado). `STATUS_LABEL` removido do SuporteClienteView (sem uso).

### B. Logo do painel de suporte ~3x
- `SupportApp.tsx`: tela de login `max-h-20 max-w-[220px]` → `max-h-60 max-w-[660px]`; topbar `h-10 max-w-[160px]` → `h-30 max-w-[480px]`.

### C. Escola Fênix em 3 seções estilo Netflix (sem abas)
- **Modelo**: campo `secao: "cursos"|"series"|"treinamentos"` em `Curso` (`src/types.ts` + `src/server/db.ts`). **Derivação resiliente**: `normalizeSecao(c)` (db.ts) — prioriza `secao`; antes da migração SQL, deriva da `categoria` ("Séries"/"Treinamentos"). O form grava `categoria` = rótulo da seção, então o site funciona **mesmo sem o ALTER**.
- **Colunas novas (PASSO DO USUÁRIO)**: `dev-tools/escola-secoes.sql` — `ALTER TABLE cursos ADD COLUMN IF NOT EXISTS secao text NOT NULL DEFAULT 'cursos'; ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();` (idempotente, só adiciona colunas; colar no SQL Editor do Supabase). Sem isso: `secao` não persiste (o upsert de fallback descarta a coluna ausente — PGRST204) e `created_at` fica vazio (a home ainda ordena pelo id `c-<ts>`).
- **API**: `server.ts` — `/api/content/public` expõe `secao`; `POST /api/admin/cursos` aceita `secao` (fallback "cursos"); `saveCurso` (db.ts) grava `secao` + `created_at` com retry sem as colunas novas (pré-migração).
- **Cadastro (AdminView.tsx)**: input "Setor/Categoria" (texto livre) **removido** → select obrigatório **"Seção do Conteúdo"**: Cursos (várias aulas) / Séries (vídeo único) / Treinamentos (live gravada do Vimeo). Cursos → editor de módulos como antes; Séries/Treinamentos → form simplificado: campo **"Link do Vídeo (Vimeo/YouTube)"** + prévia de embed (reusa `parseVimeoInput`); ao salvar monta 1 módulo com 1 aula (id estável na edição; duração "1 Episódio"/"1 Treinamento"). Validação: link obrigatório em Séries/Treinamentos.
- **Catálogo (EscolaFenixView.tsx)**: substituiu grid+filtros por **linhas horizontais estilo Netflix** (Cursos / Séries / Treinamentos — cada seção com título, contagem e scroll lateral `overflow-x-auto` + snap); filtros de categoria/nível removidos. **Player de vídeo único** para `secao !== "cursos"`: layout 1 coluna (sem sidebar de progresso/módulos), sem botões Anterior/Próxima, título "Sobre este Episódio/Treinamento"; cursos mantêm o player completo. Vimeo continua embed automático (`getVideoEmbedInfo`/parseVimeoInput).
- **Home (InicioView.tsx)**: sem mudança visual — conteúdo novo de qualquer seção já aparece no card (allContents); clique em conteúdo privado sem login → a view abre com a tela de login (`#escola-fenix-auth-guard` com `LoginModal` — fluxo já existente, verificado no teste).

### D. Validação
- `dev-tools/pw-escola-secoes.cjs` (novo) **39 OK / 0 FALHOU**: cria 1 Curso + 1 Série + 1 Treinamento via API admin; `/api/content/public` expõe `secao` correto; home mostra os novos (card); clique em privado sem login → tela de login; catálogo com as 3 seções; player de vídeo único (série/treinamento) sem sidebar e com embed Vimeo; curso com sidebar de progresso; **staff responde → chip "Respondido" no D.I.** (lista + cabeçalho); cleanup remove só os probes (cursos reais intactos: 2).
- `pw-realtime-layout.cjs` atualizado → **25 OK / 0 FALHOU** (novo assert: chip "Respondido" no D.I. após resposta via SSE).
- `pw-suporte-di.cjs` 6/0; tsc limpo (só ErrorBoundary); build OK; servidor reiniciado. Imutabilidade conferida: 2 cursos reais, 1 material, 2 tickets (`#0001`, `#0002`) intactos. Nota: rodadas de login em sequência podem bater o rate limit 10/15min por IP (aguardar a janela antes de re-rodar pw-suporte-crash/inbox).

## 35. ✅ Paleta no suporte + remoção do campo Nível + labels da home + Editor de Páginas (13/08/2026)

### A. Paleta de cores no suporte (urgência / término / neutro)
- **Decisões do usuário**: chip "Encerrar Chamado" = **verde**; chip "Respondido" (D.I.) = **azul**. Mantidos dourado (marca/prioridade/botões), toasts verde/vermelho e avatares coloridos de pessoas.
- **`SupportApp.tsx` (staff)**: novo `STATUS_COLOR` — `aberto`→vermelho, `em_andamento`→âmbar, `aguardando_resposta`→laranja, `fechado`/`resolvido`→verde, `arquivado`→azul. Badges não-lido/`Nova`/contadores (lista, pastas desktop+mobile, Interessados) em **vermelho**; pastas ativas em **neutro**; avatar do lead, telefone, autor staff e "online" da topbar em **neutro**; botão **Encerrar Chamado** verde; "Já contatei" verde.
- **`SuporteClienteView.tsx` (D.I.)**: mesmo `STATUS_COLOR` + `respondido`→azul (`diStatusOf` usa `STATUS_COLOR.respondido`); ponto e badge de não-lido em vermelho; avatar/nome "Suporte" neutros. Exibição apenas — dados intactos.

### B. Campo "Nível de Dificuldade" removido do cadastro de cursos
- `AdminView.tsx`: bloco do form + estado `cursoNivel` + `setCursoNivel` (handleEditCurso) removidos; payload do `handleSaveCurso` agora envia `nivel: "Iniciante"` fixo; display "Nível:" removido da lista do admin.
- `EscolaFenixView.tsx`: chip "Nível: {nivel}" removido do detalhe do curso.
- `server.ts` `POST /api/admin/cursos`: `nivel` deixa de ser obrigatório (400 removido) → `nivel: nivel || "Iniciante"`. Dados antigos intactos, sem migração.

### C. Label dos cards da home sem "Curso •"
- `displayCategory` de cursos deriva de `c.secao`: `series`→"Série", `treinamentos`→"Treinamento", senão "Curso" — em `InicioView.tsx` e `AdminView.tsx` (aba Cards Tela Inicial). Materiais ("Conteúdo • X") inalterados.

### D. Editor de Páginas (Tecnologias + Elite Milionária) — novo
- **Modelo**: conteúdo das páginas institucionais vira **blocos estruturados** (`PaginaBloco`/`PaginaBlocoCampos`/`PaginaBlocoTipo` em `src/types.ts` e `src/server/db.ts`): `banner`, `hero_header`, `card_tecnologia`, `texto`, `imagem`, `destaque`, `cta`; campos: badge, badgeImagem, eyebrow, titulo, tituloDestaque, textos[], destaqueTitulo, destaqueTexto, imagem, imagemAlt, legenda, botaoTexto, notaTexto, icone (flame/sparkles/zap/activity/waves/atom), cor (amber/cyan/rose/indigo/rosa).
- **Persistência**: config keys `paginaTecnologias`/`paginaElite` no Supabase; `dbService.savePagina` (padrão `saveBanner`: local + upsert config + audit `EDITAR_PAGINA`); `GET /api/content/public` expõe as duas; `POST /api/admin/paginas` (`requireAdmin`, valida chave+array); `ALLOWED_UPLOAD_FOLDERS` += `"paginas"` para fotos dos blocos.
- **Padrões**: `src/paginasPadrao.ts` — `PAGINA_TECNOLOGIAS_PADRAO` (8 blocos) e `PAGINA_ELITE_PADRAO` (11 blocos) reproduzem o conteúdo atual das views (fotos da Elite continuam os assets locais; banner da Elite usa a foto local como fallback quando `imagem` vazia).
- **Renderização**: novo `src/components/PaginaBlocos.tsx` renderiza por tipo (cards alternam foto esquerda/direita pela ordem); `TecnologiasView.tsx` e `EliteMilionarioView.tsx` viraram wrappers com fallback (`blocos.length ? blocos : PADRAO`); CTA sempre abre `QueroFazerParteModal` (Elite com título/subtítulo/tipo próprios).
- **Admin**: aba nova **"Páginas"** (`AdminTabType` + `adminNavItems` no `Sidebar.tsx`); `src/components/PaginaEditor.tsx` — seletor Tecnologias/Elite, lista de blocos com **↑↓ reordenar, mostrar/ocultar, editar, excluir**, formulário por tipo (textos = uma linha por parágrafo), upload de foto (pasta `paginas/`), botões **Salvar Alterações** e **Restaurar Padrão** (grava os padrões).
- **Bug corrigido durante a validação**: `Restaurar Padrão` salvava os blocos ANTIGOS (closure do `salvar()` lia o estado pré-setState) — `salvar(blocosParaSalvar?)` agora recebe os blocos por parâmetro.

### E. Validação
- `dev-tools/pw-paginas-editor.cjs` (novo) **26 OK / 0 FALHOU**: E2E admin salva bloco de teste (API com `Host: adminfenix.localhost:3000` — whitelist do subdomínio) → /tecnologias renderiza → aba Páginas lista/edita → **Restaurar Padrão** → API volta com 8 blocos padrão, zero resíduo do marcador. Elite validada com fallback (config ainda não existe → CONSTANTES renderizam o mesmo conteúdo).
- Regressões: `pw-realtime-layout` 25/0, `pw-inbox-check` 46/0, `pw-suporte-crash` 9/0, `pw-suporte-di` 6/0, `pw-escola-secoes` 39/0 (2 falhas intermediárias do pw-suporte-di eram 429 de rate limit — limpeza = restart do servidor). tsc limpo (só ErrorBoundary), build OK.
- Imutabilidade: 2 cursos reais, 1 material, 2 tickets (#1/#2) e 2 D.I.s intactos; `paginaTecnologias` ficou persistida com os **8 blocos padrão idênticos** ao conteúdo visual atual (útil como ponto de partida do editor).

## 36. ✅ Cores dos cards da caixa do suporte (novo/respondido) + revisão de notificações + limpeza + documento de contexto (13/08/2026)

### A. Semântica visual dos cards (exibição apenas — dados intactos; `src/components/SupportApp.tsx`)
- **Interessado "Quero Fazer Parte" `pendente`** → card com **contorno dourado ÂMBAR 2px** (`border-2 border-amber-400/90`, fundo escuro normal, sem moldura/overlay), nome `font-black`, telefone âmbar, avatar e badge PRIORIDADE dourados. **O contorno só sai quando o atendente marca "Já contatei"** — abrir e fechar o card não remove. Notificação vermelha ("Nova"/bolinha) permanece. *Histórico do estilo (lições documentadas): (1) moldura grossa gradiente `p-[2px]` (recusada pelo usuário como "horrível"); (2) `border-gold-metallic/60` era **classe fantasma** — `gold-metallic` NÃO é token do `@theme` (só classes CSS custom `.bg/.text-gold-metallic`) → Tailwind ignora e a borda caía para `currentColor` (branca); (3) `#d12a62` (o "dourado" do tema) é na verdade **rosa/magenta** → borda saiu vermelha; (4) **final: `amber-400`** (dourado real), validado por cor computada no E2E (`pw-support-cards` reprova se a cor voltar a ser o rosa `0.200945` do oklab do #d12a62).*
- **Interessado `lida` (após "Já contatei")** → card **opaco/sem cor**: sem contorno, borda neutra `border-white/5`, fundo transparente, nome `text-white/50`, demais textos `text-[#5f6a78]`, avatar dessaturado (`opacity-60 grayscale`), badge "Prioridade" em neutro esmaecido. A notificação vermelha ("Nova"/bolinha), se houver, permanece.
- **Chamado com última mensagem do cliente** (`awaitingReply` — precisa de resposta) → card com **destaque vermelho sutil** (`border-red-500/20 bg-red-500/[0.04]`), avatar/nome/numero coloridos como antes.
- **Chamado respondido** (última mensagem do suporte, ticket ativo — `!awaitingReply`) → card **sem cor**: borda `border-white/5`, fundo transparente, textos `text-[#5f6a78]`, avatar `opacity-55 grayscale`, chip de status com `opacity-45`. **A bolinha/badge vermelha de notificação é a única cor que permanece** no card — objetivo: não confundir o responsável pelo suporte.
- **Nova mensagem do cliente** → cor **volta ao card** (destaque vermelho + badge/toast do fluxo existente).
- Terminais (fechado/resolvido/arquivado) e seleção (destaque rosa/âmbar do item aberto) inalterados; `markSeen`/`lastSeen` por sessão inalterados.

### B. Revisão das notificações
- Auditadas todas as fontes: `publishSupportChange()` em **7 rotas** (server.ts: 2281 submit ouvidoria, 2729 criar chamado, 2779 mensagem, 2812 status, 2844 reabrir, 2900 status do lead, 3060 anexos); SSE `GET /api/support/realtime` autenticado (heartbeat 25s, retry 5000) + polling 30s + refetch ao focar. Badges por sessão contam mensagens do cliente após `lastSeen`; contadores das pastas (Entrada/Interessados/Chamados) corretos.

### C. Limpeza dos dados de teste PW (pedido do usuário: "testar do zero")
- Removidos via `dev-tools/cleanup-probe-inbox.cjs` (service_role): 3 tickets `PW Ticket Encerramento` (#0003/#0004/#0005) e 3 leads `PW Interessado` — estado final: **2 tickets reais (#1/#2) e 1 lead real ("Johnnatan")**.
- **Decisões do usuário**: curso "Treinamento de Teste" e a config `paginaTecnologias` (8 blocos) **mantidos** (não eram lixo).

### D. Novo documento de contexto para outra IA
- `contexto/SituacaoAtualDoApp.md` criado (pasta `contexto/` na raiz): visão geral, stack, como rodar/validar, arquitetura, fluxos, **estado real dos dados em 13/08/2026**, regras de imutabilidade, convenções/armadilhas do ambiente, baselines de testes, pendências (SQL `escola-secoes` ainda não rodado no Supabase — confirmado: `cursos.secao` não existe; redesign visual da Elite em planejamento) e histórico resumido. Ponto de entrada para continuidade.

- **Área do D.I. (`/suporte` — espelho do staff, `src/components/SuporteClienteView.tsx`)**: card do chamado com última msg do **suporte** ("Respondido") → **borda verde VÍVIDA 2px** (`border-2 border-emerald-400/90` + fundo `bg-emerald-500/[0.03]`) destacando a mensagem recebida (ajuste pedido pelo usuário: verde mais vivo); card com última msg do **D.I.** ("Aguardando resposta") → **sem cor e opaco** (`border-white/5 bg-transparent`, nome `text-white/55`, `#NNNN` `text-[#5f6a78]`, prévia `text-[#5f6a78]`, avatar `opacity-55 grayscale`, chip `opacity-45`; badge "n nova" vermelha permanece como única cor). Encerrado inalterado. Exibição apenas — dados/intros/abas/botões intactos.

### E. Validação
- `dev-tools/pw-support-cards.cjs` **15 OK / 0 FALHOU**: E2E 2 páginas (staff `suporte.localhost` + D.I.) com realtime — lead pendente com **contorno âmbar 2px** (classe + **cor computada** conferida: reprova se voltar o rosa `#d12a62`/classe fantasma) → "Já contatei" perde o contorno e fica opaco → chamado com destaque vermelho → staff responde → card sem cor (via SSE) → D.I. responde → **cor volta + badge "1 nova"** (via SSE, sem refresh); zero pageerror/404; teardown via service_role.
- `dev-tools/pw-di-cards.cjs` (novo) **11 OK / 0 FALHOU**: D.I. cria chamado PW via API → staff responde pela UI → card do D.I. com **borda verde vívida 2px** + fundo sutil + chip "Respondido" → D.I. responde → card **sem cor/opaco** (avatar dessaturado) → zero pageerror/404; teardown via service_role.
- Regressões: `pw-realtime-layout` 25/0, `pw-inbox-check` 46/0, `pw-suporte-crash` 9/0, `pw-suporte-di` 6/0, `pw-paginas-editor` 26/0, `pw-escola-secoes` 39/0. **Fix de flake latente no `pw-realtime-layout`**: o seletor `button:has-text("Ver")` casava também o card do ticket #1 (substring "ver" no texto da última mensagem) → clique errado e lightbox não abria; agora usa `button[title="Visualizar no site"]` (único). tsc limpo (só ErrorBoundary), build OK. Imutabilidade OK (re-verificado: 2 tickets reais #1/#2; leads reais "Johnnatan" arquivada + "Fernando" `lida` + "Sergio" `pendente` — dados reais criados pelo usuário ao testar o formulário, **não apagar**; `pw-inbox-check`/`pw-escola-secoes` recriam dados PW sem teardown → rodar `cleanup-probe-inbox.cjs` ao final das regressões e restart do servidor entre rodadas por causa do 429).