import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from './db';
import { RealtimeTable, useRealtimeRefresh } from './realtime';
import { toastError } from '../ui/feedback';

/**
 * Loads a screen's data, keeps it live (realtime + local saves + app resume)
 * and drives pull-to-refresh. `deps` re-run the loader (month, date, settings…).
 */
export function useLoad<T>(loader: () => Promise<T | undefined>, tables: RealtimeTable[], deps: unknown[], enabled = true) {
  const [data, setData] = useState<T | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const seq = useRef(0);

  const run = useCallback(async () => {
    if (!enabled) return;
    const id = ++seq.current;
    try {
      const result = await loaderRef.current();
      if (id === seq.current && result !== undefined) setData(result);
    } catch (err) {
      if (id === seq.current) toastError(errorMessage(err));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, ...deps]);

  useRealtimeRefresh(tables, run);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await run();
    setRefreshing(false);
  }, [run]);

  return { data, setData, reload: run, refresh, refreshing };
}
