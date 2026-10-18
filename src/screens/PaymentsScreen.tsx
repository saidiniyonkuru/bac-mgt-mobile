import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { AlertTriangle, Banknote, CircleDollarSign, Download, Plus, Receipt as ReceiptIcon, Trash2, TrendingUp, Wallet } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { useApp } from '../lib/app';
import { notifyDataChanged } from '../lib/realtime';
import { errorMessage, fetchAll, normalizeTransaction } from '../lib/db';
import { fetchMonthRows, MonthRow, MonthState } from '../lib/paymentStatus';
import { currentPeriod, formatBIF, formatDate, MONTH_NAMES, periodEnd, periodFromKey, periodKey, periodLabel, periodStart } from '../lib/periods';
import { PaymentTransaction } from '../lib/types';
import { useLoad } from '../lib/useLoad';
import { shareCSV } from '../lib/csv';
import { useNav } from '../navigation/types';
import { Avatar, Button, Chips, EmptyState, IconButton, IconTile, Loader, MonthStepper, ProgressBar, Row, Screen, SearchBar, Section, Segmented, StatCard, T } from '../ui';
import { Banner, Fab, OptionSheet, ShowMore, useIncremental } from '../ui/kit';
import { MonthStateBadge } from '../ui/status';
import { colors, fonts, space } from '../ui/theme';
import { confirm, toast, toastError } from '../ui/feedback';

type Tab = 'learners' | 'receipts';
type StateFilter = 'all' | 'owing' | MonthState;

interface ReceiptRow extends PaymentTransaction {
  payment?: { month: string; year: number } | null;
  learner?: { full_name: string; level: string } | null;
}

interface Data {
  rows: MonthRow[];
  receipts: ReceiptRow[];
}

