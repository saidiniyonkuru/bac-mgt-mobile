import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AlertTriangle, Banknote, CalendarCheck, FileSpreadsheet, Receipt, Scale, TrendingUp, Users, Wallet } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { useApp } from '../lib/app';
import { fetchAll, normalizeExpense, normalizeLearner, normalizeTransaction } from '../lib/db';
import { fetchMonthRows, MonthRow } from '../lib/paymentStatus';
import { addMonths, currentPeriod, formatBIF, periodEnd, periodFromKey, periodKey, periodLabel, periodOfDate, periodStart } from '../lib/periods';
import { Attendance, Expense, Learner, Level, PaymentTransaction } from '../lib/types';
import { useLoad } from '../lib/useLoad';
import { shareCSV } from '../lib/csv';
import { Badge, Card, Loader, MonthStepper, ProgressBar, Row, Screen, Section, StatCard, T } from '../ui';
import { CardHeader, Metric } from '../ui/kit';
import { IncomeExpenseChart, MonthTotals } from '../ui/chart';
import { LEVEL_TONE } from '../ui/status';
import { colors, fonts, space } from '../ui/theme';
import { Download } from 'lucide-react-native';

const LEVELS: Level[] = ['Beginner', 'Intermediate', 'Advanced'];

type Tx = PaymentTransaction & { learner?: { full_name: string } | null; payment?: { month: string; year: number } | null };

interface Data {
  rows: MonthRow[];
  learners: Learner[];
  attendance: Attendance[];
  receiptsYear: Tx[];
  expensesYear: Expense[];
  trend: MonthTotals[];
}

