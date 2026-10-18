import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { AlertTriangle, CalendarCheck, CalendarX, Phone, Receipt, Scale, ShieldCheck, UserPlus, Users, Wallet } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { useApp } from '../lib/app';
import { fetchAll, num } from '../lib/db';
import { fetchMonthRows, MonthRow } from '../lib/paymentStatus';
import { AbsenceWarning, fetchAbsenceWarnings } from '../lib/attendanceStatus';
import { addMonths, currentPeriod, formatBIF, formatDate, periodEnd, periodKey, periodLabel, periodOfDate, periodStart, todayISO } from '../lib/periods';
import { useLoad } from '../lib/useLoad';
import { useNav } from '../navigation/types';
import { Avatar, Badge, Button, Card, EmptyState, IconButton, Loader, Logo, ProgressBar, Row, Screen, Section, StatCard, T } from '../ui';
import { Banner, CardHeader, Gradient } from '../ui/kit';
import { IncomeExpenseChart, MonthTotals } from '../ui/chart';
import { colors, fonts, ICON_STROKE, radius, shadow, space } from '../ui/theme';
import { haptic } from '../ui/feedback';

interface Data {
  rows: MonthRow[];
  warnings: AbsenceWarning[];
  presentToday: number;
  activeLearners: number;
  trend: MonthTotals[];
}

