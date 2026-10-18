/**
 * Billing and attendance rules shared with the web app.
 */
import { buildLedger, planAllocation } from '../src/lib/paymentStatus';
import { computeAbsenceWarnings } from '../src/lib/attendanceStatus';
import { Attendance, Learner, Payment } from '../src/lib/types';

jest.mock('../src/lib/supabase', () => ({ supabase: {} }));

const settings = { club_name: 'Test', default_monthly_fee: 20000, absence_warning_weeks: 3 };

const learner = (over: Partial<Learner> = {}): Learner => ({
  id: 'a',
  full_name: 'Aline',
  level: 'Beginner',
  enrollment_date: '2026-08-05',
  active: true,
  status: 'active',
  created_at: '',
  updated_at: '',
  ...over,
});

const bill = (month: string, due: number, paid: number): Payment => ({
  id: month,
  learner_id: 'a',
  amount: paid,
  amount_due: due,
  amount_paid: paid,
  month,
  year: 2026,
  status: paid >= due ? 'Paid' : paid > 0 ? 'Partial' : 'Unpaid',
  created_at: '',
  updated_at: '',
});

describe('planAllocation', () => {
  it('fills the oldest month first', () => {
    const { lines, leftover } = planAllocation(30000, { year: 2026, month: 0 }, 2, new Map(), 20000);
    expect(lines.map((l) => l.allocate)).toEqual([20000, 10000]);
    expect(leftover).toBe(0);
  });

  it('keeps an overpayment as credit on the last month', () => {
    const { lines } = planAllocation(50000, { year: 2026, month: 0 }, 2, new Map(), 20000);
    expect(lines.map((l) => l.allocate)).toEqual([20000, 30000]);
  });

  it('tops up an existing partial bill', () => {
    const bills = new Map([['2026-01', bill('January', 20000, 5000)]]);
    const { lines } = planAllocation(15000, { year: 2026, month: 0 }, 1, bills, 20000);
    expect(lines[0]).toMatchObject({ due: 20000, alreadyPaid: 5000, allocate: 15000 });
  });
});

describe('buildLedger', () => {
  it('bills every month since enrollment, newest first', () => {
    const ledger = buildLedger(learner(), [bill('August', 20000, 20000), bill('September', 20000, 5000)], settings, { year: 2026, month: 9 });
    expect(ledger.months.map((m) => [m.key, m.state])).toEqual([
      ['2026-10', 'unpaid'],
      ['2026-09', 'partial'],
      ['2026-08', 'paid'],
    ]);
    expect(ledger.balance).toBe(35000);
    expect(ledger.totalPaid).toBe(25000);
    expect([ledger.paidCount, ledger.partialCount, ledger.unpaidCount]).toEqual([1, 1, 1]);
  });

  it('never bills a free learner', () => {
    const ledger = buildLedger(learner({ monthly_fee: 0 }), [], settings, { year: 2026, month: 9 });
    expect(ledger.balance).toBe(0);
    expect(ledger.months.every((m) => m.state === 'waived')).toBe(true);
  });
});

describe('computeAbsenceWarnings', () => {
  const att = (learner_id: string, date: string, present: boolean, absence_reason: Attendance['absence_reason'] = null): Attendance => ({
    id: `${learner_id}-${date}`,
    learner_id,
    date,
    present,
    absence_reason,
    created_at: '',
  });
  const people = [learner({ id: 'a' }), learner({ id: 'b', full_name: 'Bosco' })];
  const sessions = ['2026-09-07', '2026-09-14', '2026-09-21'];
  const others = sessions.map((d) => att('b', d, true));

  it('warns after missing class three different weeks without a reason', () => {
    const warnings = computeAbsenceWarnings(people, others, 3);
    expect(warnings.map((w) => [w.learner.id, w.weeks, w.missed.length])).toEqual([['a', 3, 3]]);
  });

  it('does not warn once the learner came back', () => {
    expect(computeAbsenceWarnings(people, [...others, att('a', '2026-09-21', true)], 3)).toEqual([]);
  });

  it('skips excused absences', () => {
    expect(computeAbsenceWarnings(people, [...others, att('a', '2026-09-14', false, 'Sick')], 3)).toEqual([]);
  });
});
