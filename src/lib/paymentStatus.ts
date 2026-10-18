import { supabase } from './supabase';
import { AppSettings, Learner, Payment } from './types';
import { fetchAll, normalizeLearner, normalizePayment } from './db';
import {
  MONTH_NAMES,
  Period,
  addMonths,
  billPeriod,
  comparePeriods,
  currentPeriod,
  periodEnd,
  periodKey,
  periodOfDate,
} from './periods';

export { MONTH_NAMES };

// ---------------------------------------------------------------------------
// Fees
// ---------------------------------------------------------------------------

/** The learner's monthly fee, or null when no fee is configured anywhere. */
export function feeFor(learner: Pick<Learner, 'monthly_fee'>, settings: AppSettings): number | null {
  if (learner.monthly_fee !== null && learner.monthly_fee !== undefined) return learner.monthly_fee;
  return settings.default_monthly_fee > 0 ? settings.default_monthly_fee : null;
}

/** Should this learner be billed for `period`? (active, enrolled by then) */
export function isBillable(learner: Learner, period: Period): boolean {
  if (learner.active === false) return false;
  if (learner.status && learner.status !== 'active') return false;
  return !learner.enrollment_date || learner.enrollment_date <= periodEnd(period);
}

// ---------------------------------------------------------------------------
// Ledger: month-by-month payment history of one learner
// ---------------------------------------------------------------------------

export type MonthState = 'paid' | 'partial' | 'unpaid' | 'waived';

export interface LedgerMonth {
  key: string;
  period: Period;
  bill: Payment | null;
  /** null when no bill exists and no fee is configured */
  due: number | null;
  paid: number;
  balance: number;
  state: MonthState;
  isCurrent: boolean;
  isAdvance: boolean;
}

export interface Ledger {
  /** newest first */
  months: LedgerMonth[];
  totalPaid: number;
  totalDue: number;
  balance: number;
  paidCount: number;
  partialCount: number;
  unpaidCount: number;
  expectedCount: number;
  unknownFeeMonths: number;
  start: Period;
  lastPaymentDate: string | null;
}

export function buildLedger(learner: Learner, bills: Payment[], settings: AppSettings, today: Period = currentPeriod()): Ledger {
  const byKey = new Map<string, Payment>();
  bills.forEach((b) => byKey.set(periodKey(billPeriod(b)), b));
  const billPeriods = bills.map(billPeriod).sort(comparePeriods);

  let start = periodOfDate(learner.enrollment_date);
  if (billPeriods.length && comparePeriods(billPeriods[0], start) < 0) start = billPeriods[0];

  // Last month the learner is expected to pay for
  let end: Period = today;
  if (learner.status === 'abandoned' && learner.abandoned_at) {
    const left = periodOfDate(learner.abandoned_at);
    if (comparePeriods(left, end) < 0) end = left;
  } else if (learner.status === 'graduated' || learner.active === false) {
    const lastBill = billPeriods[billPeriods.length - 1];
    end = lastBill && comparePeriods(lastBill, today) <= 0 ? lastBill : addMonths(start, -1);
  }
  const lastBill = billPeriods[billPeriods.length - 1];
  const rangeEnd = lastBill && comparePeriods(lastBill, end) > 0 ? lastBill : end;

  const fee = feeFor(learner, settings);
  const months: LedgerMonth[] = [];
  for (let p = start; comparePeriods(p, rangeEnd) <= 0; p = addMonths(p, 1)) {
    const key = periodKey(p);
    const bill = byKey.get(key) || null;
    const isAdvance = comparePeriods(p, end) > 0;
    if (isAdvance && !bill) continue;

    let due: number | null;
    let paid = 0;
    let state: MonthState;
    if (bill) {
      due = bill.amount_due;
      paid = bill.amount_paid;
      state = due === 0 ? 'waived' : paid >= due ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
    } else if (fee === 0) {
      due = 0;
      state = 'waived';
    } else {
      due = fee;
      state = 'unpaid';
    }
    months.push({
      key,
      period: p,
      bill,
      due,
      paid,
      balance: due === null ? 0 : Math.max(0, due - paid),
      state,
      isCurrent: comparePeriods(p, today) === 0,
      isAdvance,
    });
  }
  months.reverse();

  const sum = (f: (m: LedgerMonth) => number) => months.reduce((s, m) => s + f(m), 0);
  const lastPaymentDate =
    bills
      .map((b) => b.payment_date)
      .filter((d): d is string => !!d)
      .sort()
      .pop() || null;

  return {
    months,
    totalPaid: sum((m) => m.paid),
    totalDue: sum((m) => m.due ?? 0),
    balance: sum((m) => m.balance),
    paidCount: months.filter((m) => m.state === 'paid' || m.state === 'waived').length,
    partialCount: months.filter((m) => m.state === 'partial').length,
    unpaidCount: months.filter((m) => m.state === 'unpaid').length,
    expectedCount: months.filter((m) => !m.isAdvance).length,
    unknownFeeMonths: months.filter((m) => m.due === null).length,
    start,
    lastPaymentDate,
  };
}

// ---------------------------------------------------------------------------
// Month status: who has / hasn't paid for one month
// ---------------------------------------------------------------------------

