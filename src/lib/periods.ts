// Billing months & dates. Formatting is done by hand (no Intl) so it is
// identical on every Android phone regardless of language settings.

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** A billing month. `month` is 0-11. */
export interface Period {
  year: number;
  month: number;
}

export const currentPeriod = (): Period => {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() };
};

export const periodKey = (p: Period) => `${p.year}-${String(p.month + 1).padStart(2, '0')}`;

export const periodFromKey = (key: string): Period => {
  const [y, m] = key.split('-').map((n) => parseInt(n, 10));
  return { year: y, month: m - 1 };
};

export const addMonths = (p: Period, n: number): Period => {
  const idx = p.year * 12 + p.month + n;
  return { year: Math.floor(idx / 12), month: ((idx % 12) + 12) % 12 };
};

export const comparePeriods = (a: Period, b: Period) => a.year * 12 + a.month - (b.year * 12 + b.month);

export const periodOfDate = (date: string): Period => {
  const [y, m] = date.slice(0, 10).split('-').map((n) => parseInt(n, 10));
  return { year: y, month: m - 1 };
};

export const periodLabel = (p: Period, short = false) =>
  short ? `${MONTH_NAMES[p.month].slice(0, 3)} ${String(p.year).slice(2)}` : `${MONTH_NAMES[p.month]} ${p.year}`;

export const billPeriod = (b: { month: string; year: number }): Period => ({
  year: b.year,
  month: Math.max(0, MONTH_NAMES.indexOf(b.month)),
});

export const periodStart = (p: Period) => `${periodKey(p)}-01`;
export const periodEnd = (p: Period) => {
  const last = new Date(p.year, p.month + 1, 0).getDate();
  return `${periodKey(p)}-${String(last).padStart(2, '0')}`;
};

// ---- dates ----

export const toISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const todayISO = () => toISODate(new Date());

export const parseISODate = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split('-').map((n) => parseInt(n, 10));
  return new Date(y, m - 1, d);
};

export const addDays = (s: string, n: number) => {
  const d = parseISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
};

type DateStyle = 'medium' | 'short' | 'long' | 'weekday' | 'monthYear';

/** medium: "18 Oct 2026" · short: "18 Oct" · long: "Sunday 18 October" · weekday: "Sun 18 Oct" · monthYear: "Oct 2026" */
export function formatDate(s?: string | null, style: DateStyle = 'medium') {
  if (!s) return '—';
  const d = parseISODate(s);
  const day = d.getDate();
  const mon = MONTH_NAMES[d.getMonth()];
  switch (style) {
    case 'short':
      return `${day} ${mon.slice(0, 3)}`;
    case 'long':
      return `${DAY_NAMES[d.getDay()]} ${day} ${mon}`;
    case 'weekday':
      return `${DAY_NAMES[d.getDay()].slice(0, 3)} ${day} ${mon.slice(0, 3)}`;
    case 'monthYear':
      return `${mon.slice(0, 3)} ${d.getFullYear()}`;
    default:
      return `${day} ${mon.slice(0, 3)} ${d.getFullYear()}`;
  }
}

/** Monday-based week key, e.g. '2026-10-12'. */
export const weekKey = (s: string) => {
  const d = parseISODate(s);
  const day = d.getDay();
  d.setDate(d.getDate() + ((day === 0 ? -6 : 1) - day));
  return toISODate(d);
};

export const durationLabel = (fromISO: string, to: Date = new Date()) => {
  const from = parseISODate(fromISO);
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1;
  if (months < 1) {
    const days = Math.max(0, Math.round((to.getTime() - from.getTime()) / 86400000));
    return `${days} day${days === 1 ? '' : 's'}`;
  }
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y && `${y} yr${y > 1 ? 's' : ''}`, m && `${m} mo`].filter(Boolean).join(' ');
};

// ---- money ----

const group = (n: number) => String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** "BIF 20,000" */
export const formatBIF = (n: number | null | undefined) => `${(n ?? 0) < 0 ? '−' : ''}BIF ${group(n ?? 0)}`;

/** Compact for charts: 1.2M, 450K */
export const compactNumber = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(Math.round(n));
};
