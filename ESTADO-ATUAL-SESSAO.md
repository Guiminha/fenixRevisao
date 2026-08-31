# Estado Atual da Plataforma Fênix — Ponto de Retomada (08/08/2026)

Documento de continuidade para retomar a edição em uma nova sessão.
Projeto: `C:\Users\JOHNNATAN GUIMARAES\Desktop\Plataforma Fenix`
(Sessão anterior: migração Supabase + segurança + correção de D.I. — ver também `AGENTS.md` e `CORRECOES-SEGURANCA.md`.)

---

## 1. Resumo do que já foi feito (nesta rodada)

- ✅ Frontend **sem acesso direto ao Supabase**: `src/store.ts` não cria mais clientes `createClient`/`clientSupabase`; browser só fala com `/api/*`. Bundle `vendor-supabase` removido do `vite.config.ts` (estava vazio).
- ✅ Corrigido cadastro/exclusão de códigos D.I.: `saveDICode`, `toggleDICodeStatus` e `deleteDICode` em `src/server/db.ts` agora **checam o retorno do upsert** no Supabase e retornam erro real (`{ success: false, error }`) quando a gravação falha — antes o erro era "engolido" e o app respondia falso sucesso (item continuava no banco).
- ✅ Validado fim-a-fim via API real (`localhost:3000`): login D.I. admin + cadastro grava no Supabase (nome + código) + exclusão remove de verdade (conferido lendo o banco com service_role).
- ✅ Typecheck: `npx tsc --noEmit` limpo (só os erros pré-existentes do `src/ErrorBoundary.tsx`, NÃO mexer).
- ✅ Build de produção: `npm run build` OK (advertências de chunk grande são conhecidas).
- ✅ **Sessões duráveis (08/08)** — refresh tokens persistidos em `data/refresh_sessions.json`; cookies sem `secure` fora de produção; access token 24h. Corrige 401/403 "sem permissão" após restart do servidor.
- ✅ **D.I. por subdomínio (Host-based, 08/08)** — admin só acessível digitando `http://adminfenix.localhost:3000/` (dev) / `https://adminfenix.grupofenix.online` (prod, quando definir). API whitelist no subdomínio; `/api/admin/*`→403 e `/adminfenix`→404 no host público; sem botão/URL no frontend.
- ✅ **service_role sempre nas ops autenticadas** (`getSupabaseTrustedClient`) — elimina "permissão negada pelo banco" para admin logado via e-mail Supabase.

## 2. Estado do backend / banco

- **Fonte exclusiva de dados:** Supabase (`SUPABASE_ONLY=1` no `.env`). `data/db.json` NÃO é lido nem gravado nesse modo — ver `saveLocal()` retorno cedo em `src/server/db.ts:565` e `loadLocal()` (`db.ts:519-551`).
- `.env` contém `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ONLY=1`, `JWT_SECRET`, `ADMIN_EMAIL=admin@fenix.local`, `ADMIN_PASSWORD=fenix-admin-local`.
- `src/server/db.ts` — clientes:
  - `getSupabaseClient(userToken)` = anon/RLS (leitura pública).
  - `getSupabaseTrustedClient(userToken)` = **service_role** quando não há token do usuário (escritas autenticadas/rotas admin); usa token do usuário quando houver. `SERVICE_ROLE_KEY` só no servidor.
- Login admin: e-mail `admin@fenix.local` (env) ou código `DI-ADMIN-123456` (banco).

## 3. Supabase — estado do banco

- Tabelas (físicas): `leader_bio`, `novidades`, `cursos`, `materiais`, `tecnologias`, `fenix_posts`, `ouvidoria_messages`, `moderator_links`, `audit_logs`, `config` (JSON por chave).
- `config` guarda: `logoUrl`, `categoriasMateriais`, `banners`, `hiddenHomeCardIds`, `ouvidoriaConfig`, `minioConfig`, `vimeoConfig`, `diCodes`, `moderatorLinks`, `ouvidoriaMessages`.
- **D.I.s no banco: 7 códigos.** Atenção: ainda existem os ficticios "João" (DI-996331) e "Emanuel" (DI-987654), cadastrados como teste — podem ser excluídos na área admin (agora a exclusão funciona) ou via API.

## 3. Segurança

- Criado `supabase-security-fix.sql` (executar no **SQL Editor do Supabase** — pendente; não há acesso psql a partir do projeto). Corrige: anon INSERT em `audit_logs`, SELECT amplo em `config`, `GRANT ALL ... TO authenticated`, política `FOR ALL USING (true)` em `moderator_links`, anon criando posts aprovados em `fenix_posts`, etc.
- Revisão completa em `CORRECOES-SEGURANCA.md` (itens 16 e 17).

## 4. Pendências (próxima sessão)

1. **Aplicar `supabase-security-fix.sql`** no dashboard do Supabase (SQL Editor) e repetir testes anon: INSERT audit_logs negado; SELECT config só chaves públicas; moderator_links vazio.
2. **Resolver deixas da área admin D.I.** caso ainda existam (não há mais fixes pendentes conhecidos — se o usuário repetir, conferir se o servidor está rodando a versão nova e se o token de admin é válido).
3. **Testar uploads/mídia (MinIO)** no ambiente local.
4. **Animações** nas views restantes (WIP — ver AGENTS.md).
5. Produção: habilitar RLS, `npm audit fix`, `TRUST_PROXY=1` atrás de proxy.

## 5. Comandos úteis

- Rodar: `dev-server.bat` (logs em `dev-server.log` / `dev-server.err.log`); servidor na porta 3000.
- Typecheck: `npx tsc --noEmit` (só ErrorBoundary deve falhar).
- Build: `npm run build`.
- NÃO rodar `git` (não instalado). NUNCA expor `data/db.json` nem o `.env` (contém credenciais).