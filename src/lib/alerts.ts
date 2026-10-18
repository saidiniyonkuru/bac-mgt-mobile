import { useCallback, useEffect, useState } from 'react';
import { useApp } from './app';
import { useRealtimeRefresh } from './realtime';
import { fetchUnpaidLearners } from './paymentStatus';
import { fetchAbsenceWarnings } from './attendanceStatus';
import { currentPeriod } from './periods';

/** Live counts shown as red badges on the tab bar. */
export function useAlertCounts() {
  const { settings, settingsLoaded, session } = useApp();
  const [counts, setCounts] = useState({ unpaid: 0, warnings: 0 });
  const load = useCallback(async () => {
    if (!settingsLoaded || !session) return;
    try {
      const [unpaid, warnings] = await Promise.all([
        fetchUnpaidLearners(currentPeriod(), settings),
        fetchAbsenceWarnings(settings.absence_warning_weeks),
      ]);
      setCounts({ unpaid: unpaid.length, warnings: warnings.length });
    } catch {
      /* counts are best-effort */
    }
  }, [settings, settingsLoaded, session]);
  useEffect(() => {
    load();
  }, [load]);
  useRealtimeRefresh(['learners', 'payments', 'payment_transactions', 'attendance'], load, 1200);
  return counts;
}
