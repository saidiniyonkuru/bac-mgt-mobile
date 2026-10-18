import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, View } from 'react-native';
import { useHeaderHeight } from '@react-navigation/elements';
import { Building2, CalendarX, Minus, Plus, RefreshCw, Smartphone, Wallet } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { useApp } from '../lib/app';
import { notifyDataChanged } from '../lib/realtime';
import { errorMessage } from '../lib/db';
import { formatBIF } from '../lib/periods';
import { BottomBar, Button, Card, Field, IconButton, Input, T } from '../ui';
import { CardHeader } from '../ui/kit';
import { colors, radius, space } from '../ui/theme';
import { toast, toastError } from '../ui/feedback';

export default function SettingsScreen() {
  const { settings, user } = useApp();
  const headerHeight = useHeaderHeight();
  const [clubName, setClubName] = useState(settings.club_name);
  const [fee, setFee] = useState(settings.default_monthly_fee ? String(settings.default_monthly_fee) : '');
  const [weeks, setWeeks] = useState(settings.absence_warning_weeks);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setClubName(settings.club_name);
    setFee(settings.default_monthly_fee ? String(settings.default_monthly_fee) : '');
    setWeeks(settings.absence_warning_weeks);
  }, [settings]);

  const save = async () => {
    if (!(weeks >= 1 && weeks <= 12)) return toastError('Warning threshold must be between 1 and 12 weeks');
    setSaving(true);
    const { data, error } = await supabase
      .from('app_settings')
      .update({
        club_name: clubName.trim() || 'English Learners Club',
        default_monthly_fee: parseFloat(fee) || 0,
        absence_warning_weeks: weeks,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1)
      .select('id');
    setSaving(false);
    if (error) return toastError(errorMessage(error));
    if (!data?.length) return toastError('Settings table is missing — run the latest database migration in Supabase.');
    toast('Settings saved for everyone');
    notifyDataChanged();
  };

  const feeNum = parseFloat(fee) || 0;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior="padding" keyboardVerticalOffset={headerHeight}>
      <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
        <T v="callout" style={{ marginBottom: space.lg }}>
          Shared by every team member, on web and mobile.
        </T>

        <Card style={{ marginBottom: space.lg }}>
          <CardHeader title="Club" icon={Building2} tone="blue" />
          <View style={{ paddingHorizontal: space.lg }}>
            <Field label="Club name" hint="Shown in the menu and on receipts.">
              <Input value={clubName} onChangeText={setClubName} autoCapitalize="words" />
            </Field>
          </View>
        </Card>

        <Card style={{ marginBottom: space.lg }}>
          <CardHeader title="Payments" subtitle="Used to calculate what each learner owes" icon={Wallet} tone="green" />
          <View style={{ paddingHorizontal: space.lg }}>
            <Field label="Default monthly fee (BIF)" hint="Applies to every learner without a custom fee. You can set a custom fee or mark a learner free on their profile.">
              <Input big value={fee} onChangeText={(v) => setFee(v.replace(/[^\d]/g, ''))} keyboardType="number-pad" placeholder="e.g. 20000" />
            </Field>
            {feeNum > 0 && (
              <T v="callout" style={{ marginTop: -8, marginBottom: space.lg }}>
                Each learner owes {formatBIF(feeNum)} per month from the month they enrolled.
              </T>
            )}
          </View>
        </Card>

        <Card style={{ marginBottom: space.lg }}>
          <CardHeader title="Absence warnings" icon={CalendarX} tone="amber" />
          <View style={{ paddingHorizontal: space.lg }}>
            <Field label="Warn after" hint="A learner is added to the warning list after missing class this many weeks in a row without a reason (sick, school, job…).">
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 56, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surfaceMuted, paddingHorizontal: 4 }}>
                <IconButton icon={Minus} label="Fewer weeks" onPress={() => setWeeks((w) => Math.max(1, w - 1))} color={colors.text} />
                <T v="headline">
                  {weeks} week{weeks === 1 ? '' : 's'}
                </T>
                <IconButton icon={Plus} label="More weeks" onPress={() => setWeeks((w) => Math.min(12, w + 1))} color={colors.text} />
              </View>
            </Field>
          </View>
        </Card>

        <Card>
          <CardHeader title="This device" icon={Smartphone} tone="slate" />
          <View style={{ paddingHorizontal: space.lg, paddingBottom: space.lg, gap: 10 }}>
            <T v="callout">
              Signed in as <T v="bodyStrong" style={{ fontSize: 15 }}>{user?.email}</T>
            </T>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <RefreshCw size={17} color={colors.primary} style={{ marginTop: 2 }} />
              <T v="callout" style={{ flex: 1 }}>
                Everything syncs live: changes made on any phone or computer appear everywhere within a second.
              </T>
            </View>
          </View>
        </Card>
      </ScrollView>
      <BottomBar>
        <Button title="Save settings" size="lg" flex onPress={save} loading={saving} />
      </BottomBar>
    </KeyboardAvoidingView>
  );
}
