import { useEffect, useState } from 'react';
import type { PaginaBloco } from './types';

// As páginas institucionais só baixam seus blocos quando são abertas.
export function usePublicPage(page: 'biografia' | 'tecnologias' | 'elite') {
  const [blocos, setBlocos] = useState<PaginaBloco[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    fetch(`/api/content/page/${page}`, { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Página indisponível.');
        const data = await response.json();
        if (!Array.isArray(data.blocos)) throw new Error('Resposta inválida.');
        setBlocos(data.blocos);
      })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [page, attempt]);
  return { blocos, failed, retry: () => setAttempt(value => value + 1) };
}
