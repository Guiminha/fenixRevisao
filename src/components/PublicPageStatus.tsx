export default function PublicPageStatus({ failed, retry, message }: { failed: boolean; retry: () => void; message?: string }) {
  return <div className="min-h-[40vh] flex flex-col items-center justify-center gap-4" role="status">
    <p>{failed ? (message || 'Não foi possível carregar esta página.') : 'Carregando…'}</p>
    {failed && <button className="btn-gold-metallic rounded-xl px-6 py-3" onClick={retry}>Tentar novamente</button>}
  </div>;
}
