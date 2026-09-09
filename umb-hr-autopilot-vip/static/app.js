/* UMB VIP shell JS — toast manager (Master §30): slide+fade 200-300ms, top-right */
function vipToast(msg, kind) {
  const box = document.getElementById('toasts');
  if (!box) return;
  const el = document.createElement('div');
  el.className = 'card text-sm px-3 py-2 toast-in' + (kind === 'error' ? ' !border-rose-500' : '');
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, kind === 'error' ? 6000 : 3000);
  setTimeout(() => el.remove(), kind === 'error' ? 6500 : 3400);
}
