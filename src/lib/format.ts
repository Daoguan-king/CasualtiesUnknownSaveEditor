export function fmtTime(sec: number): string {
  const s = Math.round(sec || 0);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return hh + ':' + String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
}

export const fmtNum = (v: unknown, digits = 2): string => {
  const n = typeof v === 'number' ? v : Number(v);
  if (!isFinite(n)) return String(v ?? '');
  return Math.abs(n % 1) < 1e-9 ? String(n) : n.toFixed(digits);
};

export const fmtPct = (v: number): string => Math.round((v || 0) * 100) + '%';

export const fmtBytes = (n: number): string => n < 1024 ? n + ' B' : (n / 1024).toFixed(1) + ' KB';
