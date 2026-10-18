import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useHeaderHeight } from '@react-navigation/elements';
import { CheckCircle2, Minus, Plus, Share2, X } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { useApp } from '../lib/app';
import { notifyDataChanged } from '../lib/realtime';
import { errorMessage, fetchAll, normalizeLearner, normalizePayment } from '../lib/db';
import { buildLedger, feeFor, planAllocation, recordPayment } from '../lib/paymentStatus';
import { billPeriod, currentPeriod, formatBIF, formatDate, periodFromKey, periodKey, periodLabel, todayISO } from '../lib/periods';
import { Learner, Payment, PAYMENT_METHODS } from '../lib/types';
import { RootStackParamList } from '../navigation/types';
import { Avatar, Badge, BottomBar, Button, DateField, Field, IconButton, Input, Loader, MonthStepper, Row, SearchBar, Section, T } from '../ui';
import { InfoLine, Pill, PillGroup } from '../ui/kit';
import { colors, fonts, radius, space } from '../ui/theme';
import { haptic, toast, toastError } from '../ui/feedback';

type Props = NativeStackScreenProps<RootStackParamList, 'PaymentForm'>;

interface Receipt {
  learner: Learner;
  amount: number;
  months: string[];
  paidOn: string;
  method: string;
  reference?: string;
  balanceAfter: number;
}

