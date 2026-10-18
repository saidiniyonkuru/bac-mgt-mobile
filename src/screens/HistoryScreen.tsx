import { useLayoutEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AlertTriangle, ArrowDownUp, CheckCircle2, Download, History as HistoryIcon, Users, Wallet } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { useApp } from '../lib/app';
import { fetchAll, normalizeLearner, normalizePayment } from '../lib/db';
import { buildLedger, Ledger } from '../lib/paymentStatus';
import { durationLabel, formatBIF, formatDate, periodLabel } from '../lib/periods';
import { Learner, Payment } from '../lib/types';
import { useLoad } from '../lib/useLoad';
import { shareCSV } from '../lib/csv';
import { RootStackParamList, useNav } from '../navigation/types';
import { Avatar, Badge, Chips, EmptyState, IconButton, Loader, Screen, SearchBar, Section, StatCard, T } from '../ui';
import { OptionSheet, ShowMore, useIncremental } from '../ui/kit';
import { LEARNER_STATUS, MONTH_STATE, MonthStrip } from '../ui/status';
import { colors, space } from '../ui/theme';
import { haptic } from '../ui/feedback';

type Props = NativeStackScreenProps<RootStackParamList, 'History'>;
type Scope = 'current' | 'former' | 'all';
type Show = 'all' | 'owing' | 'clear';
type Sort = 'balance' | 'name' | 'enrolled' | 'paid';

interface Item {
  learner: Learner;
  ledger: Ledger;
}

const SORTS: { value: Sort; label: string }[] = [
  { value: 'balance', label: 'Highest balance' },
  { value: 'paid', label: 'Most paid' },
  { value: 'name', label: 'Name' },
  { value: 'enrolled', label: 'Longest member' },
];

const isCurrent = (l: Learner) => l.active !== false && (l.status || 'active') === 'active';

