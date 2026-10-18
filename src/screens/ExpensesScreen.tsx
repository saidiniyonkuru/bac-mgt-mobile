import { useLayoutEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Copy, Download, Plus, Receipt, Repeat, Scale, Wallet } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { useApp } from '../lib/app';
import { notifyDataChanged } from '../lib/realtime';
import { errorMessage, fetchAll, normalizeExpense, num } from '../lib/db';
import { addMonths, currentPeriod, formatBIF, formatDate, Period, periodEnd, periodFromKey, periodKey, periodLabel, periodStart } from '../lib/periods';
import { Expense } from '../lib/types';
import { useLoad } from '../lib/useLoad';
import { shareCSV } from '../lib/csv';
import { RootStackParamList } from '../navigation/types';
import { Button, Card, EmptyState, IconButton, IconTile, Loader, MonthStepper, ProgressBar, Row, Screen, SearchBar, Section, StatCard, T } from '../ui';
import { Banner, CardHeader, Fab, ShowMore, useIncremental } from '../ui/kit';
import { colors, fonts, space } from '../ui/theme';
import { haptic, toast, toastError } from '../ui/feedback';

type Props = NativeStackScreenProps<RootStackParamList, 'Expenses'>;

interface Data {
  expenses: Expense[];
  prevExpenses: Expense[];
  income: number;
  categories: string[];
}

