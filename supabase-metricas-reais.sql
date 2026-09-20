-- Executar no SQL Editor do Supabase antes de publicar esta versão.
-- Cria somente o histórico de métricas. Não apaga D.I.s, conteúdo ou suporte.
BEGIN;
CREATE TABLE IF NOT EXISTS public.fenix_metric_events (
  id uuid PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL CHECK (kind IN ('login','download','course','training','di_new','di_status','error')),
  actor text,
  entity_id text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS fenix_metric_events_time ON public.fenix_metric_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS fenix_metric_events_kind_time ON public.fenix_metric_events (kind, occurred_at DESC);
ALTER TABLE public.fenix_metric_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fenix_metric_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.fenix_metric_events TO service_role;

CREATE OR REPLACE FUNCTION public.fenix_metrics_report(p_days integer DEFAULT 30)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
WITH events AS (
 SELECT * FROM public.fenix_metric_events
 WHERE occurred_at >= now() - make_interval(days => greatest(1, least(p_days, 90)))
), totals AS (
 SELECT kind, count(*) AS count FROM events GROUP BY kind
), ranking AS (
 SELECT kind, entity_id, coalesce(max(detail->>'title'), entity_id) AS title, count(*) AS count
 FROM events WHERE kind IN ('download','course','training') GROUP BY kind, entity_id
), access AS (
 SELECT actor AS codigo, count(*) AS count, max(occurred_at) AS last_access
 FROM events WHERE kind = 'login' GROUP BY actor
), daily AS (
 SELECT (occurred_at AT TIME ZONE 'America/Sao_Paulo')::date AS day, kind, count(*) AS count
 FROM events WHERE kind IN ('login','download','course','training') GROUP BY 1,2
), situations AS (
 SELECT coalesce(situacao, 'Sem situação') AS situation, count(*) AS count FROM public.dis_fenix GROUP BY situacao
), transitions AS (
 SELECT detail->>'previous' AS previous, detail->>'current' AS current, count(*) AS count
 FROM events WHERE kind IN ('di_new','di_status') GROUP BY 1,2
)
SELECT jsonb_build_object(
 'generatedAt', now(), 'days', greatest(1, least(p_days, 90)),
 'startedAt', (SELECT min(occurred_at) FROM public.fenix_metric_events),
 'totals', coalesce((SELECT jsonb_object_agg(kind,count) FROM totals), '{}'::jsonb),
 'uniqueDIs', (SELECT count(*) FROM access),
 'ranking', coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.count DESC) FROM ranking r),'[]'::jsonb),
 'access', coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.count DESC) FROM access a),'[]'::jsonb),
 'daily', coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.day) FROM daily d),'[]'::jsonb),
 'situations', coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.situation) FROM situations s),'[]'::jsonb),
 'transitions', coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.count DESC) FROM transitions t),'[]'::jsonb),
 'changes', coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM (SELECT * FROM events WHERE kind IN ('di_new','di_status') ORDER BY occurred_at DESC, id LIMIT 200) c),'[]'::jsonb),
 'errors', coalesce((SELECT jsonb_agg(to_jsonb(e)) FROM (SELECT * FROM events WHERE kind='error' ORDER BY occurred_at DESC, id LIMIT 100) e),'[]'::jsonb)
);
$$;
REVOKE ALL ON FUNCTION public.fenix_metrics_report(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fenix_metrics_report(integer) TO service_role;
COMMIT;
SELECT public.fenix_metrics_report(30);
