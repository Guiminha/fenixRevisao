// One identifier per document: reloads and separate tabs cannot close each other.
const tabId = crypto.randomUUID();

export function startSessionPresence(onExpired: () => void): () => void {
  let stopped = false;
  let leaving = false;
  let pending = false;
  const heartbeat = async () => {
    if (stopped || leaving || pending) return;
    pending = true;
    try {
      const response = await fetch('/api/auth/presence', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tabId }), signal: AbortSignal.timeout(10_000),
      });
      if (response.status === 401 && !stopped && !leaving) onExpired();
    } catch { /* Temporary network failures are covered by the server grace period. */ }
    finally { pending = false; }
  };
  const close = () => {
    leaving = true;
    const body = JSON.stringify({ tabId, closing: true });
    const queued = navigator.sendBeacon?.('/api/auth/presence', new Blob([body], { type: 'application/json' }));
    if (!queued) void fetch('/api/auth/presence', {
      method: 'POST', credentials: 'same-origin', keepalive: true,
      headers: { 'Content-Type': 'application/json' }, body,
    }).catch(() => {});
  };
  const resume = () => { leaving = false; void heartbeat(); };
  const visible = () => { if (document.visibilityState === 'visible') resume(); };
  const timer = window.setInterval(() => void heartbeat(), 30_000);
  window.addEventListener('pagehide', close);
  window.addEventListener('pageshow', resume);
  window.addEventListener('online', resume);
  document.addEventListener('visibilitychange', visible);
  void heartbeat();
  return () => {
    stopped = true;
    window.clearInterval(timer);
    window.removeEventListener('pagehide', close);
    window.removeEventListener('pageshow', resume);
    window.removeEventListener('online', resume);
    document.removeEventListener('visibilitychange', visible);
  };
}
