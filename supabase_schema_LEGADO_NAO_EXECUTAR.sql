-- ============================================================================================================
-- !!! ATENÇÃO — NÃO EXECUTE ESTE ARQUIVO !!!
-- ============================================================================================================
-- Este schema é LEGADO e contém POLÍTICAS DE RLS VULNERÁVEIS que REABREM buracos de
-- segurança (config SELECT true, moderator_links FOR ALL, GRANT ALL a authenticated,
-- INSERT de anon em audit_logs/fenix_posts). A base viva NÃO deve usar este script.
--
-- USE APENAS:  supabase-security-fix.sql  (aplica RLS restritivo, grants finos e whitelist)
-- Para validar a base: dev-tools/rls-live-check.mjs
-- Para conferir roles de usuários: dev-tools/check-roles.mjs
--
-- Arquivo mantido apenas como referência histórica da estrutura/índices. Renomeado para
-- evitar execução acidental por ferramentas que rodam todos os *.sql da pasta.
-- ============================================================================================================

-- ====================================================================
-- ESQUEMA SQL COMPLETO & POLÍTICAS DE SEGURANÇA (RLS) - PLATAFORMA GRUPO FÊNIX
-- Copie e execute este script no "SQL Editor" do seu painel do Supabase.
-- ====================================================================

-- --------------------------------------------------------------------
-- INSTRUÇÃO CRÍTICA: COMO TORNAR SEU USUÁRIO UM ADMINISTRADOR NO SUPABASE
-- --------------------------------------------------------------------
-- Para garantir total segurança e impedir que usuários comuns alterem seus cargos,
-- a plataforma verifica a permissão de admin através de 'app_metadata' no JWT do Supabase.
-- 
-- Após criar seu usuário no Supabase Auth, rode o comando abaixo no SQL Editor
-- (Substitua 'seu_email@grupofenix.com' pelo seu e-mail de login real):
--
-- UPDATE auth.users 
-- SET raw_app_meta_data = jsonb_set(
--   COALESCE(raw_app_meta_data, '{}'::jsonb), 
--   '{role}', 
--   '"admin"'
-- ) 
-- WHERE email = 'seu_email@grupofenix.com';
-- --------------------------------------------------------------------

-- 1. TABELA DE CONFIGURAÇÕES GLOBAIS (config)
CREATE TABLE IF NOT EXISTS public.config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

