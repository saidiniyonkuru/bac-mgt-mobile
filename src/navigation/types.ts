import { useCallback, useMemo } from 'react';
import { NavigatorScreenParams, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Expense } from '../lib/types';
import { Period, periodKey } from '../lib/periods';

export type ProfileTab = 'overview' | 'payments' | 'attendance' | 'info';

export type TabParamList = {
  Home: undefined;
  Learners: undefined;
  Attendance: undefined;
  Payments: undefined;
  More: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  LearnerProfile: { id: string; tab?: ProfileTab };
  LearnerForm: { id?: string };
  PaymentForm: { learnerId?: string; periodKey?: string };
  ExpenseForm: { expense?: Expense; monthKey?: string; categories?: string[] };
  Expenses: undefined;
  History: undefined;
  Reports: undefined;
  Settings: undefined;
};

export type RootNav = NativeStackNavigationProp<RootStackParamList>;

/** Typed navigation plus the shortcuts every screen uses (same as the web app context). */
export function useNav() {
  const nav = useNavigation<RootNav>();
  const openLearner = useCallback((id: string, tab?: ProfileTab) => nav.push('LearnerProfile', { id, tab }), [nav]);
  const recordPayment = useCallback(
    (prefill: { learnerId?: string; period?: Period } = {}) =>
      nav.navigate('PaymentForm', { learnerId: prefill.learnerId, periodKey: prefill.period ? periodKey(prefill.period) : undefined }),
    [nav]
  );
  const editLearner = useCallback((id?: string | null) => nav.navigate('LearnerForm', { id: id || undefined }), [nav]);
  const goTab = useCallback((tab: keyof TabParamList) => nav.navigate('Tabs', { screen: tab }), [nav]);
  return useMemo(() => ({ nav, openLearner, recordPayment, editLearner, goTab }), [nav, openLearner, recordPayment, editLearner, goTab]);
}
