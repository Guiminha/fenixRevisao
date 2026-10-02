-- Execute no SQL Editor do Supabase. Não modifica políticas/tabelas existentes.
-- Apenas o servidor (service_role) pode consultar ou liberar os IPs.
BEGIN;
CREATE TABLE IF NOT EXISTS public.fenix_di_login_blocks (
  ip inet PRIMARY KEY,
  failures timestamptz[] NOT NULL DEFAULT '{}',
  refused timestamptz[] NOT NULL DEFAULT '{}',
  traps timestamptz[] NOT NULL DEFAULT '{}',
  pending jsonb NOT NULL DEFAULT '{}',
  blocked_until timestamptz,
  reason text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fenix_di_login_blocks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fenix_di_login_blocks FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fenix_di_login_blocks TO service_role;
CREATE INDEX IF NOT EXISTS fenix_di_login_blocks_updated ON public.fenix_di_login_blocks(updated_at);

CREATE OR REPLACE FUNCTION public.fenix_di_login_guard(
  p_action text, p_ip text DEFAULT '', p_id text DEFAULT '',
  p_status integer DEFAULT 0, p_honeypot boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  r public.fenix_di_login_blocks%ROWTYPE;
  t timestamptz := clock_timestamp();
  address inet;
  refuse boolean := false;
  allowed boolean := false;
  retry integer := 0;
BEGIN
  IF p_action = 'list' THEN
    DELETE FROM public.fenix_di_login_blocks WHERE updated_at < t - interval '48 hours' AND (blocked_until IS NULL OR blocked_until <= t);
    RETURN jsonb_build_object('blocks', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('ip', host(ip), 'reason', reason, 'blockedUntil', blocked_until) ORDER BY blocked_until DESC)
      FROM public.fenix_di_login_blocks WHERE blocked_until > t
    ), '[]'::jsonb));
  END IF;
  IF p_action NOT IN ('begin','finish','release') THEN RAISE EXCEPTION 'Ação inválida.'; END IF;
  address := p_ip::inet;
  IF p_action = 'release' THEN
    DELETE FROM public.fenix_di_login_blocks WHERE ip = address;
    RETURN jsonb_build_object('success',true);
  END IF;
  IF p_id !~ '^[0-9a-f-]{36}$' THEN RAISE EXCEPTION 'Identificador inválido.'; END IF;
  IF p_action = 'begin' THEN
    INSERT INTO public.fenix_di_login_blocks(ip) VALUES(address) ON CONFLICT DO NOTHING;
  END IF;
  SELECT * INTO r FROM public.fenix_di_login_blocks WHERE ip = address FOR UPDATE;
  IF NOT FOUND THEN RETURN '{}'::jsonb; END IF;
  r.failures := ARRAY(SELECT x FROM unnest(r.failures) AS x WHERE x > t - interval '30 minutes');
  r.refused := ARRAY(SELECT x FROM unnest(r.refused) AS x WHERE x > t - interval '24 hours');
  r.traps := ARRAY(SELECT x FROM unnest(r.traps) AS x WHERE x > t - interval '24 hours');
  r.pending := COALESCE((SELECT jsonb_object_agg(key,value) FROM jsonb_each_text(r.pending) WHERE value::timestamptz > t - interval '120 seconds'), '{}'::jsonb);
  IF r.blocked_until <= t THEN
    r.blocked_until := NULL; r.reason := ''; r.failures := '{}';
  END IF;
  IF p_action = 'begin' THEN
    IF p_honeypot THEN
      r.traps := array_append(r.traps,t);
      IF cardinality(r.traps) >= 2 AND r.reason <> 'honeypot' THEN
        r.blocked_until := t + interval '24 hours'; r.reason := 'honeypot';
      END IF;
      refuse := true;
    ELSIF r.blocked_until > t THEN
      refuse := true;
    ELSIF cardinality(r.failures) + (SELECT count(*) FROM jsonb_object_keys(r.pending)) >= 5 THEN
      refuse := true;
    ELSE
      r.pending := r.pending || jsonb_build_object(p_id,t);
      allowed := true;
    END IF;
  ELSE
    IF NOT r.pending ? p_id THEN RETURN '{}'::jsonb; END IF;
    r.pending := r.pending - p_id;
    IF p_status IN (400,401,403) THEN
      r.failures := array_append(r.failures,t); refuse := true;
    ELSIF p_status BETWEEN 200 AND 299 THEN
      r.failures := '{}';
    END IF;
  END IF;
  IF refuse AND cardinality(r.refused) < 50 THEN r.refused := array_append(r.refused,t); END IF;
  IF cardinality(r.refused) >= 50 AND r.reason NOT IN ('insistencia','honeypot') THEN
    r.blocked_until := t + interval '24 hours'; r.reason := 'insistencia';
  ELSIF cardinality(r.failures) >= 5 AND r.blocked_until IS NULL THEN
    r.blocked_until := t + interval '30 minutes'; r.reason := 'codigos_incorretos';
  END IF;
  -- Keep arrays bounded during floods; a 24h block is never prolonged by requests.
  IF cardinality(r.traps) > 2 THEN r.traps := r.traps[cardinality(r.traps)-1:cardinality(r.traps)]; END IF;
  retry := GREATEST(0,ceil(extract(epoch FROM (r.blocked_until - t)))::integer);
  IF p_action = 'begin' AND NOT allowed AND NOT p_honeypot THEN retry := GREATEST(1,retry); END IF;
  UPDATE public.fenix_di_login_blocks SET failures=r.failures, refused=r.refused, traps=r.traps,
    pending=r.pending, blocked_until=r.blocked_until, reason=r.reason, updated_at=t WHERE ip=address;
  RETURN jsonb_build_object('retryAfterSeconds',retry,'reason',r.reason,'honeypot',p_honeypot)
    || CASE WHEN allowed THEN jsonb_build_object('reservationId',p_id) ELSE '{}'::jsonb END;
END;
$$;
REVOKE ALL ON FUNCTION public.fenix_di_login_guard(text,text,text,integer,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fenix_di_login_guard(text,text,text,integer,boolean) TO service_role;
COMMIT;

-- O resultado esperado é true nos três campos.
SELECT
  NOT has_function_privilege('anon','public.fenix_di_login_guard(text,text,text,integer,boolean)','EXECUTE') AS visitante_sem_acesso,
  NOT has_table_privilege('authenticated','public.fenix_di_login_blocks','SELECT') AS di_sem_acesso_aos_ips,
  has_function_privilege('service_role','public.fenix_di_login_guard(text,text,text,integer,boolean)','EXECUTE') AS servidor_autorizado;
