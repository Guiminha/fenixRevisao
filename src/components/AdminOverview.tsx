import React, { useEffect, useState } from 'react';

const names: Record<string, string> = { A: 'Ativo', I: 'Inativo', P: 'Pendente', S: 'Suspenso', D: 'Descredenciado' };
const situation = (value?: string) => value ? `${names[value] || value} (${value})` : 'Novo cadastro';
const date = (value?: string) => value ? new Date(value).toLocaleString('pt-BR') : 'Ainda sem registros';
const number = (value: number) => Number(value || 0).toLocaleString('pt-BR');
type Report = {
  generatedAt: string; startedAt: string | null; days: number; uniqueDIs: number;
  totals: Record<string, number>;
  collection: { failedWrites: number; lastFailure: string | null; scope: string };
  ranking: { kind: string; entity_id: string; title: string; count: number }[];
  access: { codigo: string; count: number; last_access: string }[];
  daily: { day: string; kind: string; count: number }[];
  situations: { situation: string; count: number }[];
  transitions: { previous: string; current: string; count: number }[];
  changes: { id: string; occurred_at: string; entity_id: string; detail: { name: string; previous?: string; current: string } }[];
  errors: { id: string; occurred_at: string; detail: { source: string; code: string; message: string; route?: string } }[];
};
function exportCsv(name: string, rows: unknown[][]) {
  const cell = (value: unknown) => {
    const text = String(value ?? '');
    return `"${(/^\s*[=+@\-]/.test(text) ? "'" : '') + text.replace(/"/g, '""')}"`;
  };
  const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.map(cell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = `${name}.csv`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Bars({ rows }: { rows: { label: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map(row => Number(row.count)));
  return rows.length ? <div className="space-y-3 max-h-80 overflow-auto pr-2">{rows.map((row, index) => <div key={`${row.label}-${index}`}>
    <div className="flex justify-between gap-4 text-sm mb-1"><span>{row.label}</span><strong>{number(row.count)}</strong></div>
    <div className="h-2 rounded bg-white/10"><div className="h-full bg-[#d12a62] rounded" style={{ width: `${100 * row.count / max}%` }} /></div>
  </div>)}</div> : <p className="text-gray-400 text-sm">Nenhum registro neste período.</p>;
}
function Section({ title, children }: React.PropsWithChildren<{ title: string }>) {
  return <section className="bg-[#151b22] rounded-2xl border border-white/10 p-5 space-y-4"><h3 className="font-bold text-lg">{title}</h3>{children}</section>;
}
const button = 'px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-50 text-sm cursor-pointer';

export function AdminOverview() {
  const [days, setDays] = useState(30);
  const [revision, setRevision] = useState(0);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(() => controller.abort(), 15000);
    setLoading(true); setError(''); setReport(null);
    fetch(`/api/admin/metrics?days=${days}`, { signal: controller.signal, cache: 'no-store' })
      .then(async res => { const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Falha ao consultar os dados.'); return data; })
      .then(data => { if (active) setReport(data); }).catch(e => { if (active) setError(controller.signal.aborted ? 'Tempo esgotado. Tente atualizar.' : e.message); })
      .finally(() => { clearTimeout(timer); if (active) setLoading(false); });
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [days, revision]);
  return <div className="space-y-6 text-white">
    <header className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-2xl font-bold">Visão Geral</h2><p className="text-sm text-gray-400">Atividade real dos D.I.s e funcionamento do sistema.</p></div>
      <div className="flex gap-3"><select aria-label="Período dos relatórios" value={days} onChange={e => setDays(Number(e.target.value))} className="bg-[#151b22] border border-white/20 rounded-lg px-3">{[7,30,90].map(n => <option key={n} value={n}>Últimos {n} dias</option>)}</select><button className={button} disabled={loading} onClick={() => setRevision(n => n + 1)}>Atualizar</button></div>
    </header>
    {loading && <p role="status">Consultando dados…</p>}
    {error && <p role="alert" className="p-4 border border-red-500/30 rounded-xl text-red-300">{error}</p>}
    {report && <>
      <p className="text-xs text-gray-400">Consultado em {date(report.generatedAt)}. Primeiro registro: {date(report.startedAt || undefined)}. Os relatórios não estimam atividade anterior ao início da coleta. Administradores e suporte não entram nos acessos de D.I.s.</p>
      {report.collection.failedWrites > 0 && <p role="alert" className="p-4 bg-amber-950/40 text-amber-200 rounded-xl">A coleta falhou para {number(report.collection.failedWrites)} evento(s) desde o início deste servidor. Os números podem estar incompletos. Última falha: {date(report.collection.lastFailure || undefined)}.</p>}
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">{[['Logins de D.I.s',report.totals.login],['D.I.s que acessaram',report.uniqueDIs],['Novos D.I.s cadastrados',report.totals.di_new],['Mudanças de situação',report.totals.di_status]].map(([label,count]) => <div key={String(label)} className="p-5 rounded-2xl border border-white/10 bg-[#151b22]"><p className="text-sm text-gray-400">{label}</p><strong className="text-3xl">{number(Number(count || 0))}</strong></div>)}</div>
      <Section title="Acessos de D.I.s">
        <p className="text-sm text-gray-400">Cada login concluído conta como um acesso. Renovação de sessão não conta novamente. Dias no horário de Brasília.</p>
        <Bars rows={report.daily.filter(row => row.kind === 'login').map(row => ({ label: row.day.split('-').reverse().join('/'), count: row.count }))} />
        <button className={button} onClick={() => exportCsv('acessos-di', [['D.I.','Logins','Último acesso'], ...report.access.map(row => [row.codigo,row.count,date(row.last_access)])])}>Exportar acessos CSV</button>
        <details><summary className="cursor-pointer">Acessos por D.I. ({report.access.length})</summary><div className="max-h-80 overflow-auto mt-3"><table className="w-full text-left text-sm"><thead><tr><th>D.I.</th><th>Logins</th><th>Último acesso</th></tr></thead><tbody>{report.access.map(row => <tr key={row.codigo} className="border-t border-white/10"><td className="py-2">{row.codigo}</td><td>{number(row.count)}</td><td>{date(row.last_access)}</td></tr>)}</tbody></table></div></details>
      </Section>
      <div className="grid lg:grid-cols-2 gap-6"><Section title="Situação atual do grupo"><p className="text-sm text-gray-400">Todos os cadastros atuais, independentemente do período selecionado.</p><Bars rows={report.situations.map(row => ({ label: situation(row.situation), count: row.count }))}/></Section>
        <Section title="Mudanças de situação no período"><Bars rows={report.transitions.map(row => ({ label: `${situation(row.previous)} → ${situation(row.current)}`, count: row.count }))}/></Section></div>
      <Section title="Histórico de atualizações dos D.I.s">
        <p className="text-sm text-gray-400">Até 200 alterações mais recentes do período. Os totais acima incluem todas as alterações.</p>
        <button className={button} onClick={() => exportCsv('mudancas-di', [['Data','D.I.','Nome','Anterior','Atual'], ...report.changes.map(row => [date(row.occurred_at),row.entity_id,row.detail.name,situation(row.detail.previous),situation(row.detail.current)])])}>Exportar alterações exibidas CSV</button>
        {report.changes.length ? <div className="max-h-96 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th>Data</th><th>D.I.</th><th>Nome</th><th>Anterior</th><th>Atual</th></tr></thead><tbody>{report.changes.map(row => <tr key={row.id} className="border-t border-white/10"><td className="py-3 pr-4">{date(row.occurred_at)}</td><td className="pr-4">{row.entity_id}</td><td className="pr-4">{row.detail.name}</td><td className="pr-4">{situation(row.detail.previous)}</td><td>{situation(row.detail.current)}</td></tr>)}</tbody></table></div> : <p className="text-gray-400">Nenhuma alteração registrada neste período.</p>}
      </Section>
      {([['download','Downloads de materiais'],['course','Acessos a cursos'],['training','Acessos a treinamentos']] as const).map(([kind,title]) => <Section key={kind} title={`${title} — ${number(report.totals[kind])}`}>
        <p className="text-sm text-gray-400">{kind === 'download' ? 'Arquivos entregues com sucesso pelo servidor. Falhas não contam como download.' : 'Aberturas de conteúdo por D.I.s autenticados. Não representa conclusão ou tempo assistido.'}</p>
        <Bars rows={report.ranking.filter(row => row.kind === kind).map(row => ({ label: row.title, count: row.count }))}/>
        <button className={button} onClick={() => exportCsv(kind, [['Conteúdo','Quantidade'], ...report.ranking.filter(row => row.kind === kind).map(row => [row.title,row.count])])}>Exportar relatório CSV</button>
      </Section>)}
      <Section title="Resumo do período"><p>{number(report.totals.login)} logins de {number(report.uniqueDIs)} D.I.s, {number(report.totals.download)} downloads, {number(report.totals.course)} aberturas de cursos e {number(report.totals.training)} de treinamentos. {number(report.totals.di_new)} novos cadastros e {number(report.totals.di_status)} mudanças de situação.</p><button className={button} onClick={() => exportCsv('resumo', [['Período (dias)',days],['Gerado em',date(report.generatedAt)],['D.I.s únicos',report.uniqueDIs],...Object.entries(report.totals)])}>Exportar resumo CSV</button></Section>
      <Section title="Erros do sistema">
        <p className="text-sm text-gray-400">Falhas da API, sincronização, verificações dos servidores e erros relatados por navegadores autenticados. Repetições iguais são agrupadas em intervalos de um minuto. Até 100 registros recentes do período; não é uma verificação contínua dos servidores.</p>
        <button className={button} onClick={() => exportCsv('erros', [['Data','Origem','Código','Mensagem','Rota'], ...report.errors.map(row => [date(row.occurred_at),row.detail.source,row.detail.code,row.detail.message,row.detail.route])])}>Exportar erros exibidos CSV</button>
        {report.errors.length ? <div className="space-y-3 max-h-96 overflow-auto">{report.errors.map(row => <article key={row.id} className="border border-red-400/20 bg-red-950/20 rounded-xl p-4"><p className="text-sm text-red-200">{row.detail.source} · {row.detail.code} · {date(row.occurred_at)}</p><p>{row.detail.message}</p>{row.detail.route && <p className="text-xs text-gray-400">{row.detail.route}</p>}</article>)}</div> : <p className="text-gray-400">Nenhum erro registrado neste período.</p>}
      </Section>
    </>}
  </div>;
}