export default function ReportsScreen() {
  const { settings, settingsLoaded } = useApp();
  const [monthKey, setMonthKey] = useState(periodKey(currentPeriod()));
  const period = periodFromKey(monthKey);

  const { data, refresh, refreshing } = useLoad<Data>(
    async () => {
      const trendStart = addMonths(period, -11);
      const yearStart = `${period.year}-01-01`;
      const from = periodStart(trendStart) < yearStart ? periodStart(trendStart) : yearStart;
      const [rows, learners, attendance, receipts, expenses] = await Promise.all([
        fetchMonthRows(period, settings),
        fetchAll((f, t) => supabase.from('learners').select('*').order('id').range(f, t)),
        fetchAll<Attendance>((f, t) => supabase.from('attendance').select('*').gte('date', periodStart(period)).lte('date', periodEnd(period)).order('id').range(f, t)),
        fetchAll((f, t) =>
          supabase.from('payment_transactions').select('*, learner:learners(full_name), payment:payments(month,year)').gte('paid_on', from).lte('paid_on', `${period.year}-12-31`).order('id').range(f, t)
        ),
        fetchAll((f, t) => supabase.from('expenses').select('*').gte('date', from).lte('date', `${period.year}-12-31`).order('id').range(f, t)),
      ]);
      const tx: Tx[] = (receipts as Record<string, unknown>[]).map((r) => ({
        ...normalizeTransaction(r),
        learner: r.learner as { full_name: string } | null,
        payment: r.payment as { month: string; year: number } | null,
      }));
      const ex = expenses.map(normalizeExpense);
      const trend = Array.from({ length: 12 }, (_, i) => {
        const p = addMonths(trendStart, i);
        const key = periodKey(p);
        return {
          label: periodLabel(p, true),
          income: tx.filter((t) => periodKey(periodOfDate(t.paid_on)) === key).reduce((s, t) => s + t.amount, 0),
          expenses: ex.filter((e) => periodKey(periodOfDate(e.date)) === key).reduce((s, e) => s + e.amount, 0),
        };
      });
      return { rows, learners: learners.map(normalizeLearner), attendance, receiptsYear: tx, expensesYear: ex, trend };
    },
    ['payments', 'payment_transactions', 'expenses', 'attendance', 'learners'],
    [monthKey, settings],
    settingsLoaded
  );

  const s = useMemo(() => {
    if (!data) return null;
    const inMonth = (d: string) => periodKey(periodOfDate(d)) === monthKey;
    const inYear = (d: string) => d.startsWith(String(period.year));
    const expected = data.rows.reduce((a, r) => a + (r.due ?? 0), 0);
    const collected = data.rows.reduce((a, r) => a + r.paid, 0);
    const levelOf = new Map(data.learners.map((l) => [l.id, l.level]));
    const byMethod = new Map<string, number>();
    data.receiptsYear.filter((t) => inMonth(t.paid_on)).forEach((t) => byMethod.set(t.method, (byMethod.get(t.method) || 0) + t.amount));
    return {
      expected,
      collected,
      outstanding: data.rows.reduce((a, r) => a + r.balance, 0),
      rate: expected ? Math.round((Math.min(collected, expected) / expected) * 100) : 0,
      incomeMonth: data.receiptsYear.filter((t) => inMonth(t.paid_on)).reduce((a, t) => a + t.amount, 0),
      incomeYear: data.receiptsYear.filter((t) => inYear(t.paid_on)).reduce((a, t) => a + t.amount, 0),
      expMonth: data.expensesYear.filter((e) => inMonth(e.date)).reduce((a, e) => a + e.amount, 0),
      expYear: data.expensesYear.filter((e) => inYear(e.date)).reduce((a, e) => a + e.amount, 0),
      byLevel: LEVELS.map((lvl) => {
        const rows = data.rows.filter((r) => r.learner.level === lvl);
        const att = data.attendance.filter((a) => levelOf.get(a.learner_id) === lvl && (a.present || !a.absence_reason));
        return {
          level: lvl,
          learners: rows.length,
          owing: rows.filter((r) => r.balance > 0).length,
          debt: rows.reduce((a, r) => a + r.balance, 0),
          collected: rows.reduce((a, r) => a + r.paid, 0),
          attendance: att.length ? Math.round((att.filter((a) => a.present).length / att.length) * 100) : null,
        };
      }),
      status: {
        active: data.learners.filter((l) => l.active !== false && (l.status || 'active') === 'active').length,
        abandoned: data.learners.filter((l) => l.status === 'abandoned').length,
        graduated: data.learners.filter((l) => l.status === 'graduated').length,
        inactive: data.learners.filter((l) => l.active === false).length,
      },
      byMethod: [...byMethod.entries()].sort((a, b) => b[1] - a[1]),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, monthKey]);

  const inMonth = (d: string) => periodKey(periodOfDate(d)) === monthKey;
  const exports = data
    ? [
        {
          label: 'Payment status',
          run: () => shareCSV(data.rows.map((r) => ({ Learner: r.learner.full_name, Level: r.learner.level, Due: r.due ?? '', Paid: r.paid, Balance: r.balance, Status: r.state })), `payment-status-${monthKey}.csv`),
        },
        {
          label: 'Receipts',
          run: () =>
            shareCSV(
              data.receiptsYear
                .filter((t) => inMonth(t.paid_on))
                .map((t) => ({
                  Date: t.paid_on,
                  Learner: t.learner?.full_name || '',
                  Amount: t.amount,
                  'For month': t.payment ? `${t.payment.month} ${t.payment.year}` : '',
                  Method: t.method,
                  Reference: t.reference || '',
                  'Recorded by': t.recorded_by || '',
                })),
              `receipts-${monthKey}.csv`
            ),
        },
        {
          label: 'Expenses',
          run: () =>
            shareCSV(
              data.expensesYear.filter((e) => inMonth(e.date)).map((e) => ({ Date: e.date, Category: e.category, Amount: e.amount, 'Paid to': e.vendor || '', Description: e.description || '' })),
              `expenses-${monthKey}.csv`
            ),
        },
        {
          label: 'Attendance',
          run: () => {
            const names = new Map(data.learners.map((l) => [l.id, l.full_name]));
            return shareCSV(
              data.attendance.map((a) => ({ Date: a.date, Learner: names.get(a.learner_id) || '', Present: a.present ? 'Yes' : 'No', Reason: a.absence_reason || '', Notes: a.notes || '' })),
              `attendance-${monthKey}.csv`
            );
          },
        },
        {
          label: 'Learners',
          everyone: true,
          run: () =>
            shareCSV(
              data.learners.map((l) => ({ Name: l.full_name, Phone: l.phone || '', Level: l.level, Enrolled: l.enrollment_date, Status: l.status || 'active', Fee: l.monthly_fee ?? 'default' })),
              'learners.csv'
            ),
        },
      ]
    : [];

  const maxMethod = s?.byMethod[0]?.[1] || 1;
  const netMonth = s ? s.incomeMonth - s.expMonth : 0;
  const netYear = s ? s.incomeYear - s.expYear : 0;

  return (
    <Screen noTitleInset refreshing={refreshing} onRefresh={refresh}>
      <MonthStepper value={monthKey} onChange={setMonthKey} />
      <View style={{ height: space.lg }} />
      {!data || !s ? (
        <Loader />
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
            <StatCard label="Expected" value={formatBIF(s.expected)} icon={Wallet} tone="blue" hint={`${data.rows.length} learners billed`} />
            <StatCard label="Collected" value={formatBIF(s.collected)} icon={TrendingUp} tone="green" hint={`${s.rate}% collection rate`} />
          </View>
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: space.xl }}>
            <StatCard label="Outstanding" value={formatBIF(s.outstanding)} icon={AlertTriangle} tone="red" alert={s.outstanding > 0} />
            <StatCard label="Net cash" value={formatBIF(netMonth)} icon={Scale} tone={netMonth >= 0 ? 'violet' : 'red'} hint="Received − spent" />
          </View>

          <Card style={{ marginBottom: space.xl }}>
            <CardHeader title="Income vs expenses" subtitle="Last 12 months · tap a month" />
            <View style={{ paddingHorizontal: space.lg, paddingBottom: space.lg }}>
              <IncomeExpenseChart data={data.trend} height={220} />
            </View>
          </Card>

          <Card style={{ marginBottom: space.xl }}>
            <CardHeader title="Cash flow" icon={Banknote} tone="green" />
            <View style={styles.table}>
              <View style={styles.tr}>
                <T v="caption" style={{ flex: 1.2 }} />
                <T v="overline" style={styles.num}>
                  {periodLabel(period, true)}
                </T>
                <T v="overline" style={styles.num}>
                  Year {period.year}
                </T>
              </View>
              <CashRow label="Income" month={s.incomeMonth} year={s.incomeYear} />
              <CashRow label="Expenses" month={-s.expMonth} year={-s.expYear} />
              <CashRow label="Net" month={netMonth} year={netYear} bold />
            </View>
          </Card>

          <Card style={{ marginBottom: space.xl }}>
            <CardHeader title="Received by method" subtitle={periodLabel(period)} icon={Receipt} tone="blue" />
            <View style={{ paddingHorizontal: space.lg, paddingBottom: space.lg, gap: 14 }}>
              {s.byMethod.length === 0 && <T v="callout">No receipts this month.</T>}
              {s.byMethod.map(([m, amount]) => (
                <View key={m}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                    <T v="label" color={colors.text}>
                      {m}
                    </T>
                    <T v="caption" style={{ fontVariant: ['tabular-nums'] }}>
                      {formatBIF(amount)}
                    </T>
                  </View>
                  <ProgressBar value={(amount / maxMethod) * 100} color={colors.income} />
                </View>
              ))}
            </View>
          </Card>

          <Section title={`By level · ${periodLabel(period, true)}`}>
            {s.byLevel.map((l, i) => (
              <View key={l.level} style={[styles.level, i < s.byLevel.length - 1 && styles.divider]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <Badge label={l.level} tone={LEVEL_TONE[l.level]} />
                  <T v="caption">
                    {l.learners} learner{l.learners === 1 ? '' : 's'}
                  </T>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Metric label="Collected" value={formatBIF(l.collected)} />
                  <Metric label="Debt" value={l.debt > 0 ? formatBIF(l.debt) : '—'} color={l.debt > 0 ? colors.red : colors.textFaint} hint={l.owing ? `${l.owing} owing` : undefined} />
                  <Metric label="Attendance" value={l.attendance === null ? '—' : `${l.attendance}%`} />
                </View>
              </View>
            ))}
          </Section>

          <Card style={{ padding: space.lg, marginBottom: space.xl }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <Users size={20} color={colors.violet} />
              <T v="headline">Learners</T>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              <Badge label={`${s.status.active} active`} tone="green" />
              <Badge label={`${s.status.abandoned} abandoned`} tone="slate" />
              <Badge label={`${s.status.graduated} graduated`} tone="blue" />
              <Badge label={`${s.status.inactive} inactive`} tone="slate" />
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 }}>
              <CalendarCheck size={15} color={colors.textFaint} />
              <T v="caption">Attendance excludes excused absences</T>
            </View>
          </Card>

          <Section title="Export data · CSV for Excel / Sheets">
            {exports.map((e, i) => (
              <Row
                key={e.label}
                onPress={e.run}
                left={<FileSpreadsheet size={22} color={colors.green} />}
                title={e.label}
                subtitle={e.everyone ? 'Everyone' : periodLabel(period)}
                right={<Download size={20} color={colors.textFaint} />}
                last={i === exports.length - 1}
              />
            ))}
          </Section>
        </>
      )}
    </Screen>
  );
}

function CashRow({ label, month, year, bold }: { label: string; month: number; year: number; bold?: boolean }) {
  const style = { fontFamily: bold ? fonts.extrabold : fonts.semibold, fontVariant: ['tabular-nums' as const] };
  return (
    <View style={[styles.tr, styles.trBorder]}>
      <T v={bold ? 'bodyStrong' : 'callout'} style={{ flex: 1.2 }}>
        {label}
      </T>
      <T v="label" color={bold && month < 0 ? colors.red : colors.text} style={[styles.num, style]} numberOfLines={1} adjustsFontSizeToFit>
        {formatBIF(month)}
      </T>
      <T v="label" color={bold && year < 0 ? colors.red : colors.text} style={[styles.num, style]} numberOfLines={1} adjustsFontSizeToFit>
        {formatBIF(year)}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  table: { paddingHorizontal: space.lg, paddingBottom: space.md },
  tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 8 },
  trBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  num: { flex: 1, textAlign: 'right' },
  level: { padding: space.lg },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
});