export interface MonthRow {
  learner: Learner;
  bill: Payment | null;
  due: number | null;
  paid: number;
  balance: number;
  state: MonthState;
}

export interface UnpaidLearner {
  learner: Learner;
  payment: Payment | null;
  reason: 'no_record' | 'marked_unpaid' | 'partial';
  /** remaining balance for the month, null when the fee is unknown */
  amountOwed: number | null;
  daysOverdue: number;
}

export async function fetchMonthRows(period: Period, settings: AppSettings): Promise<MonthRow[]> {
  const [learners, bills] = await Promise.all([
    fetchAll((f, t) => supabase.from('learners').select('*').order('full_name').range(f, t)),
    fetchAll((f, t) =>
      supabase.from('payments').select('*').eq('month', MONTH_NAMES[period.month]).eq('year', period.year).range(f, t)
    ),
  ]);
  const billByLearner = new Map<string, Payment>();
  bills.map(normalizePayment).forEach((b) => billByLearner.set(b.learner_id, b));

  const rows: MonthRow[] = [];
  learners.map(normalizeLearner).forEach((learner) => {
    const bill = billByLearner.get(learner.id) || null;
    // Non-billable learners only show up if they actually have a bill this month
    if (!bill && !isBillable(learner, period)) return;
    const fee = feeFor(learner, settings);
    const due = bill ? bill.amount_due : fee;
    const paid = bill ? bill.amount_paid : 0;
    const state: MonthState =
      due === 0 ? 'waived' : due !== null && paid >= due ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
    rows.push({ learner, bill, due, paid, balance: due === null ? 0 : Math.max(0, due - paid), state });
  });
  return rows;
}

function daysSincePeriodStart(period: Period): number {
  const start = new Date(period.year, period.month, 1);
  return Math.max(0, Math.floor((Date.now() - start.getTime()) / 86400000));
}

export async function fetchUnpaidLearners(period: Period, settings: AppSettings): Promise<UnpaidLearner[]> {
  const rows = await fetchMonthRows(period, settings);
  const days = daysSincePeriodStart(period);
  return rows
    .filter((r) => (r.state === 'unpaid' || r.state === 'partial') && isBillable(r.learner, period))
    .map((r) => ({
      learner: r.learner,
      payment: r.bill,
      reason: !r.bill ? 'no_record' : r.state === 'partial' ? 'partial' : 'marked_unpaid',
      amountOwed: r.due === null ? null : r.balance,
      daysOverdue: days,
    }));
}

export async function fetchUnpaidLearnerIds(period: Period, settings: AppSettings): Promise<Set<string>> {
  const unpaid = await fetchUnpaidLearners(period, settings);
  return new Set(unpaid.map((u) => u.learner.id));
}

// ---------------------------------------------------------------------------
// Recording payments
// ---------------------------------------------------------------------------

export interface AllocationLine {
  period: Period;
  existing: Payment | null;
  due: number;
  alreadyPaid: number;
  allocate: number;
}

/**
 * Spreads `amount` over consecutive months starting at `start`, filling each
 * month's remaining balance in order (oldest first).
 */
export function planAllocation(
  amount: number,
  start: Period,
  monthCount: number,
  billsByKey: Map<string, Payment>,
  fee: number
): { lines: AllocationLine[]; leftover: number } {
  let remaining = amount;
  const lines: AllocationLine[] = [];
  for (let i = 0; i < monthCount; i++) {
    const period = addMonths(start, i);
    const existing = billsByKey.get(periodKey(period)) || null;
    const due = existing ? existing.amount_due : fee;
    const alreadyPaid = existing ? existing.amount_paid : 0;
    const open = Math.max(0, due - alreadyPaid);
    const allocate = i === monthCount - 1 ? remaining : Math.min(open, remaining);
    remaining -= allocate;
    lines.push({ period, existing, due, alreadyPaid, allocate: Math.max(0, allocate) });
  }
  return { lines, leftover: Math.max(0, remaining) };
}

export interface ReceiptInput {
  learnerId: string;
  paidOn: string;
  method: string;
  reference?: string;
  notes?: string;
  recordedBy?: string;
}

/** Creates any missing bills, then one receipt per month with money allocated. */
export async function recordPayment(lines: AllocationLine[], input: ReceiptInput) {
  for (const line of lines) {
    let billId = line.existing?.id;
    if (!billId) {
      const { data, error } = await supabase
        .from('payments')
        .upsert(
          [
            {
              learner_id: input.learnerId,
              month: MONTH_NAMES[line.period.month],
              year: line.period.year,
              amount_due: line.due,
              amount: 0,
              status: 'Unpaid',
            },
          ],
          { onConflict: 'learner_id,month,year' }
        )
        .select('id')
        .single();
      if (error) throw error;
      billId = data.id as string;
    }
    if (line.allocate > 0) {
      const { error } = await supabase.from('payment_transactions').insert([
        {
          payment_id: billId,
          learner_id: input.learnerId,
          amount: line.allocate,
          paid_on: input.paidOn,
          method: input.method,
          reference: input.reference || null,
          notes: input.notes || null,
          recorded_by: input.recordedBy || null,
        },
      ]);
      if (error) throw error;
    }
  }
}
