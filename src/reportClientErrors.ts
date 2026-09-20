// Somente tipo e área: nunca enviar dados digitados, tokens ou mensagens
// de exceções que possam conter informações pessoais.
let lastSent = 0;
function report(code: 'JAVASCRIPT_ERROR' | 'UNHANDLED_PROMISE') {
  if (Date.now() - lastSent < 60000) return;
  lastSent = Date.now();
  const host = window.location.hostname;
  const area = host.startsWith('adminfenix.') ? 'Administração' : host.startsWith('suporte.') ? 'Suporte' : 'Site';
  void fetch('/api/content/client-error', { method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({ code,area }),keepalive:true }).catch(() => {});
}
window.addEventListener('error', () => report('JAVASCRIPT_ERROR'));
window.addEventListener('unhandledrejection', () => report('UNHANDLED_PROMISE'));
