import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { useRealtimeRefresh } from './realtime';
import { num } from './db';
import { AppSettings } from './types';

export const APP_NAME = 'BAC MGT';

export const DEFAULT_SETTINGS: AppSettings = {
  club_name: 'English Learners Club',
  default_monthly_fee: 0,
  absence_warning_weeks: 3,
};

interface AppValue {
  session: Session | null;
  user: User | null;
  ready: boolean;
  settings: AppSettings;
  settingsLoaded: boolean;
  reloadSettings: () => Promise<void>;
}

const AppContext = createContext<AppValue | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

/** Signed-in user + club settings shared by every screen. */
export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const reloadSettings = useCallback(async () => {
    if (!session) return;
    const { data, error } = await supabase.from('app_settings').select('*').eq('id', 1).maybeSingle();
    if (!error && data) {
      setSettings({
        club_name: data.club_name || DEFAULT_SETTINGS.club_name,
        default_monthly_fee: num(data.default_monthly_fee),
        absence_warning_weeks: data.absence_warning_weeks || DEFAULT_SETTINGS.absence_warning_weeks,
      });
    }
    setSettingsLoaded(true);
  }, [session]);

  useEffect(() => {
    reloadSettings();
  }, [reloadSettings]);
  useRealtimeRefresh(['app_settings'], reloadSettings);

  return (
    <AppContext.Provider value={{ session, user: session?.user ?? null, ready, settings, settingsLoaded, reloadSettings }}>
      {children}
    </AppContext.Provider>
  );
}
