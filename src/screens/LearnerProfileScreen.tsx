import { useCallback, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StatusBar, StatusBarProps, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft,
  CalendarCheck,
  CalendarX,
  Mail,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  Receipt as ReceiptIcon,
  Trash2,
  UserPlus,
  UserX,
  Wallet,
} from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { useApp } from '../lib/app';
import { notifyDataChanged } from '../lib/realtime';
import { ABSENCE_REASONS, Attendance, Learner, Payment, PaymentTransaction } from '../lib/types';
import { errorMessage, normalizeLearner, normalizePayment, normalizeTransaction } from '../lib/db';
import { buildLedger, feeFor } from '../lib/paymentStatus';
import { computeAttendanceStreak, getValidSessionDates } from '../lib/attendanceStatus';
import { billPeriod, durationLabel, formatBIF, formatDate, periodLabel } from '../lib/periods';
import { useLoad } from '../lib/useLoad';
import { ProfileTab, RootStackParamList, useNav } from '../navigation/types';
import { Avatar, Badge, Button, Card, EmptyState, Field, IconButton, Input, Loader, Row, Section, Segmented, T, IconType } from '../ui';
import { Banner, Gradient, InfoLine, Metric, OptionSheet, Sheet } from '../ui/kit';
import { LEARNER_STATUS, LEVEL_TONE, MONTH_STATE, MonthStateBadge, MonthStrip } from '../ui/status';
import { colors, fonts, ICON_STROKE, radius, space, Tone, tones } from '../ui/theme';
import { confirm, haptic, toast, toastError } from '../ui/feedback';

type Props = NativeStackScreenProps<RootStackParamList, 'LearnerProfile'>;

interface Data {
  learner: Learner;
  bills: Payment[];
  receipts: PaymentTransaction[];
  attendance: Attendance[];
  validDates: Set<string>;
}

const LIGHT_BAR: StatusBarProps = { barStyle: 'light-content' };

