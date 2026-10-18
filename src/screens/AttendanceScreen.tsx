import { useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { AlertTriangle, CalendarCheck, Check, Info, Phone, ShieldCheck, X } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { useApp } from '../lib/app';
import { notifyDataChanged } from '../lib/realtime';
import { errorMessage, fetchAll, normalizeLearner } from '../lib/db';
import { AbsenceWarning, excuseAbsences, fetchAbsenceWarnings } from '../lib/attendanceStatus';
import { addDays, formatDate, parseISODate, toISODate, todayISO } from '../lib/periods';
import { ABSENCE_REASONS, AbsenceReason, Attendance as AttendanceRecord, Learner, Level } from '../lib/types';
import { useLoad } from '../lib/useLoad';
import { useNav } from '../navigation/types';
import { Avatar, Badge, Button, Card, EmptyState, Field, Input, Loader, Screen, SearchBar, Segmented, Stepper, T } from '../ui';
import { Banner, Metric, Pill, PillGroup, Sheet } from '../ui/kit';
import { LEVEL_TONE } from '../ui/status';
import { colors, fonts, radius, space } from '../ui/theme';
import { haptic, toast, toastError } from '../ui/feedback';

type Tab = 'mark' | 'warnings';
const LEVELS: Level[] = ['Beginner', 'Intermediate', 'Advanced'];

interface Data {
  learners: Learner[];
  records: Map<string, AttendanceRecord>;
  warnings: AbsenceWarning[];
}

export default function AttendanceScreen() {
  const { settings, settingsLoaded } = useApp();
  const { openLearner } = useNav();
  const [tab, setTab] = useState<Tab>('mark');
  const [date, setDate] = useState(todayISO());
  const [pickDate, setPickDate] = useState(false);
  const [level, setLevel] = useState<Level>('Beginner');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [justify, setJustify] = useState<AbsenceWarning | null>(null);

  const { data, setData, reload, refresh, refreshing } = useLoad<Data>(
    async () => {
      const [ls, att, warn] = await Promise.all([
        fetchAll((f, t) => supabase.from('learners').select('*').eq('active', true).neq('status', 'graduated').order('full_name').range(f, t)),
        supabase.from('attendance').select('*').eq('date', date),
        fetchAbsenceWarnings(settings.absence_warning_weeks),
      ]);
      if (att.error) throw att.error;
      return {
        learners: ls.map(normalizeLearner),
        records: new Map((att.data || []).map((a: AttendanceRecord) => [a.learner_id, a])),
        warnings: warn,
      };
    },
    ['attendance', 'learners'],
    [date, settings.absence_warning_weeks],
    settingsLoaded
  );

  const { learners, records, warnings } = useMemo(
    () => ({ learners: data?.learners || [], records: data?.records || new Map<string, AttendanceRecord>(), warnings: data?.warnings || [] }),
    [data]
  );

  const levelLearners = useMemo(() => {
    const q = search.trim().toLowerCase();
    return learners.filter((l) => l.level === level && (!q || l.full_name.toLowerCase().includes(q)));
  }, [learners, level, search]);

  const countFor = (lvl: Level) => learners.filter((l) => l.level === lvl).length;
  const present = levelLearners.filter((l) => records.get(l.id)?.present === true).length;
  const absent = levelLearners.filter((l) => records.get(l.id)?.present === false).length;
  const unmarked = levelLearners.length - present - absent;

  const save = async (rows: Partial<AttendanceRecord>[]) => {
    // optimistic
    setData((prev) => {
      if (!prev) return prev;
      const next = new Map(prev.records);
      rows.forEach((r) => next.set(r.learner_id!, { ...(prev.records.get(r.learner_id!) || ({} as AttendanceRecord)), ...r } as AttendanceRecord));
      return { ...prev, records: next };
    });
    const { error } = await supabase.from('attendance').upsert(rows, { onConflict: 'learner_id,date' });
    if (error) {
      toastError(errorMessage(error));
      reload();
      return false;
    }
    notifyDataChanged();
    return true;
  };

  const mark = (l: Learner, isPresent: boolean) => {
    haptic(isPresent ? 10 : 18);
    save([{ learner_id: l.id, date, present: isPresent, absence_reason: isPresent ? null : records.get(l.id)?.absence_reason ?? null }]);
  };

  const setReason = (l: Learner, reason: string) => save([{ learner_id: l.id, date, present: false, absence_reason: (reason || null) as AbsenceReason | null }]);

  const bulk = async (isPresent: boolean, onlyUnmarked: boolean) => {
    const targets = levelLearners.filter((l) => !onlyUnmarked || !records.has(l.id));
    if (!targets.length) return;
    setBusy(true);
    const ok = await save(targets.map((l) => ({ learner_id: l.id, date, present: isPresent, absence_reason: null })));
    setBusy(false);
    if (ok) toast(`${targets.length} marked ${isPresent ? 'present' : 'absent'}`);
  };

  const isToday = date === todayISO();

  return (
    <Screen title="Attendance" subtitle="Mark who came and follow up on absences" refreshing={refreshing} onRefresh={refresh}>
      <Segmented<Tab>
        style={{ marginBottom: space.lg }}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'mark', label: 'Mark attendance' },
          { value: 'warnings', label: 'Warnings', count: warnings.length },
        ]}
      />

      {!data ? (
        <Loader />
      ) : tab === 'mark' ? (
        <>
          <Stepper
            label={`${isToday ? 'Today · ' : ''}${formatDate(date, 'weekday')}`}
            onPrev={() => setDate(addDays(date, -1))}
            onNext={() => setDate(addDays(date, 1))}
            nextDisabled={isToday}
            onPressLabel={() => setPickDate(true)}
          />
          {pickDate && (
            <DateTimePicker
              value={parseISODate(date)}
              mode="date"
              maximumDate={new Date()}
              onChange={(e, d) => {
                setPickDate(false);
                if (e.type === 'set' && d) setDate(toISODate(d));
              }}
            />
          )}

          <Segmented<Level>
            style={{ marginTop: space.md }}
            value={level}
            onChange={setLevel}
            options={LEVELS.map((l) => ({ value: l, label: l === 'Intermediate' ? 'Interm.' : l, count: countFor(l) }))}
          />

          <View style={styles.tallies}>
            <Metric label="Present" value={present} tone="green" />
            <Metric label="Absent" value={absent} tone="red" />
            <Metric label="Not marked" value={unmarked} tone="slate" />
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginBottom: space.md }}>
            <Button title="All present" icon={Check} variant="secondary" flex onPress={() => bulk(true, false)} loading={busy} disabled={!levelLearners.length} />
            <Button title="Rest absent" icon={X} variant="secondary" flex onPress={() => bulk(false, true)} disabled={!unmarked || busy} />
          </View>

          <SearchBar value={search} onChange={setSearch} placeholder="Find a learner…" />

          <View style={{ height: space.md }} />
          {levelLearners.length === 0 ? (
            <Card>
              <EmptyState icon={CalendarCheck} title={`No active ${level.toLowerCase()} learners`} />
            </Card>
          ) : (
            <View style={styles.list}>
              {levelLearners.map((l, i) => {
                const rec = records.get(l.id);
                const isPresent = rec?.present;
                return (
                  <View key={l.id} style={[styles.item, i < levelLearners.length - 1 && styles.divider, isPresent === false && !rec?.absence_reason && { backgroundColor: '#FFF8F8' }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <Pressable onPress={() => openLearner(l.id, 'attendance')} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 0 }}>
                        <Avatar name={l.full_name} size={42} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <T v="bodyStrong" numberOfLines={1}>
                            {l.full_name}
                          </T>
                          <T v="caption" color={isPresent === true ? colors.green : isPresent === false ? (rec?.absence_reason ? colors.textMuted : colors.red) : colors.textFaint}>
                            {isPresent === true ? 'Present' : isPresent === false ? (rec?.absence_reason ? `Excused · ${rec.absence_reason}` : 'Absent') : 'Not marked'}
                          </T>
                        </View>
                      </Pressable>
                      <MarkButton kind="present" active={isPresent === true} onPress={() => mark(l, true)} />
                      <MarkButton kind="absent" active={isPresent === false} onPress={() => mark(l, false)} />
                    </View>
                    {isPresent === false && (
                      <PillGroup style={{ marginTop: 10, marginLeft: 54, gap: 6 }}>
                        {ABSENCE_REASONS.map((r) => (
                          <Pressable
                            key={r}
                            onPress={() => {
                              haptic(8);
                              setReason(l, rec?.absence_reason === r ? '' : r);
                            }}
                            style={[styles.reason, rec?.absence_reason === r && styles.reasonActive]}
                          >
                            <Text style={{ fontFamily: fonts.semibold, fontSize: 13.5, color: rec?.absence_reason === r ? '#fff' : colors.textSecondary }}>{r}</Text>
                          </Pressable>
                        ))}
                      </PillGroup>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </>
      ) : (
        <>
          <Banner icon={Info} tone="blue">
            <T v="callout" color={colors.text}>
              Learners who missed class for <T v="bodyStrong" style={{ fontSize: 15 }}>{settings.absence_warning_weeks} weeks in a row</T> without a reason. Add a reason (sick, school, job…) to remove them from this list.
            </T>
          </Banner>

          {warnings.length === 0 ? (
            <Card>
              <EmptyState icon={ShieldCheck} title="No warnings" message="Every active learner attended recently or has a reason for being away." />
            </Card>
          ) : (
            warnings.map((w) => (
              <Card key={w.learner.id} style={styles.warning}>
                <Pressable onPress={() => openLearner(w.learner.id, 'attendance')} style={{ flexDirection: 'row', gap: 12 }}>
                  <Avatar name={w.learner.full_name} alert size={48} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <T v="headline" numberOfLines={1}>
                      {w.learner.full_name}
                    </T>
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                      <Badge label={w.learner.level} tone={LEVEL_TONE[w.learner.level]} />
                      <Badge label={`${w.weeks} weeks absent`} tone="red" icon={AlertTriangle} />
                    </View>
                    <T v="caption" style={{ marginTop: 8 }}>
                      Missed {w.missed.length} class{w.missed.length === 1 ? '' : 'es'} since {formatDate(w.since, 'short')} · last present {w.lastPresent ? formatDate(w.lastPresent, 'short') : 'never'}
                    </T>
                  </View>
                </Pressable>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                  {w.learner.phone ? <Button title="Call" icon={Phone} variant="secondary" flex onPress={() => Linking.openURL(`tel:${w.learner.phone}`)} /> : null}
                  <Button title="Add reason" icon={ShieldCheck} flex onPress={() => setJustify(w)} />
                </View>
              </Card>
            ))
          )}
        </>
      )}

      {justify && <JustifySheet warning={justify} onClose={() => setJustify(null)} onDone={() => { setJustify(null); reload(); }} />}
    </Screen>
  );
}

function MarkButton({ kind, active, onPress }: { kind: 'present' | 'absent'; active: boolean; onPress: () => void }) {
  const isPresent = kind === 'present';
  const color = isPresent ? colors.green : colors.red;
  const Icon = isPresent ? Check : X;
  return (
    <Pressable
      accessibilityLabel={isPresent ? 'Mark present' : 'Mark absent'}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [
        styles.mark,
        active ? { backgroundColor: color, borderColor: color } : { backgroundColor: colors.surface, borderColor: colors.border },
        pressed && { transform: [{ scale: 0.92 }] },
      ]}
    >
      <Icon size={24} color={active ? '#fff' : colors.textFaint} strokeWidth={3} />
    </Pressable>
  );
}

function JustifySheet({ warning, onClose, onDone }: { warning: AbsenceWarning; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState<AbsenceReason>('Sick');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await excuseAbsences(warning, reason, notes.trim());
      notifyDataChanged();
      toast(`${warning.learner.full_name}: ${warning.missed.length} absence(s) excused`);
      onDone();
    } catch (err) {
      toastError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title="Reason for absence"
      subtitle={`${warning.learner.full_name} · ${warning.missed.length} missed class${warning.missed.length === 1 ? '' : 'es'}`}
      footer={
        <>
          <Button title="Cancel" variant="secondary" flex onPress={onClose} />
          <Button title="Save reason" flex onPress={save} loading={saving} />
        </>
      }
    >
      <PillGroup style={{ marginBottom: space.lg }}>
        {ABSENCE_REASONS.map((r) => (
          <Pill key={r} label={r} active={reason === r} onPress={() => setReason(r)} />
        ))}
      </PillGroup>
      <Field label="Details" hint="e.g. hospitalised, exams period, new job schedule">
        <Input value={notes} onChangeText={setNotes} multiline placeholder="Optional" />
      </Field>
      <Field label="Absences being excused">
        <View style={styles.dates}>
          <T v="callout" color={colors.text}>
            {warning.missed.map((m) => formatDate(m.date, 'short')).join(', ')}
          </T>
        </View>
      </Field>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  tallies: { flexDirection: 'row', gap: 10, marginVertical: space.md },
  list: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  item: { paddingHorizontal: space.lg, paddingVertical: 12 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  mark: { width: 50, height: 50, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  reason: { height: 34, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, justifyContent: 'center' },
  reasonActive: { backgroundColor: colors.text, borderColor: colors.text },
  warning: { padding: space.lg, marginBottom: 12, borderColor: '#FCD34D' },
  dates: { padding: 12, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
});
