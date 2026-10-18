import { useMemo, useState } from 'react';
import { Linking, View } from 'react-native';
import { AlertTriangle, CalendarX, Download, Phone, Plus, SlidersHorizontal, UserPlus, Users } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { useApp } from '../lib/app';
import { fetchAll, normalizeLearner } from '../lib/db';
import { fetchUnpaidLearners, UnpaidLearner } from '../lib/paymentStatus';
import { fetchAbsenceWarnings } from '../lib/attendanceStatus';
import { currentPeriod, formatBIF, periodLabel } from '../lib/periods';
import { Learner, Level } from '../lib/types';
import { useLoad } from '../lib/useLoad';
import { shareCSV } from '../lib/csv';
import { useNav } from '../navigation/types';
import { Avatar, Badge, Button, Chips, EmptyState, IconButton, Loader, Row, Screen, SearchBar, Section, T } from '../ui';
import { Banner, Fab, OptionSheet, ShowMore, useIncremental } from '../ui/kit';
import { LEARNER_STATUS, LEVEL_TONE } from '../ui/status';
import { colors, space } from '../ui/theme';

type Filter = 'all' | 'active' | 'unpaid' | 'warning' | 'abandoned' | 'graduated' | 'inactive';
type LevelFilter = 'all' | Level;

interface Data {
  learners: Learner[];
  unpaid: Map<string, UnpaidLearner>;
  warned: Set<string>;
}

