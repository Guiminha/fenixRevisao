# Plataforma Fênix v1.0.4 — Contexto do Projeto

Atualizado: 15/09/2026.

---

## Stack

- **Frontend:** React 19 + Vite 6 + TypeScript, Tailwind CSS v4, Zustand, Motion v12, Lucide React.
- **Backend:** Express + tsx (`server.ts` na raiz, ~5094 linhas), porta 3000.
- **Banco:** **Supabase** (Postgres + Auth + Storage) = única fonte (`SUPABASE_ONLY=1`).
- **Storage:** Supabase Storage. `minioService.ts` é shim de compatibilidade. Bucket: `armazenamento`.
- **Nipponflex:** API externa para sync de D.I.s (`nipponflexService.ts` → tabela `dis_fenix`).
- **Outros:** Vimeo (leitura), Sharp (imagens), Nodemailer (inativo), ffmpeg/HLS, jsPDF/JSZip.

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
- **Git:** não instalado. **Playwright:** `npx playwright install chromium` se faltar.

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
| `src/server/minioService.ts` | Shim storage (compatibilidade "MinIO") |
| `src/server/nipponflexService.ts` | Sync D.I.s Nipponflex → `dis_fenix` |
| `src/server/backupService.ts` | Backups JSON + checksum |
| `src/server/rateLimiter.ts` | Rate limiters |
| `src/store.ts` | Zustand global |
| `src/components/AdminView.tsx` | Painel admin (11 abas) |
| `src/components/LoginModal.tsx` | Modal login D.I. (4-6 dígitos) |

---

## Dados atuais (Supabase, 15/09/2026)

| Item | Qtd |
|---|---|
| Cursos | **74** (65 treinamentos + 9 cursos) |
| D.I.s (`dis_fenix`) | **2.684** |
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
- **Storage:** `/api/minio/upload`, `/api/minio/preview/*`, `/api/minio/stream/*`

---

## Regras

- Supabase = única fonte. Nunca criar `data/db.json`.
- Nenhum conteúdo apagado/alterado sem o admin.
- Backups antes de updates. Service_role só no servidor.
- Frontend: switch de `activeView` (sem react-router).
- `npx tsc --noEmit` tem erro pré-existente em `ErrorBoundary.tsx` (não alterar sem permissão).