export default function PaymentsScreen() {
  const { settings, settingsLoaded } = useApp();
  const { openLearner, recordPayment } = useNav();
  const [monthKey, setMonthKey] = useState(periodKey(currentPeriod()));
  const [tab, setTab] = useState<Tab>('learners');
  const [filter, setFilter] = useState<StateFilter>('owing');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ReceiptRow | null>(null);
  const period = periodFromKey(monthKey);

  const { data, refresh, refreshing } = useLoad<Data>(
    async () => {
      const [monthRows, tx] = await Promise.all([
        fetchMonthRows(period, settings),
        fetchAll<ReceiptRow>((f, t) =>
          supabase
            .from('payment_transactions')
            .select('*, payment:payments(month,year), learner:learners(full_name,level)')
            .gte('paid_on', periodStart(period))
            .lte('paid_on', periodEnd(period))
            .order('paid_on', { ascending: false })
            .order('created_at', { ascending: false })
            .range(f, t)
        ),
      ]);
      return {
        rows: monthRows,
        receipts: tx.map((t) => ({ ...normalizeTransaction(t as unknown as Record<string, unknown>), payment: t.payment, learner: t.learner })),
      };
    },
    ['payments', 'payment_transactions', 'learners'],
    [monthKey, settings],
    settingsLoaded
  );

  const rows = useMemo(() => data?.rows || [], [data]);
  const receipts = useMemo(() => data?.receipts || [], [data]);

  const stats = useMemo(() => {
    const expected = rows.reduce((s, r) => s + (r.due ?? 0), 0);
    const collected = rows.reduce((s, r) => s + r.paid, 0);
    const outstanding = rows.reduce((s, r) => s + r.balance, 0);
    const count = (st: MonthState) => rows.filter((r) => r.state === st).length;
    return {
      expected,
      collected,
      outstanding,
      rate: expected ? Math.round((Math.min(collected, expected) / expected) * 100) : 0,
      paid: count('paid') + count('waived'),
      partial: count('partial'),
      unpaid: count('unpaid'),
      cash: receipts.reduce((s, r) => s + r.amount, 0),
      unknownFee: rows.filter((r) => r.due === null).length,
    };
  }, [rows, receipts]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (filter === 'owing' && !(r.state === 'unpaid' || r.state === 'partial')) return false;
        if (filter !== 'all' && filter !== 'owing' && r.state !== filter) return false;
        return !q || r.learner.full_name.toLowerCase().includes(q);
      })
      .sort((a, b) => b.balance - a.balance || a.learner.full_name.localeCompare(b.learner.full_name));
  }, [rows, filter, search]);

  const filteredReceipts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return receipts.filter((r) => !q || (r.learner?.full_name || '').toLowerCase().includes(q) || (r.reference || '').toLowerCase().includes(q));
  }, [receipts, search]);

  const rowPage = useIncremental(filteredRows, 40, `${filter}|${search}|${monthKey}`);
  const receiptPage = useIncremental(filteredReceipts, 40, `${search}|${monthKey}`);

  const deleteReceipt = async (r: ReceiptRow) => {
    const ok = await confirm(
      'Delete this receipt?',
      `${formatBIF(r.amount)} from ${r.learner?.full_name || 'this learner'} on ${formatDate(r.paid_on)}. The month's balance will be recalculated.`,
      'Delete receipt',
      true
    );
    if (!ok) return;
    const { error } = await supabase.from('payment_transactions').delete().eq('id', r.id);
    if (error) return toastError(errorMessage(error));
    toast('Receipt deleted');
    notifyDataChanged();
  };

  const exportCsv = () =>
    tab === 'learners'
      ? shareCSV(
          filteredRows.map((r) => ({ Learner: r.learner.full_name, Level: r.learner.level, Month: periodLabel(period), Due: r.due ?? '', Paid: r.paid, Balance: r.balance, Status: r.state })),
          `payments-${monthKey}.csv`
        )
      : shareCSV(
          filteredReceipts.map((r) => ({
            Date: r.paid_on,
            Learner: r.learner?.full_name || '',
            Amount: r.amount,
            'For month': r.payment ? `${r.payment.month} ${r.payment.year}` : '',
            Method: r.method,
            Reference: r.reference || '',
            'Recorded by': r.recorded_by || '',
            Notes: r.notes || '',
          })),
          `receipts-${monthKey}.csv`
        );

  const rateTone = stats.rate >= 80 ? 'green' : stats.rate >= 50 ? 'amber' : 'red';

  return (
    <View style={{ flex: 1 }}>
      <Screen
        title="Payments"
        subtitle="Who has paid, who owes, every receipt"
        right={<IconButton icon={Download} label="Export CSV" onPress={exportCsv} bg={colors.surface} color={colors.text} />}
        refreshing={refreshing}
        onRefresh={refresh}
        contentStyle={{ paddingBottom: 100 }}
      >
        <MonthStepper value={monthKey} onChange={setMonthKey} />
        <View style={{ height: space.lg }} />

        {!data ? (
          <Loader />
        ) : (
          <>
            {stats.unknownFee > 0 && (
              <Banner icon={AlertTriangle} tone="amber">
                {`${stats.unknownFee} learner(s) have no fee set, so their amount owed is unknown. Set the default monthly fee in Settings.`}
              </Banner>
            )}

            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
              <StatCard label="Collection rate" value={`${stats.rate}%`} icon={TrendingUp} tone={rateTone} hint={`${stats.paid} of ${rows.length} paid`} />
              <StatCard label="Collected" value={formatBIF(stats.collected)} icon={Wallet} tone="green" hint={`of ${formatBIF(stats.expected)}`} />
            </View>
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: space.md }}>
              <StatCard
                label="Outstanding"
                value={formatBIF(stats.outstanding)}
                icon={AlertTriangle}
                tone="red"
                alert={stats.outstanding > 0}
                hint={`${stats.unpaid} unpaid · ${stats.partial} partial`}
                onPress={() => {
                  setTab('learners');
                  setFilter('owing');
                }}
              />
              <StatCard label="Cash received" value={formatBIF(stats.cash)} icon={Banknote} tone="blue" hint={`${receipts.length} receipt${receipts.length === 1 ? '' : 's'}`} onPress={() => setTab('receipts')} />
            </View>
            <View style={{ marginBottom: space.xl }}>
              <ProgressBar value={stats.rate} color={rateColor(rateTone)} height={6} />
            </View>

            <Segmented<Tab>
              style={{ marginBottom: space.md }}
              value={tab}
              onChange={setTab}
              options={[
                { value: 'learners', label: 'Learners', count: rows.length },
                { value: 'receipts', label: 'Receipts', count: receipts.length },
              ]}
            />
            <SearchBar value={search} onChange={setSearch} placeholder={tab === 'learners' ? 'Search learner…' : 'Search learner or reference…'} />
            <View style={{ height: space.md }} />

            {tab === 'learners' ? (
              <>
                <Chips<StateFilter>
                  value={filter}
                  onChange={setFilter}
                  style={{ marginBottom: space.lg }}
                  options={[
                    { value: 'owing', label: 'Owing', count: stats.unpaid + stats.partial, alert: true },
                    { value: 'unpaid', label: 'Unpaid', count: stats.unpaid },
                    { value: 'partial', label: 'Partial', count: stats.partial },
                    { value: 'paid', label: 'Paid', count: stats.paid },
                    { value: 'all', label: 'All', count: rows.length },
                  ]}
                />
                {filteredRows.length === 0 ? (
                  <EmptyState
                    icon={filter === 'owing' ? CircleDollarSign : Wallet}
                    title={filter === 'owing' ? `Everyone has paid for ${periodLabel(period)}` : 'Nothing here'}
                    message={filter === 'owing' ? 'No outstanding balances this month.' : 'Try another filter.'}
                  />
                ) : (
                  <Section>
                    {rowPage.visible.map((r, i) => {
                      const owes = r.state === 'unpaid' || r.state === 'partial';
                      return (
                        <Row
                          key={r.learner.id}
                          onPress={() => openLearner(r.learner.id, 'payments')}
                          left={<Avatar name={r.learner.full_name} alert={r.state === 'unpaid'} />}
                          title={r.learner.full_name}
                          titleColor={r.state === 'unpaid' ? colors.red : undefined}
                          style={owes ? { backgroundColor: '#FFF8F8' } : undefined}
                          subtitle={
                            <T v="caption" numberOfLines={1} style={{ marginTop: 2, fontVariant: ['tabular-nums'] }}>
                              {r.due === null ? 'Fee not set' : `${formatBIF(r.paid)} / ${formatBIF(r.due)}`}
                              {r.balance > 0 && <T v="caption" color={colors.red} style={{ fontFamily: fonts.bold }}>{` · owes ${formatBIF(r.balance)}`}</T>}
                            </T>
                          }
                          right={r.balance > 0 || r.due === null ? <Button title="Record" size="sm" onPress={() => recordPayment({ learnerId: r.learner.id, period })} /> : <MonthStateBadge state={r.state} />}
                          last={i === rowPage.visible.length - 1 && !rowPage.hasMore}
                        />
                      );
                    })}
                    <ShowMore remaining={rowPage.remaining} onPress={rowPage.more} />
                  </Section>
                )}
              </>
            ) : filteredReceipts.length === 0 ? (
              <EmptyState icon={ReceiptIcon} title={`No money received in ${periodLabel(period)}`} message="Receipts appear here by the date the money was received." />
            ) : (
              <Section title="Tap for options">
                {receiptPage.visible.map((r, i) => {
                  const otherMonth = r.payment && (MONTH_NAMES.indexOf(r.payment.month) !== period.month || r.payment.year !== period.year);
                  return (
                    <Row
                      key={r.id}
                      onPress={() => setSelected(r)}
                      left={<IconTile icon={ReceiptIcon} tone="green" size={42} />}
                      title={r.learner?.full_name || '—'}
                      subtitle={
                        <T v="caption" numberOfLines={1} style={{ marginTop: 2 }}>
                          {formatDate(r.paid_on, 'short')} · {r.method}
                          {r.payment && <T v="caption" color={otherMonth ? colors.violet : undefined}>{` · for ${r.payment.month.slice(0, 3)} ${r.payment.year}`}</T>}
                        </T>
                      }
                      right={
                        <T v="bodyStrong" color={colors.green} style={{ fontVariant: ['tabular-nums'] }}>
                          +{formatBIF(r.amount)}
                        </T>
                      }
                      last={i === receiptPage.visible.length - 1 && !receiptPage.hasMore}
                    />
                  );
                })}
                <ShowMore remaining={receiptPage.remaining} onPress={receiptPage.more} />
              </Section>
            )}
          </>
        )}
      </Screen>

      <Fab icon={Plus} label="Payment" onPress={() => recordPayment({ period })} />

      <OptionSheet<'open' | 'delete'>
        visible={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `${formatBIF(selected.amount)} · ${selected.learner?.full_name || ''}` : ''}
        options={[
          { value: 'open', label: 'Open learner profile', description: selected ? `${formatDate(selected.paid_on)} · ${selected.method}${selected.reference ? ` · ${selected.reference}` : ''}${selected.recorded_by ? ` · by ${selected.recorded_by.split('@')[0]}` : ''}` : undefined, icon: Wallet },
          { value: 'delete', label: 'Delete receipt', description: "The month's balance is recalculated", icon: Trash2, danger: true },
        ]}
        onSelect={(v) => {
          const r = selected;
          if (!r) return;
          if (v === 'open') openLearner(r.learner_id, 'payments');
          else setTimeout(() => deleteReceipt(r), 250);
        }}
      />
    </View>
  );
}

const rateColor = (t: 'green' | 'amber' | 'red') => (t === 'green' ? colors.green : t === 'amber' ? colors.amber : colors.red);
