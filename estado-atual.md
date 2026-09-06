# Estado Atual — Plataforma Fênix

> Ponto de restauração/documentação do site. Use este arquivo como guia e backup de
> referência para retomar o projeto ou restaurar a este estado.
> Última atualização: 2026-09 (sessão em andamento). Projeto: `Plataforma Fenix v1.0.4`.

## Retomada imediata (última sessão)

- **Incidente resolvido**: o site ficou em branco com "Ops! Ocorreu um erro inesperado" e
  `TypeError: Cannot convert object to primitive value` num componente `lazy`. Causa: cache
  de deps do Vite (`node_modules/.vite`) corrompido após muitas edições HMR. **Solução**:
  parar o servidor, `Remove-Item -Recurse node_modules\.vite`, reiniciar `npm run dev`.
- **Separação de seções (home + Escola Fênix)**: cada seção ganhou linha separadora gradiente
  (`h-0.5` rosa), título em **maiúsculas** com barra de cor à esquerda, contador de itens à
  direita, e **faixa degradê rosa** atrás do título (`from-[#d12a62]/16 via-[#d12a62]/5 to-transparent`,
  `rounded-r-full`, `pr-16`) destacando o início de cada seção. Espaço título→cards dobrado (`space-y-9`).
- **Cards de conteúdo** (`ContentCard`): botão de curso/série/treinamento com texto "Assistir" e
  estilo rosa+branco (igual ao de materiais).
- **Escola Fênix**: botão "Ver Todos" virou o **último card com blur** (texto "VER TODOS" ao centro)
  abrindo a galeria interna; 7 cards + 1 "Ver Todos" por seção.
- **Home**: cards de cursos/séries/treinamentos e materiais exibidos publicamente; clique sem
  login abre o `LoginModal` (lógica já existente em `handleCardClick` + guard).
- **SQL Supabase (já aplicado)**: colunas `secao`/`created_at`/`professor_*` em `cursos`;
  `GRANT SELECT ON public.cursos TO anon` + policy "Leitura pública de cursos" (leitura pública OK);
  `materiais` também com leitura pública. `GET /api/content/public` retorna 65 séries + 1 material.
- **Não commitado**: TODAS as alterações desta e das sessões anteriores pendentes no working tree
  (ver `git status`). NÃO commitar sem ordem explícita do usuário.

---

## 1. Visão geral

Site institucional e plataforma de conteúdo do **Grupo Fênix** (comunidade focada em
saúde, alta performance, empreendedorismo e biohacking via tecnologia Nipponflex).

- **Front**: React 19 + Vite 6 + TypeScript + Tailwind CSS v4 (config via `@theme` em `src/index.css`) + Zustand (store) + Motion v12 (`motion/react`) + Lucide.
- **Back**: Express (`server.ts`) rodado com `tsx`; Supabase como fonte exclusiva de dados (`SUPABASE_ONLY=1`).
- **Armazenamento/API**: MinIO (uploads/mídia, com fallback local em `uploads/`), Vimeo (vídeos), Nodemailer (e-mail opcional), jsPDF/jszip (backups).

### URLs locais (desenvolvimento)
- Site público: `http://localhost:3000/`
- Área administrativa (subdomínio): `http://adminfenix.localhost:3000/`
- Painel de suporte (subdomínio): `http://suporte.localhost:3000/`

---

## 2. Comandos

```bash
npm install
npm run dev          # servidor Express + Vite (porta 3000)
npm run build         # vite build + esbuild server.ts -> dist/server.cjs
npx tsc --noEmit      # typecheck (só ErrorBoundary.tsx falha — pré-existente, NÃO mexer)
npx tsx dev-tools/import-series.mts   # importa vídeos Vimeo como "séries"
```

---

## 3. Estrutura de arquivos-chave

