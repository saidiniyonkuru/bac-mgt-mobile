import { View } from 'react-native';
import { BarChart3, History, LogOut, Receipt, Settings as SettingsIcon, UserPlus, Wallet } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { APP_NAME, useApp } from '../lib/app';
import { formatBIF } from '../lib/periods';
import { useNav } from '../navigation/types';
import { Avatar, IconTile, Logo, Row, Screen, Section, T } from '../ui';
import { colors, space } from '../ui/theme';
import { confirm } from '../ui/feedback';

export default function MoreScreen() {
  const { user, settings } = useApp();
  const { nav, recordPayment, editLearner } = useNav();
  const email = user?.email || '';

  const signOut = async () => {
    if (await confirm('Sign out?', 'You will need your email and password to sign in again.', 'Sign out', true)) {
      await supabase.auth.signOut();
    }
  };

  return (
    <Screen title="More">
      <Section>
        <Row
          left={<Avatar name={email || 'User'} size={52} />}
          title={<T v="headline" numberOfLines={1}>{email.split('@')[0] || 'Signed in'}</T>}
          subtitle={email}
          last
        />
      </Section>

      <Section title="Finance">
        <Row left={<IconTile icon={History} tone="blue" />} title="Payment History" subtitle="Every learner’s payments since enrollment" chevron onPress={() => nav.navigate('History')} />
        <Row left={<IconTile icon={Receipt} tone="amber" />} title="Expenses" subtitle="Spending, categories & recurring costs" chevron onPress={() => nav.navigate('Expenses')} />
        <Row left={<IconTile icon={BarChart3} tone="violet" />} title="Reports" subtitle="Income vs expenses, exports" chevron onPress={() => nav.navigate('Reports')} last />
      </Section>

      <Section title="Quick add">
        <Row left={<IconTile icon={Wallet} tone="green" />} title="Record payment" chevron onPress={() => recordPayment({})} />
        <Row left={<IconTile icon={UserPlus} tone="teal" />} title="New learner" chevron onPress={() => editLearner(null)} last />
      </Section>

      <Section title="Club">
        <Row
          left={<IconTile icon={SettingsIcon} tone="slate" />}
          title="Settings"
          subtitle={`${settings.club_name} · ${settings.default_monthly_fee > 0 ? `${formatBIF(settings.default_monthly_fee)}/month` : 'no fee set'}`}
          chevron
          onPress={() => nav.navigate('Settings')}
          last
        />
      </Section>

      <Section>
        <Row left={<IconTile icon={LogOut} tone="red" />} title="Sign out" danger onPress={signOut} last />
      </Section>

      <View style={{ alignItems: 'center', gap: 6, marginTop: space.md }}>
        <Logo size={36} />
        <T v="caption" color={colors.textFaint}>
          {APP_NAME} · {settings.club_name}
        </T>
        <T v="caption" color={colors.placeholder} style={{ fontSize: 12 }}>
          Version 1.0 · synced live with the web app
        </T>
      </View>
    </Screen>
  );
}
