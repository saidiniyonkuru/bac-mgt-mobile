import { Payment, PaymentTransaction, Expense, Learner } from './types';

type PageResult<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

/**
 * Supabase returns at most 1000 rows per request. Pages through a query so
 * totals and histories are never silently truncated.
 */
export async function fetchAll<T>(build: (from: number, to: number) => PageResult<T>, pageSize = 1000): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
}

type Row = Record<string, unknown>;

export const num = (v: unknown): number => {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : 0;
  return Number.isFinite(n) ? n : 0;
};

export const normalizePayment = (p: Row): Payment =>
  ({
    ...p,
    amount: num(p.amount),
    amount_due: num(p.amount_due ?? p.amount),
    amount_paid: num(p.amount_paid),
  }) as Payment;

export const normalizeTransaction = (t: Row): PaymentTransaction => ({ ...t, amount: num(t.amount) }) as PaymentTransaction;

export const normalizeExpense = (e: Row): Expense => ({ ...e, amount: num(e.amount) }) as Expense;

export const normalizeLearner = (l: Row): Learner =>
  ({
    ...l,
    monthly_fee: l.monthly_fee === null || l.monthly_fee === undefined ? null : num(l.monthly_fee),
  }) as Learner;

/** Turns any thrown value into a readable message for toasts. */
export function errorMessage(err: unknown): string {
  if (!err) return 'Something went wrong';
  if (typeof err === 'string') return err;
  const anyErr = err as { message?: string; details?: string };
  const msg = anyErr.message || anyErr.details || 'Something went wrong';
  if (/schema cache|does not exist|column/i.test(msg)) {
    return `${msg} — the latest database migration may not be applied yet.`;
  }
  return msg;
}