-- Seed de configurações padrão
INSERT INTO public.config (key, value) VALUES
('logoUrl', 'null'::jsonb),
('categoriasMateriais', '["Criativos", "Copys", "Vendas", "Planejamento"]'::jsonb),
('banners', '[]'::jsonb),
('hiddenHomeCardIds', '[]'::jsonb),
('ouvidoriaConfig', '{"emailSuporte": "ouvidoria@grupofenix.com", "emailParcerias": "parcerias@grupofenix.com"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 2. TABELA DO LÍDER EXECUTIVE (leader_bio)
CREATE TABLE IF NOT EXISTS public.leader_bio (
  id TEXT PRIMARY KEY DEFAULT 'main',
  nome TEXT NOT NULL,
  cargo TEXT NOT NULL,
  bio TEXT NOT NULL,
  foto TEXT NOT NULL,
  localizacao TEXT NOT NULL,
  experiencia TEXT NOT NULL,
  impacto TEXT NOT NULL,
  citacao TEXT NOT NULL,
  historia JSONB NOT NULL DEFAULT '[]'::jsonb,
  valores JSONB NOT NULL DEFAULT '[]'::jsonb,
  timeline JSONB NOT NULL DEFAULT '[]'::jsonb
);

-- Seed Leader Bio
INSERT INTO public.leader_bio (id, nome, cargo, bio, foto, localizacao, experiencia, impacto, citacao, historia, valores, timeline) VALUES
(
  'main',
  'Felipe Fênix',
  'Fundador & Líder Executivo',
  'Fundador do Grupo Fênix, mentor de negócios digitais e estrategista de marketing com mais de 10 anos de experiência acelerando negócios e transformando profissionais comuns em líderes de destaque no mercado.',
  'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&q=80&w=600',
  'São Paulo, Brasil',
  '10+ Anos de Mercado',
  '50k+ Alunos Impactados',
  'A verdadeira resiliência não consiste em apenas sobreviver às cinzas, mas em desenhar o seu próprio voo a partir delas.',
  '["Com mais de uma década atuando no olho do furacão do marketing digital e das estratégias corporativas, Felipe Fênix iniciou sua jornada do zero, enfrentando os maiores desafios de um mercado altamente volátil.", "Após fundar e consolidar diversas marcas de sucesso sob o guarda-chuva do Grupo Fênix, ele percebeu que o verdadeiro impacto não reside apenas em métricas financeiras, mas na capacitação contínua de pessoas.", "Hoje, através da Escola Fênix e da plataforma Grupo Fênix, a missão se tornou global: democratizar o acesso a estratégias de alto nível, ferramentas de publicidade de ponta e mentorias de liderança de forma transparente."]'::jsonb,
  '[{"id": "1", "titulo": "Propósito", "descricao": "Impactar positivamente vidas e negócios de forma transparente e ética.", "icone": "Target"}, {"id": "2", "titulo": "Resiliência", "descricao": "Superar obstáculos e aprender com os desafios para evoluir constantemente.", "icone": "Flame"}, {"id": "3", "titulo": "Crescimento", "descricao": "Busca incessante por inovação, conhecimento e expansão de mercado.", "icone": "TrendingUp"}, {"id": "4", "titulo": "Excelência", "descricao": "Entrega de conteúdo premium, materiais de alta qualidade e suporte dedicado.", "icone": "Award"}]'::jsonb,
  '[{"id": "1", "ano": "2016", "titulo": "Fundação da Fênix Media", "descricao": "Primeira agência de performance digital e tráfego pago focado em PMEs."}, {"id": "2", "ano": "2018", "titulo": "Expansão Nacional", "descricao": "Lançamento dos primeiros programas de mentoria e infoprodutos autorais."}, {"id": "3", "ano": "2021", "titulo": "Unificação do Grupo Fênix", "descricao": "Consolidação corporativa de serviços de tecnologia, marketing e educação."}, {"id": "4", "ano": "2023", "titulo": "Escola Fênix: 30k alunos", "descricao": "Marca histórica de 30.000 profissionais certificados no Brasil e exterior."}, {"id": "5", "ano": "2026", "titulo": "Lançamento Grupo Fênix", "descricao": "Nova plataforma integrada combinando streaming de insights e materiais."}]'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- 3. TABELA DE NOVIDADES E DESTAQUES (novidades)
CREATE TABLE IF NOT EXISTS public.novidades (
  id TEXT PRIMARY KEY,
  titulo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  categoria TEXT NOT NULL,
  imagem TEXT NOT NULL,
  is_premium BOOLEAN NOT NULL DEFAULT false,
  is_featured BOOLEAN NOT NULL DEFAULT false,
  created_at TEXT NOT NULL DEFAULT NOW()::text,
  link_type TEXT,
  link_target TEXT
);

-- 4. TABELA DE CURSOS DA ESCOLA FÊNIX (cursos)
CREATE TABLE IF NOT EXISTS public.cursos (
  id TEXT PRIMARY KEY,
  titulo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  categoria TEXT NOT NULL,
  nivel TEXT NOT NULL,
  imagem TEXT NOT NULL,
  duracao TEXT NOT NULL,
  modulos JSONB NOT NULL DEFAULT '[]'::jsonb,
  professor_nome TEXT,
  professor_especialidade TEXT,
  professor_bio TEXT,
  professor_foto TEXT,
  created_at TEXT NOT NULL DEFAULT NOW()::text
);

ALTER TABLE public.cursos ADD COLUMN IF NOT EXISTS professor_nome TEXT;
ALTER TABLE public.cursos ADD COLUMN IF NOT EXISTS professor_especialidade TEXT;
ALTER TABLE public.cursos ADD COLUMN IF NOT EXISTS professor_bio TEXT;
ALTER TABLE public.cursos ADD COLUMN IF NOT EXISTS professor_foto TEXT;
ALTER TABLE public.cursos ADD COLUMN IF NOT EXISTS created_at TEXT DEFAULT NOW()::text;

-- 5. TABELA DE MATERIAIS E BIBLIOTECA (materiais)
CREATE TABLE IF NOT EXISTS public.materiais (
  id TEXT PRIMARY KEY,
  titulo TEXT NOT NULL,
  tipo TEXT NOT NULL,
  categoria TEXT NOT NULL,
  thumbnail TEXT NOT NULL,
  file_url TEXT NOT NULL,
  downloads INTEGER NOT NULL DEFAULT 0,
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TEXT NOT NULL DEFAULT NOW()::text
);

-- 6. TABELA DE TECNOLOGIAS E PRODUTOS FÊNIX (tecnologias)
CREATE TABLE IF NOT EXISTS public.tecnologias (
  id TEXT PRIMARY KEY,
  titulo TEXT NOT NULL,
  subtitulo TEXT,
  categoria TEXT,
  descricao TEXT NOT NULL,
  destaque TEXT,
  imagem TEXT NOT NULL,
  logo_url TEXT,
  patente TEXT,
  ordem INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT NOW()::text
);

-- 7. TABELA DE POSTS DA REDE SOCIAL FÊNIX (fenix_posts)
CREATE TABLE IF NOT EXISTS public.fenix_posts (
  id TEXT PRIMARY KEY,
  titulo TEXT,
  usuario_nome TEXT NOT NULL,
  usuario_role TEXT DEFAULT 'Membro',
  tipo_media TEXT NOT NULL DEFAULT 'photo',
  media_url TEXT NOT NULL,
  media_urls JSONB DEFAULT '[]'::jsonb,
  legenda TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  likes INTEGER NOT NULL DEFAULT 0,
  liked_by JSONB DEFAULT '[]'::jsonb,
  comentarios JSONB DEFAULT '[]'::jsonb,
  data_publicacao TEXT,
  created_at TEXT NOT NULL DEFAULT NOW()::text
);

-- 8. TABELA DE MENSAGENS DE OUVIDORIA / SUPORTE (ouvidoria_messages)
CREATE TABLE IF NOT EXISTS public.ouvidoria_messages (
  id TEXT PRIMARY KEY,
  tipo TEXT NOT NULL,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  telefone TEXT,
  cidade TEXT,
  estado TEXT,
  pais TEXT,
  assunto TEXT,
  tipo_parceria TEXT,
  mensagem TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente',
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT NOW()::text
);

-- 9. TABELA DE LINKS DE MODERADORES (moderator_links)
CREATE TABLE IF NOT EXISTS public.moderator_links (
  id TEXT PRIMARY KEY,
  moderador_nome TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT NOW()::text
);

-- 10. TABELA DE LOGS DE AUDITORIA (audit_logs)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id TEXT PRIMARY KEY,
  usuario TEXT NOT NULL,
  acao TEXT NOT NULL,
  detalhes TEXT NOT NULL,
  timestamp TEXT NOT NULL DEFAULT NOW()::text
);

-- Log inicial
INSERT INTO public.audit_logs (id, usuario, acao, detalhes, timestamp) VALUES
('log-init', 'sistema', 'BANCO_CONFIGURADO', 'Plataforma Grupo Fênix configurada com sucesso no Supabase.', NOW()::text)
ON CONFLICT (id) DO NOTHING;

-- ====================================================================
-- CONFIGURAÇÃO DE SEGURANÇA E ROW LEVEL SECURITY (RLS)
-- ====================================================================

ALTER TABLE public.config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leader_bio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.novidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cursos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materiais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tecnologias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fenix_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ouvidoria_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderator_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Limpar políticas antigas para evitar conflitos
DROP POLICY IF EXISTS "Leitura de Configurações" ON public.config;
DROP POLICY IF EXISTS "Escrita de Configurações" ON public.config;
DROP POLICY IF EXISTS "Leitura de Bio" ON public.leader_bio;
DROP POLICY IF EXISTS "Escrita de Bio" ON public.leader_bio;
DROP POLICY IF EXISTS "Leitura de Novidades" ON public.novidades;
DROP POLICY IF EXISTS "Escrita de Novidades" ON public.novidades;
DROP POLICY IF EXISTS "Leitura de Cursos" ON public.cursos;
DROP POLICY IF EXISTS "Escrita de Cursos" ON public.cursos;
DROP POLICY IF EXISTS "Leitura de Materiais Públicos" ON public.materiais;
DROP POLICY IF EXISTS "Leitura de Materiais Privados" ON public.materiais;
DROP POLICY IF EXISTS "Escrita de Materiais" ON public.materiais;
DROP POLICY IF EXISTS "Leitura de Tecnologias" ON public.tecnologias;
DROP POLICY IF EXISTS "Escrita de Tecnologias" ON public.tecnologias;
DROP POLICY IF EXISTS "Leitura de Posts Aprovados" ON public.fenix_posts;
DROP POLICY IF EXISTS "Criação de Posts Pendentes" ON public.fenix_posts;
DROP POLICY IF EXISTS "Moderacao de Posts" ON public.fenix_posts;
DROP POLICY IF EXISTS "Criação de Mensagem Ouvidoria" ON public.ouvidoria_messages;
DROP POLICY IF EXISTS "Gestão de Ouvidoria Admin" ON public.ouvidoria_messages;
DROP POLICY IF EXISTS "Acesso a Moderator Links" ON public.moderator_links;
DROP POLICY IF EXISTS "Leitura de Logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Criação de Logs" ON public.audit_logs;

-- CONFIG
CREATE POLICY "Leitura de Configurações" ON public.config FOR SELECT USING (true);
CREATE POLICY "Escrita de Configurações" ON public.config FOR ALL TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- LEADER_BIO
CREATE POLICY "Leitura de Bio" ON public.leader_bio FOR SELECT USING (true);
CREATE POLICY "Escrita de Bio" ON public.leader_bio FOR ALL TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- NOVIDADES
CREATE POLICY "Leitura de Novidades" ON public.novidades FOR SELECT USING (true);
CREATE POLICY "Escrita de Novidades" ON public.novidades FOR ALL TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- CURSOS
CREATE POLICY "Leitura de Cursos" ON public.cursos FOR SELECT USING (true);
CREATE POLICY "Escrita de Cursos" ON public.cursos FOR ALL TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- MATERIAIS
CREATE POLICY "Leitura de Materiais Públicos" ON public.materiais FOR SELECT TO anon USING (is_public = true);
CREATE POLICY "Leitura de Materiais Privados" ON public.materiais FOR SELECT TO authenticated USING (is_public = true OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "Escrita de Materiais" ON public.materiais FOR ALL TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- TECNOLOGIAS
CREATE POLICY "Leitura de Tecnologias" ON public.tecnologias FOR SELECT USING (true);
CREATE POLICY "Escrita de Tecnologias" ON public.tecnologias FOR ALL TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- FENIX_POSTS (Rede Social)
CREATE POLICY "Leitura de Posts Aprovados" ON public.fenix_posts FOR SELECT USING (status = 'aprovado' OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "Criação de Posts Pendentes" ON public.fenix_posts FOR INSERT WITH CHECK (true);
CREATE POLICY "Moderacao de Posts" ON public.fenix_posts FOR ALL TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- OUVIDORIA_MESSAGES
CREATE POLICY "Criação de Mensagem Ouvidoria" ON public.ouvidoria_messages FOR INSERT WITH CHECK (true);
CREATE POLICY "Gestão de Ouvidoria Admin" ON public.ouvidoria_messages FOR ALL TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- MODERATOR_LINKS
CREATE POLICY "Acesso a Moderator Links" ON public.moderator_links FOR ALL USING (true);

-- AUDIT_LOGS
CREATE POLICY "Leitura de Logs" ON public.audit_logs FOR SELECT TO authenticated USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "Criação de Logs" ON public.audit_logs FOR INSERT WITH CHECK (true);

-- ====================================================================
-- PERMISSÕES DE TABELA (GRANTS)
-- ====================================================================
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- Permissões para visitantes anônimos (anon)
GRANT SELECT ON public.config, public.leader_bio, public.novidades, public.cursos, public.materiais, public.tecnologias, public.fenix_posts TO anon;
GRANT INSERT ON public.ouvidoria_messages, public.fenix_posts, public.audit_logs TO anon;

-- Permissões para usuários autenticados (authenticated)
GRANT SELECT ON public.config, public.leader_bio, public.novidades, public.cursos, public.materiais, public.tecnologias, public.fenix_posts, public.moderator_links TO authenticated;
GRANT INSERT ON public.ouvidoria_messages, public.fenix_posts, public.audit_logs TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
