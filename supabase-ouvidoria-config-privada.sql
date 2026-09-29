-- Executar no SQL Editor APÓS disponibilizar o backend atualizado.
-- Não altera valores, chamados, mensagens, anexos nem opções de notificação.
-- A política restritiva complementa as políticas existentes sem substituí-las.
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'config' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'RLS de config não está ativo. Operação cancelada para revisão.';
  END IF;
END $$;
DROP POLICY IF EXISTS ouvidoria_config_privada ON public.config;
CREATE POLICY ouvidoria_config_privada ON public.config
  AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (key <> 'ouvidoriaConfig');
COMMIT;

-- Verificação: deve retornar 0, sem expor valores.
BEGIN;
SET LOCAL ROLE anon;
SELECT count(*) AS configuracoes_internas_visiveis
FROM public.config WHERE key = 'ouvidoriaConfig';
ROLLBACK;

-- Reversão, apenas se necessária:
-- DROP POLICY IF EXISTS ouvidoria_config_privada ON public.config;
