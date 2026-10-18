import { ReactNode, useEffect, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useHeaderHeight } from '@react-navigation/elements';
import { Info } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { useApp } from '../lib/app';
import { notifyDataChanged } from '../lib/realtime';
import { errorMessage, normalizeLearner } from '../lib/db';
import { formatBIF, todayISO } from '../lib/periods';
import { Learner, Level } from '../lib/types';
import { RootStackParamList } from '../navigation/types';
import { BottomBar, Button, DateField, Field, Input, Loader, Section, Segmented, T } from '../ui';
import { Banner, SwitchRow } from '../ui/kit';
import { colors, space } from '../ui/theme';
import { toast, toastError } from '../ui/feedback';

type Props = NativeStackScreenProps<RootStackParamList, 'LearnerForm'>;
type FeeMode = 'default' | 'custom' | 'free';

export default function LearnerFormScreen({ navigation, route }: Props) {
  const learnerId = route.params?.id;
  const { settings } = useApp();
  const headerHeight = useHeaderHeight();
  const [learner, setLearner] = useState<Learner | null>(null);
  const [loading, setLoading] = useState(!!learnerId);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    email: '',
    gender: '',
    residence: '',
    level: 'Beginner' as Level,
    enrollment_date: todayISO(),
    active: true,
    graduated: false,
    notes: '',
  });
  const [feeMode, setFeeMode] = useState<FeeMode>('default');
  const [customFee, setCustomFee] = useState('');

  useEffect(() => {
    navigation.setOptions({ title: learnerId ? 'Edit learner' : 'New learner' });
    if (!learnerId) return;
    supabase
      .from('learners')
      .select('*')
      .eq('id', learnerId)
      .single()
      .then(({ data, error }) => {
        setLoading(false);
        if (error) return toastError(errorMessage(error));
        const l = normalizeLearner(data);
        setLearner(l);
        setForm({
          full_name: l.full_name,
          phone: l.phone || '',
          email: l.email || '',
          gender: l.gender || '',
          residence: l.residence || '',
          level: l.level,
          enrollment_date: l.enrollment_date,
          active: l.active !== false,
          graduated: l.status === 'graduated',
          notes: l.notes || '',
        });
        if (l.monthly_fee === 0) setFeeMode('free');
        else if (l.monthly_fee != null) {
          setFeeMode('custom');
          setCustomFee(String(l.monthly_fee));
        }
      });
  }, [learnerId, navigation]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.full_name.trim()) return toastError('Enter the learner’s full name');
    if (feeMode === 'custom' && !(parseFloat(customFee) > 0)) return toastError('Enter the custom monthly fee');
    setSaving(true);
    const { graduated, ...rest } = form;
    const payload: Record<string, unknown> = {
      ...rest,
      full_name: rest.full_name.trim(),
      email: rest.email.trim() || null,
      phone: rest.phone.trim() || null,
      residence: rest.residence.trim() || null,
      gender: rest.gender || null,
      notes: rest.notes.trim() || null,
      monthly_fee: feeMode === 'free' ? 0 : feeMode === 'custom' ? parseFloat(customFee) : null,
    };
    // Status is otherwise computed from attendance — only touch it to toggle graduation
    if (graduated) payload.status = 'graduated';
    else if (learner?.status === 'graduated') payload.status = 'active';

    try {
      if (learner) {
        const { error } = await supabase.from('learners').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', learner.id);
        if (error) throw error;
        toast('Learner updated');
        notifyDataChanged();
        navigation.goBack();
      } else {
        const { data, error } = await supabase.from('learners').insert([payload]).select('id').single();
        if (error) throw error;
        toast(`${payload.full_name} added`);
        notifyDataChanged();
        navigation.replace('LearnerProfile', { id: data.id as string });
      }
    } catch (err) {
      toastError(errorMessage(err));
      setSaving(false);
    }
  };

  if (loading) return <Loader />;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior="padding" keyboardVerticalOffset={headerHeight}>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        <Group title="Personal">
          <Field label="Full name" required>
            <Input value={form.full_name} onChangeText={(v) => set('full_name', v)} autoFocus={!learnerId} autoCapitalize="words" placeholder="e.g. Aline Niyonsaba" />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChangeText={(v) => set('phone', v)} keyboardType="phone-pad" placeholder="+257 …" />
          </Field>
          <Field label="Email">
            <Input value={form.email} onChangeText={(v) => set('email', v)} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} placeholder="Optional" />
          </Field>
          <Field label="Gender">
            <Segmented
              value={form.gender || 'none'}
              onChange={(v) => set('gender', v === 'none' ? '' : v)}
              options={[
                { value: 'none', label: '—' },
                { value: 'Male', label: 'Male' },
                { value: 'Female', label: 'Female' },
                { value: 'Other', label: 'Other' },
              ]}
            />
          </Field>
          <Field label="Residence" style={{ marginBottom: 0 }}>
            <Input value={form.residence} onChangeText={(v) => set('residence', v)} placeholder="e.g. Bujumbura" autoCapitalize="words" />
          </Field>
        </Group>

        <Group title="Class">
          <Field label="Level" required>
            <Segmented
              value={form.level}
              onChange={(v) => set('level', v)}
              options={[
                { value: 'Beginner', label: 'Beginner' },
                { value: 'Intermediate', label: 'Interm.' },
                { value: 'Advanced', label: 'Advanced' },
              ]}
            />
          </Field>
          <Field label="Enrollment date" required hint="Billing starts from this month." style={{ marginBottom: 0 }}>
            <DateField value={form.enrollment_date} onChange={(v) => set('enrollment_date', v)} />
          </Field>
        </Group>

        <Group title="Billing">
          <Segmented
            value={feeMode}
            onChange={setFeeMode}
            options={[
              { value: 'default', label: 'Default fee' },
              { value: 'custom', label: 'Custom' },
              { value: 'free', label: 'Free' },
            ]}
          />
          <View style={{ marginTop: space.md }}>
            {feeMode === 'default' && (
              <T v="callout">
                {settings.default_monthly_fee > 0 ? `Pays the club's default fee: ${formatBIF(settings.default_monthly_fee)} per month.` : 'No default fee is set yet — set one in Settings.'}
              </T>
            )}
            {feeMode === 'custom' && (
              <Field label="Monthly fee (BIF)" required style={{ marginBottom: 0 }}>
                <Input value={customFee} onChangeText={(v) => setCustomFee(v.replace(/[^\d]/g, ''))} keyboardType="number-pad" placeholder="e.g. 15000" />
              </Field>
            )}
            {feeMode === 'free' && <T v="callout">Scholarship — never shown as unpaid.</T>}
          </View>
        </Group>

        <Section title="Status">
          <SwitchRow label="Active" description="Inactive learners are not billed and are hidden from attendance." value={form.active} onChange={(v) => set('active', v)} />
          <SwitchRow label="Graduated" description="Finished the program — no longer billed." value={form.graduated} onChange={(v) => set('graduated', v)} last />
        </Section>
        {learner?.status === 'abandoned' && (
          <Banner icon={Info} tone="slate">
            {`Marked abandoned automatically (${learner.abandoned_reason || 'consecutive absences'}). It clears by itself next time this learner is marked present.`}
          </Banner>
        )}

        <Field label="Notes">
          <Input value={form.notes} onChangeText={(v) => set('notes', v)} multiline placeholder="Anything worth remembering…" />
        </Field>
      </ScrollView>
      <BottomBar>
        <Button title="Cancel" variant="secondary" onPress={() => navigation.goBack()} />
        <Button title={learnerId ? 'Save changes' : 'Add learner'} flex size="lg" onPress={submit} loading={saving} />
      </BottomBar>
    </KeyboardAvoidingView>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ marginBottom: space.xl }}>
      <T v="overline" style={{ marginBottom: 8, paddingHorizontal: 4 }}>
        {title}
      </T>
      <View style={{ backgroundColor: colors.surface, borderRadius: 18, padding: space.lg, borderWidth: 0.5, borderColor: colors.border }}>{children}</View>
    </View>
  );
}
