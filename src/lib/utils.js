function locale(lang) {
  return lang === 'ky' ? 'ky-KG' : 'ru-RU';
}

export function formatCurrency(amount, lang = 'ru') {
  if (amount == null) return `0 сом`;
  return new Intl.NumberFormat(locale(lang)).format(Math.round(amount)) + ` сом`;
}

export function formatDate(iso, lang = 'ru') {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(locale(lang), { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatDateTime(iso, lang = 'ru') {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString(locale(lang), { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString(locale(lang), { hour: '2-digit', minute: '2-digit' });
}

export function formatTime(iso, lang = 'ru') {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleTimeString(locale(lang), { hour: '2-digit', minute: '2-digit' });
}

export function statusBadgeClass(status) {
  return `badge badge-${status}`;
}

const STATUS_LABELS_RU = {
  created: 'Создан', design: 'Дизайн', production: 'Производство',
  design_done: 'Макет готов', printed: 'Напечатано', postprocess: 'Постобработка',
  ready: 'Готов', closed: 'Закрыт', cancelled: 'Отменён', defect: 'Брак',
};
const STATUS_LABELS_KY = {
  created: 'Түзүлдү', design: 'Дизайн', production: 'Өндүрүш',
  design_done: 'Макет даяр', printed: 'Басылды', postprocess: 'Кийинки иштетүү',
  ready: 'Даяр', closed: 'Жабык', cancelled: 'Жокко чыгарылды', defect: 'Брак',
};
export function statusLabel(status, lang = 'ru') {
  const labels = lang === 'ky' ? STATUS_LABELS_KY : STATUS_LABELS_RU;
  return labels[status] || status;
}

const ROLE_LABELS_RU = {
  director: 'Директор', manager: 'Менеджер', designer: 'Дизайнер',
  master: 'Мастер', assistant: 'Помощник',
};
const ROLE_LABELS_KY = {
  director: 'Директор', manager: 'Менеджер', designer: 'Дизайнер',
  master: 'Уста', assistant: 'Жардамчы',
};
export function roleLabel(role, lang = 'ru') {
  const labels = lang === 'ky' ? ROLE_LABELS_KY : ROLE_LABELS_RU;
  return labels[role] || role;
}

export function isOverdue(order) {
  if (!order.deadline) return false;
  if (['ready', 'closed', 'cancelled', 'defect'].includes(order.status)) return false;
  const raw = String(order.deadline).trim();
  if (!raw) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split('-').map(Number);
    const endOfDay = new Date(y, m - 1, d, 23, 59, 59, 999);
    return endOfDay < new Date();
  }
  const deadline = new Date(raw);
  if (Number.isNaN(deadline.getTime())) return false;
  return deadline < new Date();
}

export function debounce(fn, ms = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

import { apiUrl } from './api.js';

export function buildUploadUrl(fileRef) {
  if (!fileRef || typeof fileRef !== 'string') return '';
  let normalized = fileRef.trim().replace(/\\/g, '/');
  if (!normalized) return '';
  if (/^https?:\/\//i.test(normalized)) return normalized;
  if (normalized.startsWith('/api/uploads/')) return apiUrl(normalized);
  if (normalized.startsWith('api/uploads/')) return apiUrl(`/${normalized}`);
  if (/^uploads\//i.test(normalized)) normalized = normalized.replace(/^uploads\//i, '');
  if (/\/uploads\//i.test(normalized)) normalized = normalized.split(/\/uploads\//i).pop() || '';
  if (normalized.startsWith('/')) return apiUrl(normalized);
  const encodedPath = normalized
    .split('/').filter(Boolean)
    .map(part => encodeURIComponent(part))
    .join('/');
  return apiUrl(`/api/uploads/${encodedPath}`);
}

let closeImageViewerFn = null;
export function openImageViewer(src, alt = 'Фото') {
  if (!src) return;
  if (typeof closeImageViewerFn === 'function') closeImageViewerFn();

  const overlay = document.createElement('div');
  overlay.className = 'image-viewer-overlay';
  const img = document.createElement('img');
  img.className = 'image-viewer-img';
  img.src = src;
  img.alt = alt;
  img.addEventListener('click', e => e.stopPropagation());

  const onKeyDown = (e) => { if (e.key === 'Escape') close(); };
  function close() {
    overlay.remove();
    document.removeEventListener('keydown', onKeyDown);
    if (closeImageViewerFn === close) closeImageViewerFn = null;
  }
  overlay.addEventListener('click', close);
  overlay.appendChild(img);
  document.body.appendChild(overlay);
  document.addEventListener('keydown', onKeyDown);
  closeImageViewerFn = close;
}