export default function PaymentFormScreen({ navigation, route }: Props) {
  const { settings, user } = useApp();
  const headerHeight = useHeaderHeight();
  const initialLearnerId = route.params?.learnerId;
  const initialPeriodKey = route.params?.periodKey;

  const [learners, setLearners] = useState<Learner[] | null>(null);
  const [learnerId, setLearnerId] = useState(initialLearnerId || '');
  const [search, setSearch] = useState('');
  const [bills, setBills] = useState<Payment[] | null>(null);

  const [startKey, setStartKey] = useState(initialPeriodKey || periodKey(currentPeriod()));
  const [monthCount, setMonthCount] = useState(1);
  const [fee, setFee] = useState('');
  const [amount, setAmount] = useState('');
  const [amountTouched, setAmountTouched] = useState(false);
  const [paidOn, setPaidOn] = useState(todayISO());
  const [method, setMethod] = useState<string>('Cash');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  useEffect(() => {
    fetchAll((f, t) => supabase.from('learners').select('*').order('full_name').range(f, t))
      .then((rows) => setLearners(rows.map(normalizeLearner)))
      .catch((e) => toastError(errorMessage(e)));
  }, []);

  const learner = learners?.find((l) => l.id === learnerId) || null;

  useEffect(() => {
    setBills(null);
    if (!learnerId) return;
    supabase
      .from('payments')
      .select('*')
      .eq('learner_id', learnerId)
      .then(({ data, error }) => {
        if (error) return toastError(errorMessage(error));
        setBills((data || []).map(normalizePayment));
      });
  }, [learnerId]);

  const ledger = useMemo(() => (learner && bills ? buildLedger(learner, bills, settings) : null), [learner, bills, settings]);

  // Smart defaults once the learner's history is known
  useEffect(() => {
    if (!learner || !ledger) return;
    const learnerFee = feeFor(learner, settings);
    setFee(learnerFee !== null ? String(learnerFee) : '');
    if (!initialPeriodKey) {
      // Start at the oldest month that still has a balance
      const open = ledger.months.filter((m) => m.balance > 0 && !m.isAdvance);
      if (open.length) {
        setStartKey(open[open.length - 1].key);
        setMonthCount(Math.min(open.length, 12));
      } else {
        setStartKey(periodKey(currentPeriod()));
        setMonthCount(1);
      }
    }
    setAmountTouched(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ledger?.start.year, ledger?.start.month, learner?.id]);

  const billsByKey = useMemo(() => {
    const m = new Map<string, Payment>();
    (bills || []).forEach((b) => m.set(periodKey(billPeriod(b)), b));
    return m;
  }, [bills]);

  const feeNum = parseFloat(fee) || 0;
  const start = periodFromKey(startKey);

  const openTotal = useMemo(() => {
    const { lines } = planAllocation(0, start, monthCount, billsByKey, feeNum);
    return lines.reduce((s, l) => s + Math.max(0, l.due - l.alreadyPaid), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startKey, monthCount, billsByKey, feeNum]);

  useEffect(() => {
    if (!amountTouched) setAmount(openTotal ? String(openTotal) : '');
  }, [openTotal, amountTouched]);

  const amountNum = parseFloat(amount) || 0;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const plan = useMemo(() => planAllocation(amountNum, start, monthCount, billsByKey, feeNum), [amountNum, startKey, monthCount, billsByKey, feeNum]);
  const extra = Math.max(0, amountNum - openTotal);
  const needsFee = plan.lines.some((l) => !l.existing) && feeNum <= 0 && learner?.monthly_fee !== 0;

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    const pool = (learners || []).filter((l) => l.active !== false);
    return (q ? pool.filter((l) => l.full_name.toLowerCase().includes(q) || (l.phone || '').includes(q)) : pool).slice(0, 30);
  }, [learners, search]);

  const submit = async () => {
    if (!learner) return toastError('Choose a learner first');
    if (amountNum <= 0) return toastError('Enter the amount received');
    if (needsFee) return toastError('Enter the monthly fee for this learner');
    setSaving(true);
    try {
      await recordPayment(plan.lines, {
        learnerId: learner.id,
        paidOn,
        method,
        reference: reference.trim(),
        notes: notes.trim(),
        recordedBy: user?.email,
      });
      notifyDataChanged();
      haptic(30);
      const covered = plan.lines.filter((l) => l.allocate > 0).map((l) => periodLabel(l.period));
      const balanceAfter = Math.max(0, (ledger?.balance || 0) - Math.min(amountNum, openTotal));
      setReceipt({ learner, amount: amountNum, months: covered, paidOn, method, reference: reference.trim(), balanceAfter });
      navigation.setOptions({ title: 'Payment saved', headerBackVisible: false });
      toast(`${formatBIF(amountNum)} recorded for ${learner.full_name}`);
    } catch (err) {
      toastError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (receipt) return <ReceiptView receipt={receipt} clubName={settings.club_name} onDone={() => navigation.goBack()} />;

  if (!learners) return <Loader />;

  // ---- Step 1: choose learner ----
  if (!learner) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: space.lg }} keyboardShouldPersistTaps="handled">
        <SearchBar value={search} onChange={setSearch} placeholder="Type a name or phone…" />
        <View style={{ height: space.lg }} />
        <Section title="Who paid?">
          {matches.length === 0 ? (
            <View style={{ padding: space.xl }}>
              <T v="callout" center>
                No learner found
              </T>
            </View>
          ) : (
            matches.map((l, i) => (
              <Row
                key={l.id}
                onPress={() => setLearnerId(l.id)}
                left={<Avatar name={l.full_name} />}
                title={l.full_name}
                subtitle={`${l.level}${l.phone ? ` · ${l.phone}` : ''}`}
                chevron
                last={i === matches.length - 1}
              />
            ))
          )}
        </Section>
      </ScrollView>
    );
  }

  // ---- Step 2: payment details ----
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior="padding" keyboardVerticalOffset={headerHeight}>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        <View style={styles.learnerCard}>
          <Avatar name={learner.full_name} size={48} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <T v="headline" numberOfLines={1}>
              {learner.full_name}
            </T>
            <T v="caption">
              {learner.level} · enrolled {formatDate(learner.enrollment_date)}
            </T>
          </View>
          {!initialLearnerId && <IconButton icon={X} label="Change learner" onPress={() => setLearnerId('')} bg={colors.slateSoft} />}
        </View>

        {!ledger ? (
          <Loader />
        ) : (
          <>
            {ledger.balance > 0 ? (
              <View style={[styles.balance, { backgroundColor: colors.redSoft }]}>
                <View style={{ flex: 1 }}>
                  <T v="caption" color={colors.red}>
                    Total balance owed
                  </T>
                  <T v="title" color={colors.red}>
                    {formatBIF(ledger.balance)}
                  </T>
                </View>
                <Badge label={`${ledger.unpaidCount + ledger.partialCount} month${ledger.unpaidCount + ledger.partialCount === 1 ? '' : 's'}`} tone="red" solid />
              </View>
            ) : (
              <View style={[styles.balance, { backgroundColor: colors.greenSoft }]}>
                <CheckCircle2 size={22} color={colors.green} />
                <T v="label" color={colors.green} style={{ flex: 1 }}>
                  Up to date — this payment will be recorded in advance.
                </T>
              </View>
            )}

            <Field label="Amount received" required hint={openTotal > 0 ? `Due for the selected months: ${formatBIF(openTotal)}` : undefined}>
              <View>
                <Input
                  big
                  value={amount}
                  onChangeText={(v) => {
                    setAmount(v.replace(/[^\d]/g, ''));
                    setAmountTouched(true);
                  }}
                  keyboardType="number-pad"
                  placeholder="0"
                  style={{ paddingLeft: 64 }}
                />
                <T v="bodyStrong" color={colors.textFaint} style={styles.currency}>
                  BIF
                </T>
              </View>
              {openTotal > 0 && (
                <PillGroup style={{ marginTop: 10 }}>
                  <Pill label={`Full · ${formatBIF(openTotal)}`} active={amountNum === openTotal} onPress={() => { setAmount(String(openTotal)); setAmountTouched(true); }} />
                  <Pill label={`Half · ${formatBIF(Math.round(openTotal / 2))}`} active={amountNum === Math.round(openTotal / 2)} onPress={() => { setAmount(String(Math.round(openTotal / 2))); setAmountTouched(true); }} />
                </PillGroup>
              )}
            </Field>

            <Field label="First month">
              <MonthStepper value={startKey} onChange={setStartKey} />
            </Field>

            <Field label="Number of months">
              <View style={styles.counter}>
                <IconButton icon={Minus} label="Fewer months" onPress={() => setMonthCount((n) => Math.max(1, n - 1))} color={colors.text} />
                <T v="bodyStrong" color={colors.text}>
                  {monthCount} month{monthCount > 1 ? 's' : ''}
                </T>
                <IconButton icon={Plus} label="More months" onPress={() => setMonthCount((n) => Math.min(12, n + 1))} color={colors.text} />
              </View>
            </Field>

            {plan.lines.some((l) => !l.existing) && (
              <Field
                label="Monthly fee (BIF)"
                required={learner.monthly_fee !== 0}
                hint={learner.monthly_fee === 0 ? 'This learner studies for free.' : 'Used for months that have no bill yet. Set the default in Settings.'}
              >
                <Input value={fee} onChangeText={(v) => setFee(v.replace(/[^\d]/g, ''))} keyboardType="number-pad" placeholder="e.g. 20000" />
              </Field>
            )}

            {amountNum > 0 && (
              <Section title="How this payment is applied">
                {plan.lines.map((l, i) => {
                  const after = l.alreadyPaid + l.allocate;
                  const state = l.due === 0 || after >= l.due ? 'Paid' : after > 0 ? 'Partial' : 'Unpaid';
                  return (
                    <Row
                      key={periodKey(l.period)}
                      title={periodLabel(l.period)}
                      subtitle={`Due ${formatBIF(l.due)}${l.alreadyPaid > 0 ? ` · already paid ${formatBIF(l.alreadyPaid)}` : ''}`}
                      right={
                        <View style={{ alignItems: 'flex-end', gap: 4 }}>
                          <T v="bodyStrong" style={{ fontVariant: ['tabular-nums'] }}>
                            +{formatBIF(l.allocate)}
                          </T>
                          <Badge label={state} tone={state === 'Paid' ? 'green' : state === 'Partial' ? 'amber' : 'red'} />
                        </View>
                      }
                      last={i === plan.lines.length - 1 && extra <= 0}
                    />
                  );
                })}
                {extra > 0 && (
                  <View style={{ padding: space.lg, backgroundColor: colors.primarySoft }}>
                    <T v="caption" color={colors.primaryDark}>
                      {formatBIF(extra)} more than due — kept as credit on {periodLabel(plan.lines[plan.lines.length - 1].period)}. Add a month instead if it is for next month.
                    </T>
                  </View>
                )}
              </Section>
            )}

            <Field label="Payment method">
              <PillGroup>
                {PAYMENT_METHODS.map((m) => (
                  <Pill key={m} label={m} active={method === m} onPress={() => setMethod(m)} />
                ))}
              </PillGroup>
            </Field>

            <Field label="Date received">
              <DateField value={paidOn} onChange={setPaidOn} maximumDate={new Date()} />
            </Field>

            <Field label="Reference" hint="Mobile money / bank transaction ID">
              <Input value={reference} onChangeText={setReference} placeholder="Optional" autoCapitalize="characters" />
            </Field>

            <Field label="Notes">
              <Input value={notes} onChangeText={setNotes} placeholder="Optional" multiline />
            </Field>
          </>
        )}
      </ScrollView>
      <BottomBar>
        <Button title="Cancel" variant="secondary" onPress={() => navigation.goBack()} />
        <Button title={amountNum > 0 ? `Save ${formatBIF(amountNum)}` : 'Save payment'} flex size="lg" onPress={submit} loading={saving} disabled={!ledger || amountNum <= 0} />
      </BottomBar>
    </KeyboardAvoidingView>
  );
}

