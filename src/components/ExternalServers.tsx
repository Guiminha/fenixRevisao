import React, { useEffect, useState } from 'react';

export function ExternalServers() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    const timer = setTimeout(() => controller.abort(), 12000);
    setLoading(true); setError('');
    fetch('/api/admin/integrations/status', { signal: controller.signal, cache: 'no-store' })
      .then(async res => { if (!res.ok) throw new Error('Não foi possível verificar os servidores.'); return res.json(); })
      .then(result => { if (active) setData(result); })
      .catch(() => { if (active) { setData(null); setError('Verificação indisponível ou tempo esgotado. Tente novamente.'); } })
      .finally(() => { clearTimeout(timer); if (active) setLoading(false); });
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [revision]);
  return <section className="space-y-6 text-white">
    <header className="flex justify-between gap-4 items-center"><div><h2 className="text-2xl font-bold">Servidores Externos</h2><p className="text-sm text-gray-400">Verificação ao abrir esta página ou atualizar. Falhas são registradas na Visão Geral.</p></div><button disabled={loading} onClick={() => setRevision(n => n + 1)} className="bg-white/10 px-4 py-3 rounded-xl disabled:opacity-50">{loading ? 'Verificando…' : 'Verificar novamente'}</button></header>
    {error && <p role="alert" className="text-red-300">{error}</p>}
    {data && <><div className="grid md:grid-cols-2 gap-5">{data.services.map((service: any) => <article key={service.name} className="bg-[#151b22] border border-white/10 rounded-2xl p-6 space-y-3"><h3 className="font-bold text-lg">{service.name}</h3><p className={service.online ? 'text-emerald-400' : 'text-red-300'}>{service.online ? 'Disponível' : 'Falha na verificação'}</p><p className="text-sm">{service.message}</p><p className="text-xs text-gray-400">{new Date(service.lastCheckedAt).toLocaleString('pt-BR')} · {service.latencyMs} ms</p></article>)}</div><article className="bg-[#151b22] border border-white/10 rounded-2xl p-6"><h3 className="font-bold">Última sincronização Nipponflex</h3><p className="mt-2 text-sm">{data.synchronization.status === 'em_andamento' ? 'Em andamento' : data.synchronization.status === 'erro' ? 'A última tentativa falhou. Consulte os Logs de Sincronização.' : 'Sem sincronização em andamento.'}</p><p className="text-sm text-gray-400">Última conclusão: {data.synchronization.ultimaSincronizacao ? new Date(data.synchronization.ultimaSincronizacao).toLocaleString('pt-BR') : 'Ainda não registrada'}</p></article></>}
  </section>;
}