export default function LearnerProfileScreen({ navigation, route }: Props) {
  const { id, tab: initialTab = 'overview' } = route.params;
  const { settings } = useApp();
  const { recordPayment, editLearner } = useNav();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<ProfileTab>(initialTab);
  const [adjusting, setAdjusting] = useState<Payment | null>(null);
  const [receiptMenu, setReceiptMenu] = useState<PaymentTransaction | null>(null);
  const [reasonFor, setReasonFor] = useState<Attendance | null>(null);

  // White status bar icons over the blue header
  useFocusEffect(
    useCallback(() => {
      const entry = StatusBar.pushStackEntry(LIGHT_BAR);
      return () => StatusBar.popStackEntry(entry);
    }, [])
  );

  const { data } = useLoad<Data>(
    async () => {
      const [l, p, t, a, v] = await Promise.all([
        supabase.from('learners').select('*').eq('id', id).maybeSingle(),
        supabase.from('payments').select('*').eq('learner_id', id),
        supabase.from('payment_transactions').select('*').eq('learner_id', id).order('paid_on', { ascending: false }),
        supabase.from('attendance').select('*').eq('learner_id', id).order('date', { ascending: false }),
        getValidSessionDates(),
      ]);
      if (l.error) throw l.error;
      if (!l.data) {
        // deleted (here or on another device)
        if (navigation.isFocused()) navigation.goBack();
        return undefined;
      }
      return {
        learner: normalizeLearner(l.data),
        bills: (p.data || []).map(normalizePayment),
        receipts: (t.data || []).map(normalizeTransaction),
        attendance: a.data || [],
        validDates: v,
      };
    },
    ['learners', 'payments', 'payment_transactions', 'attendance'],
    [id]
  );

  const ledger = useMemo(() => (data ? buildLedger(data.learner, data.bills, settings) : null), [data, settings]);
  const streak = useMemo(() => computeAttendanceStreak(data?.attendance || [], data?.validDates || new Set()), [data]);
  const receiptsByBill = useMemo(() => {
    const m = new Map<string, PaymentTransaction[]>();
    (data?.receipts || []).forEach((r) => m.set(r.payment_id, [...(m.get(r.payment_id) || []), r]));
    return m;
  }, [data]);

  if (!data || !ledger) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Gradient style={{ height: insets.top + 180 }} />
        <Loader />
      </View>
    );
  }

  const { learner, bills, receipts, attendance } = data;
  const status = LEARNER_STATUS[learner.status || 'active'];
  const current = ledger.months.find((m) => m.isCurrent);
  const fee = feeFor(learner, settings);
  const phoneDigits = (learner.phone || '').replace(/[^\d+]/g, '');

  const voidReceipt = async (r: PaymentTransaction) => {
    const ok = await confirm('Delete this receipt?', `${formatBIF(r.amount)} received on ${formatDate(r.paid_on)} will be removed and the month's balance recalculated.`, 'Delete receipt', true);
    if (!ok) return;
    const { error } = await supabase.from('payment_transactions').delete().eq('id', r.id);
    if (error) return toastError(errorMessage(error));
    toast('Receipt deleted');
    notifyDataChanged();
  };

  const setReason = async (a: Attendance, reason: string) => {
    const { error } = await supabase.from('attendance').update({ absence_reason: reason || null }).eq('id', a.id);
    if (error) return toastError(errorMessage(error));
    notifyDataChanged();
  };

  const deleteLearner = async () => {
    const ok = await confirm(
      `Delete ${learner.full_name}?`,
      'All their payments, receipts and attendance will be permanently deleted. To keep the history, mark them as graduated or inactive instead.',
      'Delete permanently',
      true
    );
    if (!ok) return;
    const { error } = await supabase.from('learners').delete().eq('id', learner.id);
    if (error) return toastError(errorMessage(error));
    toast('Learner deleted');
    notifyDataChanged();
    navigation.goBack();
  };

  // ---- timeline ----
  type Event = { date: string; icon: IconType; tone: Tone; title: string; detail?: string };
  const events: Event[] = [
    { date: learner.enrollment_date, icon: UserPlus, tone: 'blue' as Tone, title: 'Enrolled', detail: `${learner.level} level` },
    ...receipts.map((r) => {
      const bill = bills.find((b) => b.id === r.payment_id);
      return {
        date: r.paid_on,
        icon: Wallet,
        tone: 'green' as Tone,
        title: `Paid ${formatBIF(r.amount)}`,
        detail: [bill && periodLabel(billPeriod(bill)), r.method, r.recorded_by && `by ${r.recorded_by.split('@')[0]}`].filter(Boolean).join(' · '),
      };
    }),
    ...attendance
      .filter((a) => !a.present)
      .map((a) => ({
        date: a.date,
        icon: CalendarX,
        tone: (a.absence_reason ? 'slate' : 'red') as Tone,
        title: a.absence_reason ? `Absent — ${a.absence_reason}` : 'Absent (no reason)',
        detail: a.notes || undefined,
      })),
    ...(learner.status === 'abandoned' && learner.abandoned_at
      ? [{ date: learner.abandoned_at.slice(0, 10), icon: UserX, tone: 'slate' as Tone, title: 'Marked abandoned', detail: learner.abandoned_reason || undefined }]
      : []),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));

  const currentPill =
    current &&
    (current.state === 'paid' || current.state === 'waived'
      ? { bg: '#6EE7B7', fg: '#064E3B' }
      : current.state === 'partial'
        ? { bg: '#FCD34D', fg: '#78350F' }
        : { bg: '#EF4444', fg: '#fff' });

  const owedMonths = ledger.unpaidCount + ledger.partialCount;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}>
        {/* Header */}
        <Gradient style={{ paddingTop: insets.top + 6, paddingHorizontal: space.lg, paddingBottom: 26 }}>
          <View style={styles.topBar}>
            <IconButton icon={ArrowLeft} label="Back" color="#fff" onPress={() => navigation.goBack()} />
            <IconButton icon={Pencil} label="Edit learner" color="#fff" onPress={() => editLearner(learner.id)} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 4 }}>
            <View style={styles.avatarRing}>
              <Avatar name={learner.full_name} size={68} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <T v="title" color="#fff" numberOfLines={2}>
                {learner.full_name}
              </T>
              <T v="caption" color="#C7D7FE" style={{ marginTop: 2 }}>
                Member for {durationLabel(learner.enrollment_date)} · since {formatDate(learner.enrollment_date, 'monthYear')}
              </T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                <HeroPill label={learner.level} />
                <HeroPill label={learner.active === false ? 'Inactive' : status.label} />
                {current && currentPill && <HeroPill label={`${periodLabel(current.period, true)}: ${MONTH_STATE[current.state].label}`} bg={currentPill.bg} fg={currentPill.fg} />}
              </View>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 20 }}>
            {learner.phone ? (
              <>
                <HeroAction icon={Phone} label="Call" onPress={() => Linking.openURL(`tel:${phoneDigits}`)} />
                <HeroAction icon={MessageCircle} label="WhatsApp" onPress={() => Linking.openURL(`https://wa.me/${phoneDigits.replace('+', '')}`)} />
              </>
            ) : null}
            <HeroAction icon={Plus} label="Payment" primary onPress={() => recordPayment({ learnerId: learner.id })} />
          </View>
        </Gradient>

        {/* KPIs */}
        <View style={styles.kpis}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Metric label="Total paid" value={formatBIF(ledger.totalPaid)} color={colors.green} />
            <Metric label="Balance owed" value={ledger.balance > 0 ? formatBIF(ledger.balance) : 'Nothing'} color={ledger.balance > 0 ? colors.red : undefined} />
          </View>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            <Metric label="Months paid" value={`${ledger.paidCount} / ${ledger.expectedCount}`} hint={ledger.partialCount ? `${ledger.partialCount} partial` : undefined} />
            <Metric
              label="Attendance"
              value={streak.totalValidSessions ? `${streak.rate}%` : '—'}
              hint={streak.currentAbsenceStreak ? `${streak.currentAbsenceStreak} missed in a row` : undefined}
              color={streak.currentAbsenceStreak >= 3 ? colors.red : undefined}
            />
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          <Segmented<ProfileTab>
            value={tab}
            onChange={setTab}
            options={[
              { value: 'overview', label: 'Overview' },
              { value: 'payments', label: 'Pay', count: owedMonths || undefined },
              { value: 'attendance', label: 'Attend.' },
              { value: 'info', label: 'Info' },
            ]}
          />
        </View>

        <View style={{ paddingHorizontal: space.lg }}>
          {tab === 'overview' && (
            <>
              <Card style={{ padding: space.lg, marginBottom: space.xl }}>
                <T v="headline">Last 12 months</T>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
                  <MonthStrip months={ledger.months} count={12} size={24} />
                </ScrollView>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 }}>
                  {(['paid', 'partial', 'unpaid'] as const).map((s) => (
                    <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: MONTH_STATE[s].color }} />
                      <T v="caption">{MONTH_STATE[s].label}</T>
                    </View>
                  ))}
                </View>
                <T v="caption" style={{ marginTop: 6 }}>
                  Last payment {ledger.lastPaymentDate ? formatDate(ledger.lastPaymentDate) : 'never'}
                </T>
              </Card>

              <Section title="Activity">
                {events.length === 0 ? (
                  <EmptyState icon={CalendarCheck} title="No activity yet" />
                ) : (
                  <View style={{ padding: space.lg }}>
                    {events.slice(0, 40).map((e, i, arr) => {
                      const t = tones[e.tone];
                      const Icon = e.icon;
                      return (
                        <View key={i} style={{ flexDirection: 'row', gap: 12 }}>
                          <View style={{ alignItems: 'center' }}>
                            <View style={[styles.dot, { backgroundColor: t.bg }]}>
                              <Icon size={16} color={t.fg} strokeWidth={ICON_STROKE} />
                            </View>
                            {i < arr.length - 1 && <View style={styles.line} />}
                          </View>
                          <View style={{ flex: 1, paddingTop: 4, paddingBottom: 14 }}>
                            <T v="bodyStrong" style={{ fontSize: 15 }}>
                              {e.title}
                            </T>
                            <T v="caption">
                              {formatDate(e.date)}
                              {e.detail ? ` · ${e.detail}` : ''}
                            </T>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </Section>
            </>
          )}

          {tab === 'payments' && (
            <>
              {ledger.unknownFeeMonths > 0 && (
                <Banner icon={Wallet} tone="amber">
                  {`No monthly fee is set, so ${ledger.unknownFeeMonths} month(s) can't show an amount. Set a default fee in Settings or a fee on this learner.`}
                </Banner>
              )}
              {ledger.months.length === 0 && (
                <Card>
                  <EmptyState icon={Wallet} title="No months to bill yet" />
                </Card>
              )}
              {ledger.months.map((m) => {
                const monthReceipts = m.bill ? receiptsByBill.get(m.bill.id) || [] : [];
                const border = m.state === 'unpaid' ? '#FCA5A5' : m.state === 'partial' ? '#FCD34D' : colors.border;
                return (
                  <Card key={m.key} style={{ marginBottom: 12, borderColor: border, borderWidth: m.state === 'unpaid' || m.state === 'partial' ? 1 : StyleSheet.hairlineWidth, overflow: 'hidden' }}>
                    <View style={styles.monthHead}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <T v="headline">{periodLabel(m.period)}</T>
                          {m.isCurrent && <Badge label="This month" tone="blue" />}
                          {m.isAdvance && <Badge label="Paid ahead" tone="violet" />}
                        </View>
                        <T v="caption" style={{ marginTop: 2, fontVariant: ['tabular-nums'] }}>
                          {m.due === null ? 'Fee not set' : `Paid ${formatBIF(m.paid)} of ${formatBIF(m.due)}`}
                          {m.balance > 0 && <T v="caption" color={colors.red} style={{ fontFamily: fonts.bold }}>{` · owes ${formatBIF(m.balance)}`}</T>}
                        </T>
                      </View>
                      <MonthStateBadge state={m.state} noRecord={!m.bill} />
                      {m.bill && <IconButton icon={Pencil} label="Change amount due" size={38} onPress={() => setAdjusting(m.bill)} />}
                    </View>
                    {monthReceipts.map((r) => (
                      <Pressable key={r.id} onPress={() => setReceiptMenu(r)} android_ripple={{ color: 'rgba(0,0,0,0.05)' }} style={styles.receipt}>
                        <ReceiptIcon size={18} color={colors.green} strokeWidth={ICON_STROKE} />
                        <View style={{ flex: 1 }}>
                          <T v="label" color={colors.text}>
                            {formatBIF(r.amount)}
                          </T>
                          <T v="caption" numberOfLines={1}>
                            {formatDate(r.paid_on, 'short')} · {r.method}
                            {r.reference ? ` · ${r.reference}` : ''}
                            {r.recorded_by ? ` · by ${r.recorded_by.split('@')[0]}` : ''}
                          </T>
                        </View>
                      </Pressable>
                    ))}
                    {m.balance > 0 && (
                      <View style={styles.monthFoot}>
                        <Button title={`Record payment for ${periodLabel(m.period, true)}`} size="sm" variant="secondary" icon={Plus} onPress={() => recordPayment({ learnerId: learner.id, period: m.period })} />
                      </View>
                    )}
                  </Card>
                );
              })}
            </>
          )}

          {tab === 'attendance' && (
            <>
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: space.xl }}>
                <Metric label="Rate" value={streak.totalValidSessions ? `${streak.rate}%` : '—'} tone="blue" />
                <Metric label="Missed in a row" value={streak.currentAbsenceStreak} tone={streak.currentAbsenceStreak >= 3 ? 'red' : 'slate'} />
                <Metric label="Excused" value={streak.excusedCount} tone="slate" />
              </View>
              <Section title="Records">
                {attendance.length === 0 ? (
                  <EmptyState icon={CalendarCheck} title="No attendance recorded yet" />
                ) : (
                  attendance.map((a, i) => (
                    <Row
                      key={a.id}
                      onPress={a.present ? undefined : () => setReasonFor(a)}
                      left={<View style={[styles.statusDot, { backgroundColor: a.present ? colors.green : a.absence_reason ? colors.borderStrong : colors.red }]} />}
                      title={formatDate(a.date, 'weekday') + ' ' + a.date.slice(0, 4)}
                      subtitle={a.present ? 'Present' : a.absence_reason ? `Excused · ${a.absence_reason}` : 'Absent — no reason'}
                      right={!a.present ? <Badge label={a.absence_reason ? 'Change' : 'Add reason'} tone={a.absence_reason ? 'slate' : 'blue'} /> : undefined}
                      last={i === attendance.length - 1}
                    />
                  ))
                )}
              </Section>
            </>
          )}

          {tab === 'info' && (
            <>
              <Section title="Details">
                <InfoLine icon={Phone} label="Phone" value={learner.phone} />
                <InfoLine icon={Mail} label="Email" value={learner.email} />
                <InfoLine icon={MapPin} label="Residence" value={learner.residence} />
                <InfoLine label="Gender" value={learner.gender} />
                <InfoLine label="Level" value={<Badge label={learner.level} tone={LEVEL_TONE[learner.level]} />} />
                <InfoLine label="Enrolled" value={formatDate(learner.enrollment_date)} />
                <InfoLine
                  label="Monthly fee"
                  value={learner.monthly_fee === 0 ? 'Free / scholarship' : fee !== null ? `${formatBIF(fee)}${learner.monthly_fee == null ? ' (default)' : ''}` : 'Not set'}
                />
                <InfoLine label="Status" value={<Badge label={learner.active === false ? 'Inactive' : status.label} tone={learner.active === false ? 'slate' : status.tone} />} last={!learner.abandoned_reason} />
                {learner.abandoned_reason ? <InfoLine label="Why" value={learner.abandoned_reason} last /> : null}
              </Section>
              <Section title="Notes">
                <View style={{ padding: space.lg }}>
                  <T v="body">{learner.notes || 'No notes.'}</T>
                </View>
              </Section>
              <View style={{ gap: 10 }}>
                <Button title="Edit learner" icon={Pencil} variant="secondary" onPress={() => editLearner(learner.id)} />
                <Button title="Delete learner" icon={Trash2} variant="dangerSoft" onPress={deleteLearner} />
              </View>
            </>
          )}
        </View>
      </ScrollView>

      {adjusting && <AdjustDueSheet bill={adjusting} onClose={() => setAdjusting(null)} />}

      <OptionSheet<'delete'>
        visible={!!receiptMenu}
        onClose={() => setReceiptMenu(null)}
        title={receiptMenu ? `${formatBIF(receiptMenu.amount)} · ${formatDate(receiptMenu.paid_on)}` : ''}
        options={[{ value: 'delete', label: 'Delete receipt', description: "The month's balance is recalculated", icon: Trash2, danger: true }]}
        onSelect={() => {
          const r = receiptMenu;
          if (r) setTimeout(() => voidReceipt(r), 250);
        }}
      />

      <OptionSheet<string>
        visible={!!reasonFor}
        onClose={() => setReasonFor(null)}
        title={reasonFor ? `Absence · ${formatDate(reasonFor.date)}` : ''}
        value={reasonFor?.absence_reason || ''}
        options={[{ value: '', label: 'No reason', description: 'Counts toward absence warnings' }, ...ABSENCE_REASONS.map((r) => ({ value: r as string, label: r }))]}
        onSelect={(v) => reasonFor && setReason(reasonFor, v)}
      />
    </View>
  );
}