export default function LearnersScreen() {
  const { settings, settingsLoaded } = useApp();
  const { openLearner, editLearner } = useNav();
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState<LevelFilter>('all');
  const [levelOpen, setLevelOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const period = currentPeriod();

  const { data, refresh, refreshing } = useLoad<Data>(
    async () => {
      const [rows, unpaidList, warnings] = await Promise.all([
        fetchAll((f, t) => supabase.from('learners').select('*').order('full_name').range(f, t)),
        fetchUnpaidLearners(period, settings),
        fetchAbsenceWarnings(settings.absence_warning_weeks),
      ]);
      return {
        learners: rows.map(normalizeLearner),
        unpaid: new Map(unpaidList.map((u) => [u.learner.id, u])),
        warned: new Set(warnings.map((w) => w.learner.id)),
      };
    },
    ['learners', 'payments', 'payment_transactions', 'attendance'],
    [settings],
    settingsLoaded
  );

  const { learners, unpaid, warned } = useMemo(
    () => ({ learners: data?.learners || [], unpaid: data?.unpaid || new Map<string, UnpaidLearner>(), warned: data?.warned || new Set<string>() }),
    [data]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return learners.filter((l) => {
      if (level !== 'all' && l.level !== level) return false;
      const status = l.status || 'active';
      if (filter === 'active' && !(l.active !== false && status === 'active')) return false;
      if (filter === 'unpaid' && !unpaid.has(l.id)) return false;
      if (filter === 'warning' && !warned.has(l.id)) return false;
      if (filter === 'abandoned' && status !== 'abandoned') return false;
      if (filter === 'graduated' && status !== 'graduated') return false;
      if (filter === 'inactive' && l.active !== false) return false;
      if (!q) return true;
      return [l.full_name, l.phone, l.email, l.residence].some((v) => (v || '').toLowerCase().includes(q));
    });
  }, [learners, search, level, filter, unpaid, warned]);

  const page = useIncremental(filtered, 40, `${search}|${level}|${filter}`);
  const activeCount = learners.filter((l) => l.active !== false && (l.status || 'active') === 'active').length;

  const exportCsv = () =>
    shareCSV(
      filtered.map((l) => ({
        Name: l.full_name,
        Phone: l.phone || '',
        Email: l.email || '',
        Gender: l.gender || '',
        Residence: l.residence || '',
        Level: l.level,
        Enrolled: l.enrollment_date,
        Status: l.status || 'active',
        Active: l.active !== false ? 'Yes' : 'No',
        [`Paid ${periodLabel(period)}`]: unpaid.has(l.id) ? 'No' : 'Yes',
      })),
      'learners.csv'
    );

  return (
    <View style={{ flex: 1 }}>
      <Screen
        title="Learners"
        subtitle={data ? `${activeCount} active of ${learners.length} registered` : undefined}
        right={<IconButton icon={Download} label="Export CSV" onPress={exportCsv} bg={colors.surface} color={colors.text} />}
        refreshing={refreshing}
        onRefresh={refresh}
        contentStyle={{ paddingBottom: 100 }}
      >
        {!data ? (
          <Loader />
        ) : (
          <>
            {unpaid.size > 0 && filter !== 'unpaid' && (
              <Banner icon={AlertTriangle} tone="red" onPress={() => setFilter('unpaid')}>
                <T v="callout" color={colors.text}>
                  <T v="bodyStrong" color={colors.red}>
                    {unpaid.size}
                  </T>{' '}
                  learner{unpaid.size === 1 ? ' has' : 's have'} not paid for {periodLabel(period)}
                </T>
              </Banner>
            )}

            <View style={{ flexDirection: 'row', gap: 8, marginBottom: space.md }}>
              <View style={{ flex: 1 }}>
                <SearchBar value={search} onChange={setSearch} placeholder="Name, phone, residence…" />
              </View>
              <IconButton
                icon={SlidersHorizontal}
                label="Filter by level"
                size={50}
                onPress={() => setLevelOpen(true)}
                bg={level === 'all' ? colors.surface : colors.primary}
                color={level === 'all' ? colors.text : '#fff'}
              />
            </View>

            <Chips<Filter>
              value={filter}
              onChange={setFilter}
              style={{ marginBottom: space.lg }}
              options={[
                { value: 'all', label: level === 'all' ? 'All' : `All ${level}`, count: learners.length },
                { value: 'active', label: 'Active', count: activeCount },
                { value: 'unpaid', label: 'Unpaid', count: unpaid.size, alert: true },
                { value: 'warning', label: 'Absence warning', count: warned.size, alert: true },
                { value: 'abandoned', label: 'Abandoned' },
                { value: 'graduated', label: 'Graduated' },
                { value: 'inactive', label: 'Inactive' },
              ]}
            />

            {filtered.length === 0 ? (
              <EmptyState
                icon={learners.length ? Users : UserPlus}
                title={learners.length ? 'No learners match' : 'No learners yet'}
                message={learners.length ? 'Try another search or filter.' : 'Add your first learner to get started.'}
                action={!learners.length ? <Button title="Add learner" icon={Plus} onPress={() => editLearner(null)} /> : undefined}
              />
            ) : (
              <Section title={`${filtered.length} learner${filtered.length === 1 ? '' : 's'}`}>
                {page.visible.map((l, i) => {
                  const u = unpaid.get(l.id);
                  const status = l.status || 'active';
                  return (
                    <Row
                      key={l.id}
                      onPress={() => openLearner(l.id)}
                      left={<Avatar name={l.full_name} alert={!!u} />}
                      title={l.full_name}
                      titleColor={u ? colors.red : undefined}
                      style={u ? { backgroundColor: '#FFF8F8' } : undefined}
                      subtitle={
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 5 }}>
                          <Badge label={l.level} tone={LEVEL_TONE[l.level]} />
                          {l.active === false ? <Badge label="Inactive" tone="slate" /> : status !== 'active' && <Badge label={LEARNER_STATUS[status].label} tone={LEARNER_STATUS[status].tone} />}
                          {u && <Badge label={u.reason === 'partial' ? `Partial${u.amountOwed ? ` · ${formatBIF(u.amountOwed)}` : ''}` : 'Unpaid'} tone="red" solid />}
                          {warned.has(l.id) && <Badge label="Absent" tone="amber" icon={CalendarX} />}
                        </View>
                      }
                      right={l.phone ? <IconButton icon={Phone} label={`Call ${l.full_name}`} bg={colors.slateSoft} onPress={() => Linking.openURL(`tel:${l.phone}`)} /> : undefined}
                      chevron={!l.phone}
                      last={i === page.visible.length - 1 && !page.hasMore}
                    />
                  );
                })}
                <ShowMore remaining={page.remaining} onPress={page.more} />
              </Section>
            )}
          </>
        )}
      </Screen>

      <Fab icon={Plus} label="Learner" onPress={() => editLearner(null)} />

      <OptionSheet<LevelFilter>
        visible={levelOpen}
        onClose={() => setLevelOpen(false)}
        title="Level"
        value={level}
        onSelect={setLevel}
        options={[
          { value: 'all', label: 'All levels' },
          { value: 'Beginner', label: 'Beginner' },
          { value: 'Intermediate', label: 'Intermediate' },
          { value: 'Advanced', label: 'Advanced' },
        ]}
      />
    </View>
  );
}