export default function HistoryScreen({ navigation }: Props) {
  const { settings, settingsLoaded } = useApp();
  const { openLearner } = useNav();
  const [scope, setScope] = useState<Scope>('current');
  const [show, setShow] = useState<Show>('all');
  const [sort, setSort] = useState<Sort>('balance');
  const [sortOpen, setSortOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [search, setSearch] = useState('');

  const { data, refresh, refreshing } = useLoad<Item[]>(
    async () => {
      const [learners, bills] = await Promise.all([
        fetchAll((f, t) => supabase.from('learners').select('*').order('full_name').range(f, t)),
        fetchAll((f, t) => supabase.from('payments').select('*').order('id').range(f, t)),
      ]);
      const billsByLearner = new Map<string, Payment[]>();
      bills.map(normalizePayment).forEach((b) => billsByLearner.set(b.learner_id, [...(billsByLearner.get(b.learner_id) || []), b]));
      return learners.map(normalizeLearner).map((learner) => ({ learner, ledger: buildLedger(learner, billsByLearner.get(learner.id) || [], settings) }));
    },
    ['learners', 'payments', 'payment_transactions'],
    [settings],
    settingsLoaded
  );

  const scoped = useMemo(() => (data || []).filter((r) => (scope === 'all' ? true : scope === 'current' ? isCurrent(r.learner) : !isCurrent(r.learner))), [data, scope]);

  const totals = useMemo(
    () => ({
      paid: scoped.reduce((s, r) => s + r.ledger.totalPaid, 0),
      owed: scoped.reduce((s, r) => s + r.ledger.balance, 0),
      owing: scoped.filter((r) => r.ledger.balance > 0).length,
      clear: scoped.filter((r) => r.ledger.balance === 0).length,
    }),
    [scoped]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = scoped.filter((r) => {
      if (show === 'owing' && r.ledger.balance <= 0) return false;
      if (show === 'clear' && r.ledger.balance > 0) return false;
      return !q || r.learner.full_name.toLowerCase().includes(q);
    });
    const sorters: Record<Sort, (a: Item, b: Item) => number> = {
      balance: (a, b) => b.ledger.balance - a.ledger.balance || a.learner.full_name.localeCompare(b.learner.full_name),
      name: (a, b) => a.learner.full_name.localeCompare(b.learner.full_name),
      enrolled: (a, b) => a.learner.enrollment_date.localeCompare(b.learner.enrollment_date),
      paid: (a, b) => b.ledger.totalPaid - a.ledger.totalPaid,
    };
    return list.sort(sorters[sort]);
  }, [scoped, show, sort, search]);
  const page = useIncremental(visible, 40, `${scope}|${show}|${sort}|${search}`);

  const exportSummary = () =>
    shareCSV(
      visible.map(({ learner, ledger }) => ({
        Learner: learner.full_name,
        Level: learner.level,
        Status: learner.status || 'active',
        Enrolled: learner.enrollment_date,
        'Months expected': ledger.expectedCount,
        'Months paid': ledger.paidCount,
        'Months partial': ledger.partialCount,
        'Months unpaid': ledger.unpaidCount,
        'Total paid': ledger.totalPaid,
        'Balance owed': ledger.balance,
        'Last payment': ledger.lastPaymentDate || '',
      })),
      'payment-history-summary.csv'
    );

  const exportDetail = () =>
    shareCSV(
      visible.flatMap(({ learner, ledger }) =>
        ledger.months.map((m) => ({
          Learner: learner.full_name,
          Month: periodLabel(m.period),
          Due: m.due ?? '',
          Paid: m.paid,
          Balance: m.balance,
          Status: MONTH_STATE[m.state].label,
          'Paid on': m.bill?.payment_date || '',
        }))
      ),
      'payment-history-by-month.csv'
    );

  useLayoutEffect(() => {
    navigation.setOptions({ headerRight: () => <IconButton icon={Download} label="Export" onPress={() => setExportOpen(true)} color={colors.text} /> });
  }, [navigation]);

  return (
    <Screen noTitleInset refreshing={refreshing} onRefresh={refresh}>
      {!data ? (
        <Loader />
      ) : (
        <>
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
            <StatCard label="Total collected" value={formatBIF(totals.paid)} icon={Wallet} tone="green" hint="All time" />
            <StatCard label="Total owed" value={formatBIF(totals.owed)} icon={AlertTriangle} tone="red" alert={totals.owed > 0} onPress={() => setShow('owing')} />
          </View>
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: space.xl }}>
            <StatCard label="Learners owing" value={totals.owing} icon={Users} tone="amber" onPress={() => setShow('owing')} />
            <StatCard label="Fully paid up" value={totals.clear} icon={CheckCircle2} tone="green" onPress={() => setShow('clear')} />
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginBottom: space.md }}>
            <View style={{ flex: 1 }}>
              <SearchBar value={search} onChange={setSearch} placeholder="Search learner…" />
            </View>
            <IconButton icon={ArrowDownUp} label="Sort" size={50} onPress={() => setSortOpen(true)} bg={colors.surface} color={colors.text} />
          </View>

          <Chips<Scope>
            value={scope}
            onChange={setScope}
            style={{ marginBottom: 8 }}
            options={[
              { value: 'current', label: 'Current learners' },
              { value: 'former', label: 'Former' },
              { value: 'all', label: 'Everyone' },
            ]}
          />
          <Chips<Show>
            value={show}
            onChange={setShow}
            style={{ marginBottom: space.lg }}
            options={[
              { value: 'all', label: 'All', count: scoped.length },
              { value: 'owing', label: 'Owing', count: totals.owing, alert: true },
              { value: 'clear', label: 'Paid up', count: totals.clear },
            ]}
          />

          {visible.length === 0 ? (
            <EmptyState icon={HistoryIcon} title="No learners match" />
          ) : (
            <Section title={`Sorted by ${SORTS.find((s) => s.value === sort)?.label.toLowerCase()}`}>
              {page.visible.map(({ learner, ledger }, i) => {
                const status = LEARNER_STATUS[learner.status || 'active'];
                const last = i === page.visible.length - 1 && !page.hasMore;
                return (
                  <Pressable
                    key={learner.id}
                    onPress={() => {
                      haptic(8);
                      openLearner(learner.id, 'payments');
                    }}
                    android_ripple={{ color: 'rgba(0,0,0,0.05)' }}
                    style={{ paddingHorizontal: space.lg, paddingVertical: 14, borderBottomWidth: last ? 0 : 0.5, borderBottomColor: colors.border }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <Avatar name={learner.full_name} alert={ledger.balance > 0} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <T v="bodyStrong" numberOfLines={1}>
                          {learner.full_name}
                        </T>
                        <T v="caption" numberOfLines={1}>
                          Since {formatDate(learner.enrollment_date, 'monthYear')} · {durationLabel(learner.enrollment_date)}
                        </T>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <T v="bodyStrong" color={ledger.balance > 0 ? colors.red : colors.green} style={{ fontVariant: ['tabular-nums'] }}>
                          {ledger.balance > 0 ? formatBIF(ledger.balance) : 'Paid up'}
                        </T>
                        <T v="caption" style={{ fontSize: 12, fontVariant: ['tabular-nums'] }}>
                          paid {formatBIF(ledger.totalPaid)}
                        </T>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingLeft: 56 }}>
                      <MonthStrip months={ledger.months} count={6} size={22} />
                      <View style={{ alignItems: 'flex-end', gap: 3 }}>
                        <T v="caption" style={{ fontVariant: ['tabular-nums'] }}>
                          {ledger.paidCount}/{ledger.expectedCount} months
                        </T>
                        {!isCurrent(learner) && <Badge label={learner.active === false ? 'Inactive' : status.label} tone={learner.active === false ? 'slate' : status.tone} />}
                      </View>
                    </View>
                  </Pressable>
                );
              })}
              <ShowMore remaining={page.remaining} onPress={page.more} />
            </Section>
          )}
        </>
      )}

      <OptionSheet<Sort> visible={sortOpen} onClose={() => setSortOpen(false)} title="Sort by" value={sort} onSelect={setSort} options={SORTS} />
      <OptionSheet<'summary' | 'detail'>
        visible={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Export payment history"
        options={[
          { value: 'summary', label: 'Summary', description: 'One line per learner: totals and balance', icon: Download },
          { value: 'detail', label: 'By month', description: 'Every month of every learner', icon: Download },
        ]}
        onSelect={(v) => setTimeout(() => (v === 'summary' ? exportSummary() : exportDetail()), 250)}
      />
    </Screen>
  );
}
