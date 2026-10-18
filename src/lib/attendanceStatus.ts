import { supabase } from './supabase';
import { AbsenceReason, Attendance, Learner } from './types';
import { fetchAll, normalizeLearner } from './db';
import { addDays, todayISO, weekKey } from './periods';

export interface AttendanceStreak {
  rate: number;
  currentAbsenceStreak: number;
  totalValidSessions: number;
  excusedCount: number;
}

/** Dates on which at least one learner was present (i.e. class happened). */
export async function getValidSessionDates(): Promise<Set<string>> {
  const rows = await fetchAll<{ date: string }>((f, t) =>
    supabase.from('attendance').select('date').eq('present', true).order('date').range(f, t)
  );
  return new Set(rows.map((r) => r.date));
}

export function computeAttendanceStreak(learnerAttendance: Attendance[], validDates: Set<string>): AttendanceStreak {
  const validRecords = learnerAttendance
    .filter((a) => validDates.has(a.date))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const excusedCount = validRecords.filter((a) => !a.present && a.absence_reason).length;
  const counted = validRecords.filter((a) => a.present || !a.absence_reason);
  const presentCount = counted.filter((a) => a.present).length;
  const rate = counted.length > 0 ? Math.round((presentCount / counted.length) * 100) : 0;

  let currentAbsenceStreak = 0;
  for (const record of counted) {
    if (record.present) break;
    currentAbsenceStreak += 1;
  }
  return { rate, currentAbsenceStreak, totalValidSessions: counted.length, excusedCount };
}

// ---------------------------------------------------------------------------
// Absence warnings
// ---------------------------------------------------------------------------

export interface AbsenceWarning {
  learner: Learner;
  /** Unexcused missed sessions in the current streak, newest first */
  missed: { date: string; recordId: string | null }[];
  weeks: number;
  since: string;
  lastPresent: string | null;
}

const LOOKBACK_DAYS = 150;

/**
 * A learner is warned when, since they were last present, they missed class
 * without a reason across `weeksThreshold` or more different weeks.
 *
 * - A "session" is a date where at least one learner of the same level was
 *   present, so cancelled days never count.
 * - A session with no record for the learner counts as an unexcused absence.
 * - Absences with a reason (sick, school, job…) are skipped entirely.
 */
export async function fetchAbsenceWarnings(weeksThreshold = 3): Promise<AbsenceWarning[]> {
  const since = addDays(todayISO(), -LOOKBACK_DAYS);
  const [learnersRaw, attendance] = await Promise.all([
    fetchAll((f, t) => supabase.from('learners').select('*').order('full_name').range(f, t)),
    fetchAll<Attendance>((f, t) =>
      supabase.from('attendance').select('*').gte('date', since).order('date').order('id').range(f, t)
    ),
  ]);
  return computeAbsenceWarnings(learnersRaw.map(normalizeLearner), attendance, weeksThreshold);
}

/** Pure part of fetchAbsenceWarnings (see rules above). */
export function computeAbsenceWarnings(learners: Learner[], attendance: Attendance[], weeksThreshold: number): AbsenceWarning[] {
  const levelOf = new Map(learners.map((l) => [l.id, l.level]));

  const sessionsByLevel = new Map<string, Set<string>>();
  const recordsByLearner = new Map<string, Map<string, Attendance>>();
  attendance.forEach((a) => {
    if (a.present) {
      const lvl = levelOf.get(a.learner_id);
      if (lvl) {
        if (!sessionsByLevel.has(lvl)) sessionsByLevel.set(lvl, new Set());
        sessionsByLevel.get(lvl)!.add(a.date);
      }
    }
    if (!recordsByLearner.has(a.learner_id)) recordsByLearner.set(a.learner_id, new Map());
    recordsByLearner.get(a.learner_id)!.set(a.date, a);
  });

  const warnings: AbsenceWarning[] = [];
  learners.forEach((learner) => {
    if (learner.active === false || (learner.status && learner.status !== 'active')) return;
    const sessions = [...(sessionsByLevel.get(learner.level) || [])]
      .filter((d) => d >= learner.enrollment_date)
      .sort()
      .reverse();
    const records = recordsByLearner.get(learner.id) || new Map<string, Attendance>();

    const missed: AbsenceWarning['missed'] = [];
    for (const date of sessions) {
      const rec = records.get(date);
      if (rec?.present) break;
      if (rec?.absence_reason) continue;
      missed.push({ date, recordId: rec?.id ?? null });
    }
    const weeks = new Set(missed.map((m) => weekKey(m.date))).size;
    if (weeks < weeksThreshold) return;

    const lastPresent =
      [...records.values()]
        .filter((r) => r.present)
        .map((r) => r.date)
        .sort()
        .pop() || null;
    warnings.push({ learner, missed, weeks, since: missed[missed.length - 1].date, lastPresent });
  });

  return warnings.sort((a, b) => b.weeks - a.weeks || a.learner.full_name.localeCompare(b.learner.full_name));
}

/** Gives a reason to every missed session in a warning, removing it from the list. */
export async function excuseAbsences(warning: AbsenceWarning, reason: AbsenceReason, notes?: string) {
  const rows = warning.missed.map((m) => ({
    learner_id: warning.learner.id,
    date: m.date,
    present: false,
    absence_reason: reason,
    notes: notes || null,
  }));
  const { error } = await supabase.from('attendance').upsert(rows, { onConflict: 'learner_id,date' });
  if (error) throw error;
}
