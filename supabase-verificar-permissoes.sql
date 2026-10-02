-- SOMENTE LEITURA: não altera permissões, políticas nem dados.
-- Execute no SQL Editor e envie os resultados para revisar as permissões reais.
SELECT t.tablename AS tabela, t.rowsecurity AS protecao_por_linha,
       has_table_privilege('anon',format('public.%I',t.tablename),'SELECT') AS visitante_pode_ler,
       has_table_privilege('anon',format('public.%I',t.tablename),'INSERT') AS visitante_pode_inserir,
       has_table_privilege('anon',format('public.%I',t.tablename),'UPDATE') AS visitante_pode_alterar,
       has_table_privilege('anon',format('public.%I',t.tablename),'DELETE') AS visitante_pode_excluir
FROM pg_tables t WHERE t.schemaname='public'
ORDER BY t.tablename;

SELECT p.proname AS funcao, pg_get_function_identity_arguments(p.oid) AS argumentos,
       p.prosecdef AS executa_com_privilegios_do_dono,
       has_function_privilege('anon',p.oid,'EXECUTE') AS visitante_pode_executar,
       has_function_privilege('authenticated',p.oid,'EXECUTE') AS usuario_pode_executar,
       has_function_privilege('service_role',p.oid,'EXECUTE') AS servidor_pode_executar,
       (p.prosrc ~* '\mEXECUTE\M' AND p.prolang = (SELECT oid FROM pg_language WHERE lanname='plpgsql')) AS revisar_sql_dinamico
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public'
ORDER BY p.proname;

SELECT tablename AS tabela, policyname AS politica, roles AS papeis, cmd AS operacao,
       qual AS regra_de_leitura, with_check AS regra_de_gravacao
FROM pg_policies WHERE schemaname='public' ORDER BY tablename,policyname;
