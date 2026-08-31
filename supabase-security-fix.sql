-- ====================================================================
-- CORREÇÃO DE SEGURANÇA RLS/GRANTS - PLATAFORMA GRUPO FÊNIX
-- Execute este script no SQL Editor do Supabase (Dashboard → SQL Editor).
-- Validação (08/08/2026): era possível fazer INSERT em audit_logs como
-- anon e qualquer authenticated tinha acesso total a TODAS as tabelas
-- (GRANT ALL). Este script fecha esses buracos mantendo o funcionamento
-- da API (as rotas de escrita usam service_role, que ignora RLS).
--
-- v2 (10/08/2026): script agora é 100% IDEMPOTENTE — cada CREATE POLICY
-- é precedido de DROP POLICY IF EXISTS com o MESMO nome (a v1 usava nomes
-- antigos nos DROPs e nomes novos nos CREATEs, gerando erro 42710
-- "policy already exists" ao re-executar). Pode rodar quantas vezes
-- quiser sem erro e sem duplicar nada.
-- ====================================================================

-- --------------------------------------------------------------------
-- 0. GARANTIR RLS HABILITADO NAS TABELAS PROTEGIDAS
--    (idempotente: no-op se já estiver ativo; sem RLS as políticas
--    criadas abaixo seriam ignoradas).
-- --------------------------------------------------------------------
ALTER TABLE public.config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderator_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fenix_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.materiais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cursos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.novidades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leader_bio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tecnologias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ouvidoria_messages ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------------------
-- 1. REVOGAR PRIVILÉGIOS ABUSIVOS NAS TABELAS NORMAIS

-- a) REVOKE do GRANT ALL para authenticated (era largamente permissivo).
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

-- GRANTS finos para anon (apenas leitura do que é público)
GRANT SELECT ON public.config, public.leader_bio, public.novidades, public.cursos, public.materiais, public.tecnologias, public.fenix_posts TO anon;
GRANT INSERT ON TABLE public.ouvidoria_messages TO anon;

-- GRANTS finos para authenticated (leitura + inserção de conteúdo próprio)
GRANT SELECT ON TABLE public.config, public.leader_bio, public.novidades, public.cursos, public.materiais, public.tecnologias, public.fenix_posts TO authenticated;
GRANT INSERT ON TABLE public.ouvidoria_messages, public.fenix_posts TO authenticated;
GRANT INSERT ON TABLE public.audit_logs TO authenticated;

-- NÃO conceder nada sobre moderator_links ou audit_logs via tabela:
-- o backend acessa essas tabelas com service_role (que ignora RLS).

-- --------------------------------------------------------------------
-- 2. POLÍTICA DA TABELA CONFIG: expõe apenas chaves públicas para leitura
--    (logoUrl, categoriasMateriais, banners, hiddenHomeCardIds, ouvidoriaConfig).
--    Chaves sensíveis (minioConfig, vimeoConfig, diCodes, moderatorLinks,
--    ouvidoriaMessages) ficam invisíveis para anon/authenticated: o backend
--    lê essas com service_role (que ignora RLS).
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Leitura de Configurações" ON public.config;
DROP POLICY IF EXISTS "Escrita de Configurações" ON public.config;
DROP POLICY IF EXISTS "Leitura de Configurações Públicas" ON public.config;
DROP POLICY IF EXISTS "Escrita de Configurações (Admin)" ON public.config;

CREATE POLICY "Leitura de Configurações Públicas" ON public.config
  FOR SELECT
  USING (key IN (
    'logoUrl',
    'categoriasMateriais',
    'banners',
    'hiddenHomeCardIds',
    'ouvidoriaConfig'
  ));

CREATE POLICY "Escrita de Configurações (Admin)" ON public.config
  FOR ALL TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- --------------------------------------------------------------------
-- 3. AUDIT_LOGS: inserção apenas para authenticated e leitura só admin.
--    (Usuários anon não devem conseguir forjar logs de auditoria.)
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Leitura de Logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Criação de Logs" ON public.audit_logs;
DROP POLICY IF EXISTS "Leitura de Logs (Admin)" ON public.audit_logs;
DROP POLICY IF EXISTS "Criação de Logs (Autenticado)" ON public.audit_logs;

CREATE POLICY "Leitura de Logs (Admin)" ON public.audit_logs
  FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Criação de Logs (Autenticado)" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- --------------------------------------------------------------------
-- 4. MODERATOR_LINKS: acesso somente a quem logóu e com perfil role admin.
--    ANTES: FOR ALL USING (true) — qualquer um lia/criava link de moderador.
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Acesso a Moderator Links" ON public.moderator_links;
DROP POLICY IF EXISTS "Moderator Links" ON public.moderator_links;
DROP POLICY IF EXISTS "Moderator Links (Admin)" ON public.moderator_links;