```
server.ts                 # API Express (rotas, auth, RLS/host-gating, uploads, sse)
src/
  main.tsx                # entrypoint React
  App.tsx                 # roteamento de views + subdomínios admin/suporte + modo manutenção
  store.ts                # Zustand (auth, publicData, restrictedData, admin, uploads)
  types.ts                # tipos (Curso, Material, PaginaBloco, Banner, etc.)
  index.css               # Tailwind v4 + classes custom (btn-gold-metallic, card-modern, etc.)
  paginasPadrao.ts        # conteúdo padrão das páginas institucionais
  defaultData.ts          # dados padrão/fallback
  components/
    HeroCarousel.tsx      # carrossel do topo da home (banners)
    InicioView.tsx        # home (hero + seções de cards)
    LeaderBioView.tsx     # página Grupo Fênix (via PaginaBlocos)
    TecnologiasView.tsx   # página Tecnologias (via PaginaBlocos)
    EliteMilionarioView.tsx # página Elite Milionária (via PaginaBlocos)
    PaginaBlocos.tsx      # renderizador de blocos (capas/hero/seções/FAQ/CTA)
    EscolaFenixView.tsx   # catálogo (Cursos/Séries/Treinamentos) + player + galeria
    ConteudosView.tsx     # biblioteca de materiais (download)
    FenixSocialView.tsx   # rede social (feed)
    FenixModerationView.tsx
    SuporteClienteView.tsx # área de suporte do D.I.
    Sidebar.tsx           # menu (desktop fixo + drawer mobile)
    Footer.tsx
    ContentCard.tsx       # card de conteúdo (cursos/materiais/novidades)
    SupportApp.tsx        # painel de atendimento (subdomínio suporte)
    AdminView.tsx         # painel admin (abas: dashboard, banners, cursos, materiais, páginas, etc.)
    AdminLoginView.tsx
    PaginaEditor.tsx      # editor unificado de páginas institucionais
    LoginModal.tsx        # login D.I.
    QueroFazerParteModal.tsx / EliteMilionarioModal.tsx
    CustomVideoPlayer.tsx
  server/
    db.ts                 # data access (Supabase, configs, CRUD)
    minioService.ts       # uploads MinIO
    vimeoClient.ts        # API Vimeo
    backupService.ts      # backups do site/banco/suporte
    rateLimiter.ts
    mailService.ts
    diImport.ts           # importação CSV de códigos D.I.
```

---

## 4. Áreas/páginas e comportamento

- **Home** (`inicio`): carrossel de banners (topo) + seções de cards (Novidades, Cursos em Destaque, Biblioteca & Materiais). Cards de cursos/séries/treinamentos e materiais aparecem publicamente; clicar sem login leva ao `LoginModal`.
- **Grupo Fênix** (`grupo-fenix`) / **Tecnologias** (`tecnologias`) / **Elite Milionária** (`elite-milionario`): páginas institucionais renderizadas por `PaginaBlocos` (capas, hero, seções, FAQ, CTA). Editáveis na aba "Páginas" do admin.
- **Escola Fênix** (`escola-fenix`, restrita): catálogo com seções **Cursos / Séries / Treinamentos** (2 fileiras + card "Ver Todos" com blur → galeria interna completa). Player de vídeo Vimeo. Exige login D.I.
- **Conteúdos** (`conteudos`, restrita): biblioteca de materiais com download (exige sessão).
- **Fênix Social** (`fenix-social`): feed público de posts.
- **Suporte** (`suporte`, restrito): área do D.I. para abrir/acompanhar chamados (SSE realtime).
- **Admin** (`adminfenix.*`): login por email/senha (Supabase Auth admin) — gestão de banners, cards, cursos, materiais, páginas, D.I.s, suporte, backups, servidores.
- **Suporte (atendimento)** (`suporte.*`): painel de atendentes (caixa unificada de leads/tickets).

---

## 5. Modelo de dados (Supabase)

Fonte exclusiva de dados (`SUPABASE_ONLY=1`). Tabelas principais:

- `cursos` — colunas: `id, titulo, descricao, categoria, nivel, imagem, duracao, modulos, professor_nome, professor_especialidade, professor_bio, professor_foto, secao, created_at`. `secao` ∈ `cursos | series | treinamentos`.
- `materiais` — `id, titulo, tipo, categoria, thumbnail, file_url, downloads, is_public, created_at`.
- `novidades`, `leader_bio`, `tecnologias`, `fenix_posts`, `audit_logs`.
- `config` (JSON por chave) — chaves importantes: `logoUrl`, `banners`, `categoriasMateriais`, `hiddenHomeCardIds`, `diCodes`, `ouvidoriaConfig`, `ouvidoriaMessages`, `minioConfig`, `vimeoConfig`, `supportUsers`, `supportTickets`, `manutencao`, `paginaTecnologias`, `paginaElite`, `paginaBiografia`.