function HeroPill({ label, bg = 'rgba(255,255,255,0.18)', fg = '#fff' }: { label: string; bg?: string; fg?: string }) {
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: bg }}>
      <T style={{ fontFamily: fonts.bold, fontSize: 12.5, color: fg }}>{label}</T>
    </View>
  );
}

function HeroAction({ icon: Icon, label, onPress, primary }: { icon: IconType; label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable
      onPress={() => {
        haptic();
        onPress();
      }}
      style={({ pressed }) => [styles.heroAction, primary && { backgroundColor: '#fff' }, pressed && { opacity: 0.8 }]}
    >
      <Icon size={19} color={primary ? colors.primary : '#fff'} strokeWidth={2.5} />
      <T style={{ fontFamily: fonts.bold, fontSize: 15, color: primary ? colors.primary : '#fff' }}>{label}</T>
    </Pressable>
  );
}

function AdjustDueSheet({ bill, onClose }: { bill: Payment; onClose: () => void }) {
  const [due, setDue] = useState(String(bill.amount_due));
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from('payments').update({ amount_due: parseFloat(due) || 0 }).eq('id', bill.id);
    setSaving(false);
    if (error) return toastError(errorMessage(error));
    toast('Amount due updated');
    notifyDataChanged();
    onClose();
  };
  return (
    <Sheet
      visible
      onClose={onClose}
      title={`Amount due · ${periodLabel(billPeriod(bill))}`}
      subtitle="For discounts, or a fee that changed for this month only."
      footer={
        <>
          <Button title="Cancel" variant="secondary" flex onPress={onClose} />
          <Button title="Save" flex onPress={save} loading={saving} />
        </>
      }
    >
      <Field label="Amount due (BIF)" hint={`Already paid: ${formatBIF(bill.amount_paid)}`}>
        <Input big value={due} onChangeText={(v) => setDue(v.replace(/[^\d]/g, ''))} keyboardType="number-pad" autoFocus />
      </Field>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', justifyContent: 'space-between', marginHorizontal: -8 },
  avatarRing: { padding: 3, borderRadius: 40, backgroundColor: 'rgba(255,255,255,0.25)' },
  heroAction: { flex: 1, height: 46, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.16)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  kpis: { paddingHorizontal: space.lg, paddingTop: space.lg },
  tabs: { backgroundColor: colors.bg, paddingHorizontal: space.lg, paddingVertical: space.md },
  dot: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  line: { width: 2, flex: 1, backgroundColor: colors.border, marginVertical: 2 },
  monthHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: space.lg, paddingRight: 6, paddingVertical: 12 },
  receipt: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: space.lg, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  monthFoot: { paddingHorizontal: space.lg, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, alignItems: 'flex-start' },
  statusDot: { width: 12, height: 12, borderRadius: 6 },
});