export default function HomeScreen() {
  const { user, settings, settingsLoaded } = useApp();
  const { nav, openLearner, recordPayment, editLearner, goTab } = useNav();
  const period = currentPeriod();

  const { data, refresh, refreshing } = useLoad<Data>(
    async () => {
      const from = addMonths(period, -5);
      const [rows, warnings, today, tx, ex] = await Promise.all([
        fetchMonthRows(period, settings),
        fetchAbsenceWarnings(settings.absence_warning_weeks),
        supabase.from('attendance').select('id', { count: 'exact', head: true }).eq('date', todayISO()).eq('present', true),
        fetchAll<{ amount: number; paid_on: string }>((f, t) =>
          supabase.from('payment_transactions').select('amount,paid_on').gte('paid_on', periodStart(from)).lte('paid_on', periodEnd(period)).order('id').range(f, t)
        ),
        fetchAll<{ amount: number; date: string }>((f, t) =>
          supabase.from('expenses').select('amount,date').gte('date', periodStart(from)).lte('date', periodEnd(period)).order('id').range(f, t)
        ),
      ]);
      const trend: MonthTotals[] = Array.from({ length: 6 }, (_, i) => {
        const p = addMonths(from, i);
        const key = periodKey(p);
        return {
          label: periodLabel(p, true),
          income: tx.filter((t) => periodKey(periodOfDate(t.paid_on)) === key).reduce((s, t) => s + num(t.amount), 0),
          expenses: ex.filter((e) => periodKey(periodOfDate(e.date)) === key).reduce((s, e) => s + num(e.amount), 0),
        };
      });
      return {
        rows,
        warnings,
        presentToday: today.count || 0,
        activeLearners: rows.filter((r) => r.learner.active !== false && (r.learner.status || 'active') === 'active').length,
        trend,
      };
    },
    ['learners', 'payments', 'payment_transactions', 'attendance', 'expenses'],
    [settings],
    settingsLoaded
  );

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const name = (user?.email || '').split('@')[0];
  const displayName = name ? name.charAt(0).toUpperCase() + name.slice(1) : '';

  const header = (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <T v="callout">{formatDate(todayISO(), 'long')}</T>
        <T v="title" numberOfLines={1} style={{ marginTop: 2 }}>
          {greeting}
          {displayName ? `, ${displayName}` : ''}
        </T>
      </View>
      <Pressable onPress={() => goTab('More')} accessibilityLabel="Account and more">
        <Logo size={42} />
      </Pressable>
    </View>
  );

  if (!data) {
    return (
      <Screen>
        {header}
        <Loader />
      </Screen>
    );
  }

  const owing = data.rows.filter((r) => r.state === 'unpaid' || r.state === 'partial').sort((a, b) => b.balance - a.balance);
  const expected = data.rows.reduce((s, r) => s + (r.due ?? 0), 0);
  const collected = data.rows.reduce((s, r) => s + r.paid, 0);
  const outstanding = data.rows.reduce((s, r) => s + r.balance, 0);
  const rate = expected ? Math.round((Math.min(collected, expected) / expected) * 100) : 0;
  const thisMonth = data.trend[data.trend.length - 1];
  const net = thisMonth.income - thisMonth.expenses;

  const actions = [
    { label: 'Payment', icon: Wallet, onPress: () => recordPayment({}), primary: true, color: colors.primary },
    { label: 'Attendance', icon: CalendarCheck, onPress: () => goTab('Attendance'), color: colors.green },
    { label: 'Learner', icon: UserPlus, onPress: () => editLearner(null), color: colors.violet },
    { label: 'Expense', icon: Receipt, onPress: () => nav.navigate('ExpenseForm', {}), color: colors.amber },
  ];

  return (
    <Screen refreshing={refreshing} onRefresh={refresh}>
      {header}

      {settings.default_monthly_fee <= 0 && (
        <Banner icon={AlertTriangle} tone="amber" onPress={() => nav.navigate('Settings')}>
          Set your monthly fee in Settings so the app can calculate what each learner owes.
        </Banner>
      )}

      {/* Collection hero */}
      <Pressable onPress={() => { haptic(); goTab('Payments'); }} style={({ pressed }) => [{ marginBottom: space.lg }, pressed && { transform: [{ scale: 0.99 }] }]}>
        <Gradient style={styles.hero}>
          <T v="label" color="#C7D7FE">
            Collected · {periodLabel(period)}
          </T>
          <T style={styles.heroAmount} numberOfLines={1} adjustsFontSizeToFit>
            {formatBIF(collected)}
          </T>
          <T v="callout" color="#C7D7FE">
            of {formatBIF(expected)} expected · {rate}%
          </T>
          <View style={{ marginTop: 14 }}>
            <ProgressBar value={rate} color={colors.cyan} track="rgba(255,255,255,0.22)" height={8} />
          </View>
          <View style={styles.heroFooter}>
            <View style={{ flex: 1 }}>
              <T v="caption" color="#C7D7FE">
                {outstanding > 0 ? 'Still to collect' : 'All collected'}
              </T>
              <T v="headline" color="#fff" numberOfLines={1} adjustsFontSizeToFit>
                {formatBIF(outstanding)}
              </T>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <T v="caption" color="#C7D7FE">
                Not fully paid
              </T>
              <T v="headline" color="#fff">
                {owing.length}
                <T v="callout" color="#C7D7FE">
                  {' '}
                  of {data.rows.length}
                </T>
              </T>
            </View>
          </View>
        </Gradient>
      </Pressable>

      {/* Quick actions */}
      <View style={styles.actions}>
        {actions.map((a) => (
          <Pressable key={a.label} onPress={() => { haptic(); a.onPress(); }} style={({ pressed }) => [styles.action, pressed && { transform: [{ scale: 0.95 }] }]}>
            <View style={[styles.actionIcon, a.primary ? { backgroundColor: a.color } : { backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }]}>
              <a.icon size={26} color={a.primary ? '#fff' : a.color} strokeWidth={ICON_STROKE} />
            </View>
            <T v="label" color={colors.textSecondary} style={{ fontSize: 13 }}>
              {a.label}
            </T>
          </Pressable>
        ))}
      </View>

      {/* KPIs */}
      <View style={styles.grid}>
        <StatCard label="Active learners" value={data.activeLearners} icon={Users} tone="blue" onPress={() => goTab('Learners')} />
        <StatCard label="Present today" value={data.presentToday} icon={CalendarCheck} tone="green" hint={`of ${data.activeLearners} active`} onPress={() => goTab('Attendance')} />
      </View>
      <View style={[styles.grid, { marginBottom: space.xl }]}>
        <StatCard
          label="Absence warnings"
          value={data.warnings.length}
          icon={CalendarX}
          tone={data.warnings.length ? 'red' : 'slate'}
          alert={data.warnings.length > 0}
          hint={`${settings.absence_warning_weeks}+ weeks, no reason`}
          onPress={() => goTab('Attendance')}
        />
        <StatCard
          label="Net this month"
          value={formatBIF(net)}
          icon={Scale}
          tone={net >= 0 ? 'violet' : 'red'}
          hint={`${formatBIF(thisMonth.income)} in`}
          onPress={() => nav.navigate('Expenses')}
        />
      </View>

      {/* Not paid */}
      <Section
        title={`Not paid · ${periodLabel(period)}`}
        action={owing.length > 0 ? <Badge label={String(owing.length)} tone="red" solid /> : undefined}
      >
        {owing.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="Everyone has paid" message="No outstanding balance this month." />
        ) : (
          <>
            {owing.slice(0, 6).map((r, i) => (
              <Row
                key={r.learner.id}
                onPress={() => openLearner(r.learner.id, 'payments')}
                left={<Avatar name={r.learner.full_name} alert={r.state === 'unpaid'} />}
                title={r.learner.full_name}
                subtitle={
                  <T v="caption" numberOfLines={1} style={{ marginTop: 2 }}>
                    {r.state === 'partial' ? `Partial · paid ${formatBIF(r.paid)}` : r.bill ? 'Marked unpaid' : 'No payment yet'}
                    {r.due !== null && <T v="caption" color={colors.red} style={{ fontFamily: fonts.bold }}>{` · ${formatBIF(r.balance)}`}</T>}
                  </T>
                }
                right={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    {r.learner.phone ? <IconButton icon={Phone} label={`Call ${r.learner.full_name}`} size={40} bg={colors.slateSoft} onPress={() => Linking.openURL(`tel:${r.learner.phone}`)} /> : null}
                    <Button title="Record" size="sm" onPress={() => recordPayment({ learnerId: r.learner.id, period })} />
                  </View>
                }
                last={i === Math.min(owing.length, 6) - 1 && owing.length <= 6}
              />
            ))}
            {owing.length > 6 && <Row title={<T v="bodyStrong" color={colors.primary}>See all {owing.length}</T>} chevron onPress={() => goTab('Payments')} last />}
          </>
        )}
      </Section>

      {/* Absence warnings */}
      <Section title="Absence warnings" action={<T v="caption">{settings.absence_warning_weeks}+ weeks, no reason</T>}>
        {data.warnings.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="No warnings" message="Everyone attended recently or has a reason." />
        ) : (
          <>
            {data.warnings.slice(0, 5).map((w) => (
              <Row
                key={w.learner.id}
                onPress={() => openLearner(w.learner.id, 'attendance')}
                left={<Avatar name={w.learner.full_name} />}
                title={w.learner.full_name}
                subtitle={`Last seen ${w.lastPresent ? formatDate(w.lastPresent, 'short') : 'never'} · ${w.missed.length} missed`}
                right={<Badge label={`${w.weeks} wks`} tone="red" />}
              />
            ))}
            <Row title={<T v="bodyStrong" color={colors.primary}>Add reasons</T>} chevron onPress={() => goTab('Attendance')} last />
          </>
        )}
      </Section>

      <Card style={{ marginBottom: space.lg }}>
        <CardHeader title="Income vs expenses" subtitle="Money received and spent, last 6 months" />
        <View style={{ paddingHorizontal: space.lg, paddingBottom: space.lg }}>
          <IncomeExpenseChart data={data.trend} />
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: space.lg },
  hero: { borderRadius: 28, padding: 20, ...shadow },
  heroAmount: { fontFamily: fonts.extrabold, fontSize: 36, lineHeight: 44, letterSpacing: -0.8, color: '#fff', marginTop: 2, fontVariant: ['tabular-nums'] },
  heroFooter: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16, padding: 14, borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,0.12)' },
  actions: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: space.xl, paddingHorizontal: 4 },
  action: { alignItems: 'center', gap: 6, width: 76 },
  actionIcon: { width: 60, height: 60, borderRadius: 20, alignItems: 'center', justifyContent: 'center', ...shadow },
  grid: { flexDirection: 'row', gap: 12, marginBottom: 12 },
});