### Estado atual do conteúdo (nesta sessão)
- **65 séries** (`secao="series"`) importadas do Vimeo (conta "Memory Films"). Títulos sem a data do início; ordenadas do mais recente para o mais antigo.
- **0 cursos**, **0 treinamentos**.
- **1 material** ("FOLDER ALCALINE MAX SQUEEZE"; `is_public=false`).
- Páginas institucionais persistidas: `paginaBiografia` (14 blocos), `paginaTecnologias` (8), `paginaElite` (12).
- 4 banners na home.

---

## 6. Segurança / RLS (já aplicado no Supabase)

- Migração de colunas em `cursos` (idempotente): `secao`, `created_at`, `professor_nome`, `professor_especialidade`, `professor_bio`, `professor_foto`.
- Leitura pública liberada:
  - `materiais`: policy "Leitura pública de materiais (listagem)" (`FOR SELECT TO anon USING (true)`).
  - `cursos`: policy "Leitura pública de cursos" (`FOR SELECT USING (true)`) + `GRANT SELECT ON public.cursos TO anon`.
- Escritas usam `service_role` (não exposto ao client).
- Host-gating: `/api/admin/*` e `/api/support/*` controlados por subdomínio (`ADMIN_HOST_PREFIX`, `SUPPORT_HOST_PREFIX`).

---

## 7. Variáveis de ambiente (`.env` — NÃO versionar)

```
SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ONLY=1
JWT_SECRET
ADMIN_EMAIL, ADMIN_PASSWORD_HASH
MINIO_ENDPOINT/PORT/USE_SSL/ACCESS_KEY/SECRET_KEY/BUCKET/REGION/CONSOLE_URL
VIMEO_CLIENT_ID, VIMEO_CLIENT_SECRET, VIMEO_ACCESS_TOKEN
SMTP_HOST/PORT/SECURE/USER/PASS, MAIL_FROM_NAME   (opcional)
```

No **deploy** (hostinger/hPanel via git push), as envs devem ser recriadas; o `.env` não vai no
repositório. O build roda no servidor (`npm install` + `npm run build`).

---

## 8. Pontos de atenção / decisões fixadas

- O carrossel do topo da home: título com `line-clamp-2`, descrição `line-clamp-3`, overlay com `max-w-[60%]` (título/descrição não cortam, padrão uniforme em todas as resoluções).
- Capas de páginas (`hero_banner`): imagem `object-cover object-top`, proporção `aspect-[21/9]`, `min-h-[240px] sm:min-h-[320px]`.
- Editor de páginas: uma única aba "Páginas" no admin, unificando Grupo Fênix / Tecnologias / Elite Milionária.
- Botão dos cards de conteúdo: "Assistir" (curso/série/treinamento) e "Acessar Materiais" (material), ambos estilo rosa+branco.

---

## 9. Scripts dev-tools relevantes

- `dev-tools/import-series.mts` — importa vídeos do Vimeo como séries (idempotente, `s-vimeo-<videoId>`).
- `dev-tools/seed-paginas.mts` — grava o conteúdo padrão das 3 páginas no Supabase.
- `dev-tools/roundtrip-paginas.mts` — verifica ida-e-volta de gravação.
- `dev-tools/escola-secoes.sql` — migração de colunas `secao`/`created_at` em `cursos`.
- `supabase-security-fix.sql` — script base de RLS/GRANTS (documentação).

---

## 10. Restaurar a este ponto

1. `npm install` + recriar `.env` com as credenciais (Supabase/MinIO/Vimeo/JWT).
2. Garantir o SQL do Supabase aplicado (colunas de `cursos` + RLS/GRANT de `cursos` e `materiais`).
3. `npm run dev` (ou deploy: `npm run build` e rodar `dist/server.cjs`).
4. Verificar `GET /api/content/public`: deve retornar 65 cursos (séries), 1 material, 4 banners e as 3 páginas.