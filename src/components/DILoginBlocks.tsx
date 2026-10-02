import { useEffect, useState } from 'react';
import { ShieldCheck, RefreshCw } from 'lucide-react';

type Block = { ip: string; reason: string; blockedUntil: string };
const reasons: Record<string, string> = { codigos_incorretos: '5 códigos incorretos', insistencia: 'Insistência nas tentativas', honeypot: 'Envios automáticos detectados' };

export default function DILoginBlocks() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [persistent, setPersistent] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function load() {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/security/di-login-blocks');
      if (!res.ok) throw new Error('Não foi possível consultar os bloqueios.');
      const data = await res.json();
      setBlocks(data.blocks); setPersistent(data.persistent); setError('');
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  useEffect(() => { void load(); }, []);
  async function release(ip: string) {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/security/di-login-blocks/release', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ip }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Não foi possível liberar o endereço.');
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <section className="rounded-3xl border border-white/10 bg-[#151b22]/80 p-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="flex items-center gap-2 text-lg font-bold text-white"><ShieldCheck className="h-5 w-5 text-[#ff719e]" />Proteção do login D.I.</h3>
      <button onClick={load} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-white disabled:opacity-50"><RefreshCw className="h-4 w-4" />Atualizar</button>
    </div>
    <p className="mt-3 text-sm text-[#b8c3d1]">5 erros: bloqueio por 30 minutos. Insistência ou repetição de envios automáticos: bloqueio por 24 horas. A liberação é automática ao término do prazo.</p>
    {persistent === false && <p role="status" className="mt-3 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-300">Proteção local ativa. Para manter os bloqueios após reiniciar o servidor, execute supabase-login-di-protecao.sql no Supabase. A liberação manual exige a persistência disponível.</p>}
    {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
    {!blocks.length ? <p className="mt-4 text-sm text-[#94a3b8]">{busy ? 'Consultando...' : 'Nenhum IP bloqueado neste momento.'}</p> : <div className="mt-4 space-y-3">
      {blocks.map(b => <div key={b.ip} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 p-4 text-sm">
        <div className="text-[#b8c3d1]"><span className="font-mono text-white">{b.ip}</span><p>{reasons[b.reason] || 'Acesso temporariamente bloqueado'}</p><p>Liberação: {new Date(b.blockedUntil).toLocaleString('pt-BR')}</p></div>
        <button onClick={() => release(b.ip)} disabled={busy || !persistent} className="rounded-lg bg-[#ac174c] px-4 py-2 font-bold text-white disabled:opacity-50">Liberar IP</button>
      </div>)}
    </div>}
  </section>;
}
