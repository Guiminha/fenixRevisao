# Plataforma Fênix v1.0.4 — Contexto do Projeto

Atualizado: 17/09/2026.

---

## Stack

- **Frontend:** React 19 + Vite 6 + TypeScript, Tailwind CSS v4, Zustand, Motion v12, Lucide React.
- **Backend:** Express + tsx (`server.ts` na raiz, ~5094 linhas), porta 3000.
- **Banco:** **Supabase** (Postgres + Auth + Storage) = única fonte (`SUPABASE_ONLY=1`).
- **Storage:** Supabase Storage (`storageService.ts`, ex-shim "MinIO" — removido). Bucket fixo: `armazenamento`. Sem fallback em disco.
- **Nipponflex:** API externa para sync de D.I.s (`nipponflexService.ts` → tabela `dis_fenix`).
- **Outros:** Vimeo (leitura), Sharp (imagens), Nodemailer (inativo), ffmpeg/HLS, jsPDF/JSZip.

---

## Estado atual do trabalho (17/09/2026)

### Feito (commits anteriores: 853158a, b80facc, 498b6fe, 439c05b)
- **Menu admin renomeado:** "Cadastrar D.I." → "D.I.s Cadastrados" (Sidebar.tsx:99)
- **Botão "Limpar Logs"** (frontend-only) na janela "Logs da Sincronização" (AdminView.tsx)
- **Recuperação de status travado** (`carregarEstadoInicial()`)
- **Logo Energy Oficial:** Integrado no topo da página de Tecnologias (`PaginaBlocos.tsx`), tamanho ajustado 2.3x, espaçamentos otimizados e texto em 6 linhas com avanço para as margens do layout
- **Materiais na Tela Inicial (Novidades e Biblioteca):** `/api/content/public` agora busca metadados de materiais com service role interno para contornar RLS em leitura pública sem expor arquivos confidenciais; rota `/api/storage/preview/*` liberada para imagens de capa de materiais
- **storageService.ts** substitui minioService.ts; rotas `/api/storage/*`; sem MinIO e sem fallback em disco em todo o projeto
- **Login D.I.** aceita 4-6 dígitos (LoginModal.tsx)
- **obterMetricasDis()** = 6 queries `count: "exact"` + card "Outros"
- **Backup Integral do Suporte + Quero Fazer Parte da Equipe:** Salva PDFs individuais em `backup-suporte/AAAA-MM-DD/` com ZIP consolidado; agendamento automático às 22:00 e disparo manual; inclui chamados em andamento e candidaturas pendentes; após encerramento/contato, gera o backup do dia e não entra mais nos dias seguintes
- **Quero Fazer Parte da Equipe:** Conceito unificado em todo o sistema (candidatura para trabalhar na equipe do Grupo Fênix, não parceria); modal e Central de Suporte com ícone Briefcase e textos adequados
- **Remoção de E-mails do Suporte:** Módulo de suporte opera 100% dentro do sistema; card de e-mail removido da aba Suporte no Admin
- **Ambiente de Testes Limpo:** Chamados de suporte e candidaturas Quero Fazer Parte resetados (0 chamados, 0 leads) a pedido do usuário

### Pendente / próximo
- **"Resumo do último relatório"** (AdminView ~2756-2780, `<details>` após botão SINCRONIZAR): usuário quer que mostre **o que mudou de uma sync para outra** — novos cadastrados + mudanças de situação (ex.: ativo → inativo), não só contagem. Dados já existem: `NfRelatorio.situacoesAlteradas[]` {codigo, nome, anterior, nova} e `estado.novosCadastrados`
- **Sync timeouts:** download get-cadastro = 15 min (`timeoutMs: 900_000`, nipponflexService.ts:218) — usuário decidiu manter 15 min (não 20)
- **PDF do material "FOLDER ALCALINE MAX SQUEEZE" perdido** (nunca foi pro bucket) — usuário disse para ignorar

### Restrições do usuário (IMPORTANTE)
- **NÃO mexer no RLS/segurança** — se precisar de SQL, passar o código para o usuário rodar no SQL Editor do Supabase
- **NÃO alterar formatação/textos do HeroCarousel** — só ajustes de imagem
- Responder sempre em português do Brasil
- Supabase: pg-meta dá 401 e porta 5432 dá timeout — SQL só via usuário no Dashboard

### Dados do Nipponflex (última sync concluída 23:50:22, 586s)
- 2.684 filtrados, 1.684 novos cadastrados, status ok
- Logs persistidos em config `nipponflexLogs` (máx 500), estado em `nipponflexEstado`

---

## Como rodar

```bash
npm install
dev-server.bat          # Express + Vite em background
npm run build           # vite + esbuild → dist/server.cjs
npx tsc --noEmit        # typecheck
```