function ReceiptView({ receipt, clubName, onDone }: { receipt: Receipt; clubName: string; onDone: () => void }) {
  const text = [
    `${clubName} — Payment receipt`,
    `Learner: ${receipt.learner.full_name}`,
    `Amount: ${formatBIF(receipt.amount)}`,
    `For: ${receipt.months.join(', ')}`,
    `Date: ${formatDate(receipt.paidOn)} · ${receipt.method}${receipt.reference ? ` (${receipt.reference})` : ''}`,
    receipt.balanceAfter > 0 ? `Remaining balance: ${formatBIF(receipt.balanceAfter)}` : 'Fully paid up. Thank you!',
  ].join('\n');

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: space.lg }}>
        <View style={styles.receiptTop}>
          <View style={styles.check}>
            <CheckCircle2 size={44} color={colors.green} strokeWidth={2.2} />
          </View>
          <T v="largeTitle" style={{ marginTop: 14, fontVariant: ['tabular-nums'] }}>
            {formatBIF(receipt.amount)}
          </T>
          <T v="callout">from {receipt.learner.full_name}</T>
        </View>
        <Section>
          <InfoLine label="For" value={receipt.months.join(', ')} />
          <InfoLine label="Date" value={formatDate(receipt.paidOn)} />
          <InfoLine label="Method" value={receipt.method + (receipt.reference ? ` · ${receipt.reference}` : '')} />
          <InfoLine label="Balance now" value={receipt.balanceAfter > 0 ? formatBIF(receipt.balanceAfter) : 'Paid up'} valueColor={receipt.balanceAfter > 0 ? colors.red : colors.green} last />
        </Section>
        <Pressable onPress={() => Share.share({ message: text })} style={styles.preview}>
          <T v="caption" style={{ fontFamily: fonts.medium, lineHeight: 19 }}>
            {text}
          </T>
        </Pressable>
      </ScrollView>
      <BottomBar>
        <Button title="Share receipt" icon={Share2} variant="secondary" flex onPress={() => Share.share({ message: text })} />
        <Button title="Done" flex onPress={onDone} />
      </BottomBar>
    </View>
  );
}

const styles = StyleSheet.create({
  learnerCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, marginBottom: space.lg },
  balance: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg, marginBottom: space.xl },
  currency: { position: 'absolute', left: 16, top: 19 },
  counter: { height: 52, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surfaceMuted, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  receiptTop: { alignItems: 'center', paddingVertical: space.xxl },
  check: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' },
  preview: { padding: space.lg, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' },
});
