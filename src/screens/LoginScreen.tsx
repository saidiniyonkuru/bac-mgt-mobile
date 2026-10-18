import { ComponentRef, useRef, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CalendarCheck, Eye, EyeOff, ShieldCheck, Wallet } from 'lucide-react-native';
import { supabase } from '../lib/supabase';
import { APP_NAME } from '../lib/app';
import { Button, Field, IconButton, Input, Logo, T } from '../ui';
import { Gradient } from '../ui/kit';
import { colors, ICON_STROKE, radius, space } from '../ui/theme';
import { haptic } from '../ui/feedback';

const FEATURES = [
  { icon: Wallet, text: 'Know who has paid this month' },
  { icon: CalendarCheck, text: 'Spot learners who stopped coming' },
  { icon: ShieldCheck, text: 'Every receipt recorded, synced live' },
];

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const passwordRef = useRef<ComponentRef<typeof TextInput>>(null);

  const signIn = async () => {
    if (!email.trim() || !password) return setError('Enter your email and password.');
    setLoading(true);
    setError('');
    try {
      const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (err) {
        haptic(40);
        setError(err.message === 'Invalid login credentials' ? 'Wrong email or password.' : err.message);
      }
    } catch {
      setError('Could not reach the server. Check your internet connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior="padding">
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>
        <Gradient style={[styles.hero, { paddingTop: insets.top + 36 }]}>
          <View style={styles.logoWrap}>
            <Logo size={76} />
          </View>
          <T v="largeTitle" color="#fff" center style={{ marginTop: 18, letterSpacing: 1 }}>
            {APP_NAME}
          </T>
          <T v="callout" color="#C7D7FE" center style={{ marginTop: 4 }}>
            Run your club from your phone
          </T>
          <View style={{ marginTop: 24, gap: 10 }}>
            {FEATURES.map(({ icon: Icon, text }) => (
              <View key={text} style={styles.feature}>
                <View style={styles.featureIcon}>
                  <Icon size={17} color="#fff" strokeWidth={ICON_STROKE} />
                </View>
                <T v="label" color="#EEF2FF">
                  {text}
                </T>
              </View>
            ))}
          </View>
        </Gradient>

        <View style={[styles.card, { paddingBottom: Math.max(insets.bottom, 24) }]}>
          <T v="title">Sign in</T>
          <T v="callout" style={{ marginTop: 2, marginBottom: space.xl }}>
            Use the account your administrator gave you.
          </T>

          <Field label="Email">
            <Input
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
          </Field>
          <Field label="Password">
            <View>
              <Input
                ref={passwordRef}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!show}
                autoCapitalize="none"
                autoComplete="password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={signIn}
                style={{ paddingRight: 52 }}
              />
              <View style={styles.eye}>
                <IconButton icon={show ? EyeOff : Eye} label={show ? 'Hide password' : 'Show password'} onPress={() => setShow(!show)} color={colors.textFaint} />
              </View>
            </View>
          </Field>

          {error ? (
            <View style={styles.error}>
              <T v="label" color={colors.red}>
                {error}
              </T>
            </View>
          ) : null}

          <Button title="Sign in" size="lg" onPress={signIn} loading={loading} style={{ marginTop: 4 }} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  hero: { paddingHorizontal: space.xl, paddingBottom: 56, alignItems: 'center' },
  logoWrap: { borderRadius: 24, padding: 4, backgroundColor: 'rgba(255,255,255,0.15)' },
  feature: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  featureIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  card: { flex: 1, marginTop: -28, backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: space.xl, paddingTop: space.xxl },
  eye: { position: 'absolute', right: 4, top: 4 },
  error: { backgroundColor: colors.redSoft, borderRadius: radius.md, padding: 12, marginBottom: space.lg },
});