CREATE POLICY "Moderator Links (Admin)" ON public.moderator_links
  FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- --------------------------------------------------------------------
-- 5. FENIX_POSTS: anon não pode criar posts já aprovados (garantia de
--    moderação). O app cria posts pendentes via authenticated.
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Criação de Posts Pendentes" ON public.fenix_posts;
DROP POLICY IF EXISTS "Criação de Posts (Autenticado)" ON public.fenix_posts;

CREATE POLICY "Criação de Posts (Autenticado)" ON public.fenix_posts
  FOR INSERT TO authenticated
  WITH CHECK (status = 'pendente');

-- --------------------------------------------------------------------
-- 6. TECNOLOGIAS e demais tabelas: tudo continua readonly para usuários.
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Escrita de Tecnologias" ON public.tecnologias;
DROP POLICY IF EXISTS "Escrita de Novidades" ON public.novidades;
DROP POLICY IF EXISTS "Escrita de Cursos" ON public.cursos;
DROP POLICY IF EXISTS "Escrita de Materiais" ON public.materiais;
DROP POLICY IF EXISTS "Escrita de Bio" ON public.leader_bio;

DROP POLICY IF EXISTS "Escrita de Cursos (Admin)" ON public.cursos;
DROP POLICY IF EXISTS "Escrita de Materiais (Admin)" ON public.materiais;
DROP POLICY IF EXISTS "Escrita de Novidades (Admin)" ON public.novidades;
DROP POLICY IF EXISTS "Escrita de Bio (Admin)" ON public.leader_bio;
DROP POLICY IF EXISTS "Escrita de Tecnologias (Admin)" ON public.tecnologias;
DROP POLICY IF EXISTS "Gestão de Ouvidoria (Admin)" ON public.ouvidoria_messages;

CREATE POLICY "Escrita de Cursos (Admin)" ON public.cursos
  FOR ALL TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Escrita de Materiais (Admin)" ON public.materiais
  FOR ALL TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Escrita de Novidades (Admin)" ON public.novidades
  FOR ALL TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Escrita de Bio (Admin)" ON public.leader_bio
  FOR ALL TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Escrita de Tecnologias (Admin)" ON public.tecnologias
  FOR ALL TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Gestão de Ouvidoria (Admin)" ON public.ouvidoria_messages
  FOR ALL TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- --------------------------------------------------------------------
-- 7. REGRESSO: as leituras públicas continuam funcionando como antes.
-- --------------------------------------------------------------------
DROP POLICY IF EXISTS "Leitura pública de líder_bio" ON public.leader_bio;
DROP POLICY IF EXISTS "Leitura pública de novidades" ON public.novidades;
DROP POLICY IF EXISTS "Leitura pública de cursos" ON public.cursos;
DROP POLICY IF EXISTS "Leitura pública de materiais (só públicos)" ON public.materiais;
DROP POLICY IF EXISTS "Leitura de materiais (autenticado: públicos + admin)" ON public.materiais;
DROP POLICY IF EXISTS "Leitura pública de tecnologias" ON public.tecnologias;
DROP POLICY IF EXISTS "Leitura de posts aprovados" ON public.fenix_posts;
DROP POLICY IF EXISTS "Criação de mensagem de ouvidoria" ON public.ouvidoria_messages;

CREATE POLICY "Leitura pública de líder_bio" ON public.leader_bio FOR SELECT USING (true);
CREATE POLICY "Leitura pública de novidades" ON public.novidades FOR SELECT USING (true);
CREATE POLICY "Leitura pública de cursos" ON public.cursos FOR SELECT USING (true);
CREATE POLICY "Leitura pública de materiais (só públicos)" ON public.materiais FOR SELECT TO anon USING (is_public = true);
CREATE POLICY "Leitura de materiais (autenticado: públicos + admin)" ON public.materiais
  FOR SELECT TO authenticated USING (is_public = true OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "Leitura pública de tecnologias" ON public.tecnologias FOR SELECT USING (true);
CREATE POLICY "Leitura de posts aprovados" ON public.fenix_posts FOR SELECT USING (status = 'aprovado' OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
CREATE POLICY "Criação de mensagem de ouvidoria" ON public.ouvidoria_messages FOR INSERT WITH CHECK (true);

-- --------------------------------------------------------------------
-- FIM. Script idempotente: pode ser re-executado sem erro.
-- Verificação pós-aplicação (opcional, no SQL Editor):
--   SELECT tablename, policyname FROM pg_policies WHERE schemaname='public' ORDER BY 1,2;
-- --------------------------------------------------------------------