export default function ExpensesScreen({ navigation }: Props) {
  const { user, settingsLoaded } = useApp();
  const [monthKey, setMonthKey] = useState(periodKey(currentPeriod()));
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [copying, setCopying] = useState(false);
  const period = periodFromKey(monthKey);
  const prev = addMonths(period, -1);

  const { data, refresh, refreshing } = useLoad<Data>(
    async () => {
      const range = (p: Period) => (f: number, t: number) =>
        supabase.from('expenses').select('*').gte('date', periodStart(p)).lte('date', periodEnd(p)).order('date', { ascending: false }).order('id').range(f, t);
      const [cur, before, tx, cats] = await Promise.all([
        fetchAll(range(period)),
        fetchAll(range(prev)),
        fetchAll<{ amount: number }>((f, t) => supabase.from('payment_transactions').select('amount').gte('paid_on', periodStart(period)).lte('paid_on', periodEnd(period)).order('id').range(f, t)),
        fetchAll<{ category: string }>((f, t) => supabase.from('expenses').select('category').order('id').range(f, t)),
      ]);
      return {
        expenses: cur.map(normalizeExpense),
        prevExpenses: before.map(normalizeExpense),
        income: tx.reduce((s, r) => s + num(r.amount), 0),
        categories: Array.from(new Set(cats.map((c) => c.category).filter(Boolean))).sort(),
      };
    },
    ['expenses', 'payment_transactions'],
    [monthKey],
    settingsLoaded
  );

  const expenses = useMemo(() => data?.expenses || [], [data]);
  const prevExpenses = useMemo(() => data?.prevExpenses || [], [data]);
  const income = data?.income || 0;
  const categories = data?.categories || [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return expenses.filter((e) => (category === 'all' || e.category === category) && (!q || [e.description, e.vendor, e.category].some((v) => (v || '').toLowerCase().includes(q))));
  }, [expenses, category, search]);
  const page = useIncremental(filtered, 40, `${monthKey}|${category}|${search}`);

  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const prevTotal = prevExpenses.reduce((s, e) => s + e.amount, 0);
  const change = prevTotal ? Math.round(((total - prevTotal) / prevTotal) * 100) : null;
  const net = income - total;

  const byCategory = useMemo(() => {
    const m = new Map<string, number>();
    expenses.forEach((e) => m.set(e.category, (m.get(e.category) || 0) + e.amount));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  // Recurring items from last month not yet entered this month
  const missingRecurring = useMemo(() => {
    const sig = (e: Expense) => `${e.category}|${(e.description || '').trim().toLowerCase()}|${(e.vendor || '').trim().toLowerCase()}`;
    const have = new Set(expenses.map(sig));
    return prevExpenses.filter((e) => e.is_recurring && !have.has(sig(e)));
  }, [expenses, prevExpenses]);

  const copyRecurring = async () => {
    setCopying(true);
    const rows = missingRecurring.map((e) => {
      const day = Math.min(parseInt(e.date.slice(8, 10), 10), parseInt(periodEnd(period).slice(8, 10), 10));
      return {
        date: `${monthKey}-${String(day).padStart(2, '0')}`,
        category: e.category,
        amount: e.amount,
        description: e.description,
        vendor: e.vendor,
        payment_method: e.payment_method,
        is_recurring: true,
        recorded_by: user?.email,
      };
    });
    const { error } = await supabase.from('expenses').insert(rows);
    setCopying(false);
    if (error) return toastError(errorMessage(error));
    toast(`${rows.length} recurring expense${rows.length === 1 ? '' : 's'} added`);
    notifyDataChanged();
  };

  const exportCsv = () =>
    shareCSV(
      filtered.map((e) => ({
        Date: e.date,
        Category: e.category,
        Amount: e.amount,
        'Paid to': e.vendor || '',
        Method: e.payment_method || '',
        Description: e.description || '',
        Recurring: e.is_recurring ? 'Yes' : 'No',
        'Recorded by': e.recorded_by || '',
      })),
      `expenses-${monthKey}.csv`
    );

  useLayoutEffect(() => {
    navigation.setOptions({ headerRight: () => <IconButton icon={Download} label="Export CSV" onPress={exportCsv} color={colors.text} /> });
  });

  const openForm = (expense?: Expense) => navigation.navigate('ExpenseForm', { expense, monthKey, categories });
  const maxCat = byCategory[0]?.[1] || 1;

  return (
    <View style={{ flex: 1 }}>
      <Screen noTitleInset refreshing={refreshing} onRefresh={refresh} contentStyle={{ paddingBottom: 100 }}>
        <MonthStepper value={monthKey} onChange={setMonthKey} />
        <View style={{ height: space.lg }} />
        {!data ? (
          <Loader />
        ) : (
          <>
            {missingRecurring.length > 0 && (
              <Banner
                icon={Repeat}
                tone="violet"
                action={<Button title="Add" size="sm" icon={Copy} onPress={copyRecurring} loading={copying} style={{ backgroundColor: colors.violet }} />}
              >
                <T v="callout" color={colors.text}>
                  <T v="bodyStrong" color={colors.violet}>{missingRecurring.length}</T> recurring expense{missingRecurring.length === 1 ? '' : 's'} from {periodLabel(prev, true)} not added yet ({formatBIF(missingRecurring.reduce((s, e) => s + e.amount, 0))})
                </T>
              </Banner>
            )}

            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
              <StatCard
                label="Spent this month"
                value={formatBIF(total)}
                icon={Receipt}
                tone="amber"
                hint={change === null ? `${expenses.length} expense${expenses.length === 1 ? '' : 's'}` : `${change > 0 ? '▲' : '▼'} ${Math.abs(change)}% vs ${periodLabel(prev, true)}`}
              />
              <StatCard label="Income received" value={formatBIF(income)} icon={Wallet} tone="green" hint="Payments dated this month" />
            </View>
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: space.xl }}>
              <StatCard label="Net result" value={formatBIF(net)} icon={Scale} tone={net >= 0 ? 'blue' : 'red'} alert={net < 0} hint={net >= 0 ? 'Income − expenses' : 'Spent more than received'} />
              <StatCard label="Recurring" value={formatBIF(expenses.filter((e) => e.is_recurring).reduce((s, e) => s + e.amount, 0))} icon={Repeat} tone="violet" hint="Fixed monthly costs" />
            </View>

            {byCategory.length > 0 && (
              <Card style={{ marginBottom: space.xl }}>
                <CardHeader title="By category" subtitle={category === 'all' ? 'Tap a category to filter' : `Showing ${category} · tap again to clear`} />
                <View style={{ paddingHorizontal: space.lg, paddingBottom: space.lg, gap: 14 }}>
                  {byCategory.map(([cat, amount]) => (
                    <Pressable key={cat} onPress={() => { haptic(8); setCategory(category === cat ? 'all' : cat); }} style={{ opacity: category === 'all' || category === cat ? 1 : 0.45 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                        <T v="label" color={category === cat ? colors.primary : colors.text}>
                          {cat}
                        </T>
                        <T v="caption" style={{ fontVariant: ['tabular-nums'] }}>
                          {formatBIF(amount)} · {Math.round((amount / (total || 1)) * 100)}%
                        </T>
                      </View>
                      <ProgressBar value={(amount / maxCat) * 100} color={colors.income} height={8} />
                    </Pressable>
                  ))}
                </View>
              </Card>
            )}

            <SearchBar value={search} onChange={setSearch} placeholder="Search description or payee…" />
            <View style={{ height: space.md }} />

            {filtered.length === 0 ? (
              <EmptyState
                icon={Receipt}
                title={expenses.length ? 'No expenses match' : `No expenses in ${periodLabel(period)}`}
                action={!expenses.length ? <Button title="Add expense" icon={Plus} onPress={() => openForm()} /> : undefined}
              />
            ) : (
              <Section title={category === 'all' ? 'All expenses' : category}>
                {page.visible.map((e, i) => (
                  <Row
                    key={e.id}
                    onPress={() => openForm(e)}
                    left={<IconTile icon={e.is_recurring ? Repeat : Receipt} tone={e.is_recurring ? 'violet' : 'amber'} size={42} />}
                    title={e.description || e.vendor || e.category}
                    subtitle={`${e.category} · ${formatDate(e.date, 'short')}${e.vendor && e.description ? ` · ${e.vendor}` : ''}`}
                    right={
                      <T v="bodyStrong" style={{ fontFamily: fonts.bold, fontVariant: ['tabular-nums'] }}>
                        −{formatBIF(e.amount)}
                      </T>
                    }
                    last={i === page.visible.length - 1 && !page.hasMore}
                  />
                ))}
                <ShowMore remaining={page.remaining} onPress={page.more} />
              </Section>
            )}
          </>
        )}
      </Screen>
      <Fab icon={Plus} label="Expense" onPress={() => openForm()} />
    </View>
  );
}
