import { useEffect, useRef } from 'react';
import { AppState, DeviceEventEmitter } from 'react-native';
import { supabase } from './supabase';

export type RealtimeTable = 'learners' | 'payments' | 'payment_transactions' | 'attendance' | 'expenses' | 'app_settings';

const LOCAL_EVENT = 'bac:data-changed';

/** Tell every open screen on this phone that data changed (instant). */
export function notifyDataChanged() {
  DeviceEventEmitter.emit(LOCAL_EVENT);
}

let channelCounter = 0;

/**
 * Keeps a screen in sync with every other phone and the web app.
 * Calls `onChange` (debounced) on any database change to `tables`, when
 * something is saved on this phone, and when the app returns to the foreground.
 */
export function useRealtimeRefresh(tables: RealtimeTable[], onChange: () => void, debounceMs = 400) {
  const callbackRef = useRef(onChange);
  callbackRef.current = onChange;
  const tablesKey = [...tables].sort().join(',');

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const trigger = () => {
      clearTimeout(timer);
      timer = setTimeout(() => callbackRef.current(), debounceMs);
    };

    let channel = supabase.channel(`rt:${tablesKey}:${++channelCounter}`);
    tablesKey.split(',').forEach((table) => {
      channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, trigger);
    });
    channel.subscribe();

    const local = DeviceEventEmitter.addListener(LOCAL_EVENT, trigger);
    const appState = AppState.addEventListener('change', (s) => s === 'active' && trigger());

    return () => {
      clearTimeout(timer);
      local.remove();
      appState.remove();
      supabase.removeChannel(channel);
    };
  }, [tablesKey, debounceMs]);
}