- **URLs:** `localhost:3000` | `adminfenix.localhost:3000` | `suporte.localhost:3000`
- **Admin local:** `admin@fenix.local` / `fenix-admin-local`
- **Rate limit login:** 10 tentativas/15 min por IP. Lockout por conta.
- **Git:** instalado (2.55.0), repo `github.com/Guiminha/fenixRevisao` (main), user `Guiminha`. **Playwright:** `npx playwright install chromium` se faltar.

---

## Variáveis de ambiente

```
SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ONLY=1
JWT_SECRET, VIMEO_ACCESS_TOKEN, VIMEO_CLIENT_ID, VIMEO_CLIENT_SECRET
NIPPONFLEX_BASE_URL, NIPPONFLEX_CODIGO, NIPPONFLEX_SENHA_MD5
SMTP_HOST/PORT/USER/PASS/SECURE, MAIL_FROM_NAME (opcional, inativo)
```

---

## Autenticação

- **Email/senha** (Supabase Auth): admin se `app_metadata.role === "admin"`.
- **Código D.I.** (tabela `dis_fenix`): aceita **4 a 6 dígitos**. Validação: match exato no banco → verifica situação vs `disSituacoesPermitidas` (config, default `["A"]`). Fallback legado `config.diCodes`.
- **JWT:** httpOnly cookie, HS256, 24h. Payload: `{role, name, jti}`.
- **Refresh:** rotativo, 7d + 30d teto. Reuso → revogação total.
- **Roles:** `admin` | `user` | `support`.

---

## Arquitetura

| Arquivo | Papel |
|---|---|
| `server.ts` | API Express principal |
| `src/server/db.ts` | Acesso Supabase, configs, CRUD, auditoria |
| `src/server/storageService.ts` | Supabase Storage (bucket fixo `armazenamento`, sem fallback) |
| `src/server/nipponflexService.ts` | Sync D.I.s Nipponflex → `dis_fenix` |
| `src/server/backupService.ts` | Backups JSON + checksum |
| `src/server/rateLimiter.ts` | Rate limiters |
| `src/store.ts` | Zustand global |
| `src/components/AdminView.tsx` | Painel admin (11 abas) |
| `src/components/LoginModal.tsx` | Modal login D.I. (4-6 dígitos) |

---

## Dados atuais (Supabase, 17/09/2026)

| Item | Qtd |
|---|---|
| Cursos | **74** (65 treinamentos + 9 cursos) |
| D.I.s (`dis_fenix`) | **2.684** (1.684 novos na última sync) |
| Materiais | 1 | Leader Bio | 1 | Banners | 5 |
| Audit Logs | 374 | Fenix Posts | 0 | Novidades | 0 |

### D.I.s — distribuição de dígitos
| Dígitos | Qtd | % |
|---|---|---|
| 4 | 428 | 15,9% |
| 5 | 1.910 | 71,2% |
| 6 | 346 | 12,9% |

Menor: `1428` (4 dígitos). Maior: `104977` (6 dígitos).

---

## Login D.I. — fluxo completo

```
LoginModal (4-6 dígitos) → store.login() → POST /api/auth/login
  → dbService.validateDICode()
    → 1) dis_fenix WHERE codigo = input (match exato)
       → se situação em disSituacoesPermitidas → autoriza
       → senão → "situação não permite acesso"
    → 2) fallback: config.diCodes (legado)
  → JWT + httpOnly cookie → acesso à área restrita
```

---

## Métricas Nipponflex (admin)

`obterMetricasDis()` usa **6 queries `count: "exact"`** (1 total + 5 por situação A/I/P/S/D). Qualquer situação fora do padrão aparece como "Outros" no admin. Garante soma = total sem depender de limite de linhas do Supabase.

---

## Rotas API

- **Auth:** `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- **Público:** `/api/content/public`, `/api/content/restricted`
- **Social:** `/api/fenix-social/*`
- **Admin:** `/api/admin/*` (requireAdmin) — conteúdo, nipponflex, backup, etc.
- **Suporte:** `/api/support/*` — SSE, tickets, mensagens
- **Storage:** `/api/storage/upload`, `/api/storage/preview/*`, `/api/storage/stream/*`, `/api/storage/hls/*` (Supabase Storage, bucket `armazenamento`)

---

## Regras

- Supabase = única fonte. Nunca criar `data/db.json`.
- Nenhum conteúdo apagado/alterado sem o admin.
- Backups antes de updates. Service_role só no servidor.
- Frontend: switch de `activeView` (sem react-router).
- `npx tsc --noEmit` tem erro pré-existente em `ErrorBoundary.tsx` (não alterar sem permissão).
- **Armazenamento:** todo upload/mídia/logo vai para o bucket `armazenamento` do Supabase (via `storageService.ts`). **Sem fallback em disco.** Rotas de mídia: `/api/storage/*`. Não reverter para MinIO.
- **RLS:** o anon lê apenas keys públicas da `config` (incluindo `paginaTecnologias`, `paginaElite`, `paginaBiografia`). Não alterar políticas sem aprovação.
