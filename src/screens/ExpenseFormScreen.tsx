import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useHeaderHeight } from '@react-navigation/elements';
import { Trash2 } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { useApp } from '../lib/app';
import { notifyDataChanged } from '../lib/realtime';
import { errorMessage } from '../lib/db';
import { formatBIF, periodFromKey, periodKey, periodOfDate, periodStart, todayISO } from '../lib/periods';
import { PAYMENT_METHODS } from '../lib/types';
import { RootStackParamList } from '../navigation/types';
import { BottomBar, Button, DateField, Field, IconButton, Input, Section, T } from '../ui';
import { Pill, PillGroup, SwitchRow } from '../ui/kit';
import { colors, space } from '../ui/theme';
import { confirm, toast, toastError } from '../ui/feedback';

export const EXPENSE_CATEGORIES = ['Rent', 'Salaries', 'Utilities', 'Internet', 'Supplies', 'Transport', 'Maintenance', 'Marketing', 'Misc'];

type Props = NativeStackScreenProps<RootStackParamList, 'ExpenseForm'>;

export default function ExpenseFormScreen({ navigation, route }: Props) {
  const { expense, monthKey: selectedMonth, categories: known = [] } = route.params || {};
  const { user } = useApp();
  const headerHeight = useHeaderHeight();

  const defaultDate = () => {
    if (!selectedMonth) return todayISO();
    // Today if it is in the selected month, otherwise the 1st of that month
    return periodKey(periodOfDate(todayISO())) === selectedMonth ? todayISO() : periodStart(periodFromKey(selectedMonth));
  };
  const categories = Array.from(new Set([...EXPENSE_CATEGORIES, ...known]));
  const [form, setForm] = useState({
    date: expense?.date || defaultDate(),
    category: expense?.category || '',
    amount: expense ? String(expense.amount) : '',
    vendor: expense?.vendor || '',
    payment_method: expense?.payment_method || 'Cash',
    description: expense?.description || '',
    is_recurring: expense?.is_recurring || false,
  });
  const [custom, setCustom] = useState(!!expense && !categories.includes(expense.category));
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const remove = async () => {
    if (!expense) return;
    const ok = await confirm('Delete this expense?', `${expense.category} · ${formatBIF(expense.amount)}`, 'Delete', true);
    if (!ok) return;
    const { error } = await supabase.from('expenses').delete().eq('id', expense.id);
    if (error) return toastError(errorMessage(error));
    toast('Expense deleted');
    notifyDataChanged();
    navigation.goBack();
  };

  useEffect(() => {
    navigation.setOptions({
      title: expense ? 'Edit expense' : 'New expense',
      headerRight: expense ? () => <IconButton icon={Trash2} label="Delete expense" color={colors.red} onPress={remove} /> : undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expense, navigation]);

  const submit = async () => {
    const amount = parseFloat(form.amount);
    if (!(amount > 0)) return toastError('Enter an amount');
    if (!form.category.trim()) return toastError('Choose a category');
    setSaving(true);
    const payload = {
      date: form.date,
      category: form.category.trim(),
      amount,
      vendor: form.vendor.trim() || null,
      payment_method: form.payment_method || null,
      description: form.description.trim() || null,
      is_recurring: form.is_recurring,
    };
    const { error } = expense
      ? await supabase.from('expenses').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', expense.id)
      : await supabase.from('expenses').insert([{ ...payload, recorded_by: user?.email }]);
    setSaving(false);
    if (error) return toastError(errorMessage(error));
    toast(expense ? 'Expense updated' : `${formatBIF(amount)} expense added`);
    notifyDataChanged();
    navigation.goBack();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior="padding" keyboardVerticalOffset={headerHeight}>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        <Field label="Amount" required>
          <View>
            <Input big value={form.amount} onChangeText={(v) => set('amount', v.replace(/[^\d]/g, ''))} keyboardType="number-pad" placeholder="0" autoFocus={!expense} style={{ paddingLeft: 64 }} />
            <T v="bodyStrong" color={colors.textFaint} style={{ position: 'absolute', left: 16, top: 19 }}>
              BIF
            </T>
          </View>
        </Field>

        <Field label="Category" required>
          <PillGroup>
            {categories.map((c) => (
              <Pill
                key={c}
                label={c}
                active={!custom && form.category === c}
                onPress={() => {
                  setCustom(false);
                  set('category', c);
                }}
              />
            ))}
            <Pill
              label="+ New"
              dashed
              active={custom}
              onPress={() => {
                setCustom(true);
                set('category', '');
              }}
            />
          </PillGroup>
          {custom && <Input style={{ marginTop: 10 }} value={form.category} onChangeText={(v) => set('category', v)} placeholder="Category name" autoFocus autoCapitalize="words" />}
        </Field>

        <Field label="Date">
          <DateField value={form.date} onChange={(v) => set('date', v)} />
        </Field>

        <Field label="Paid with">
          <PillGroup>
            {PAYMENT_METHODS.map((m) => (
              <Pill key={m} label={m} active={form.payment_method === m} onPress={() => set('payment_method', m)} />
            ))}
          </PillGroup>
        </Field>

        <Field label="Paid to" hint="Landlord, shop, staff member…">
          <Input value={form.vendor} onChangeText={(v) => set('vendor', v)} placeholder="Optional" autoCapitalize="words" />
        </Field>

        <Field label="Description">
          <Input value={form.description} onChangeText={(v) => set('description', v)} multiline placeholder="Optional details" />
        </Field>

        <Section>
          <SwitchRow
            label="Monthly recurring"
            description="e.g. rent, salaries, internet — can be copied to next month in one tap."
            value={form.is_recurring}
            onChange={(v) => set('is_recurring', v)}
            last
          />
        </Section>
      </ScrollView>
      <BottomBar>
        <Button title="Cancel" variant="secondary" onPress={() => navigation.goBack()} />
        <Button title={expense ? 'Save changes' : 'Add expense'} flex size="lg" onPress={submit} loading={saving} />
      </BottomBar>
    </KeyboardAvoidingView>
  );
}
