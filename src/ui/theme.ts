import { Platform, TextStyle, ViewStyle } from 'react-native';

export const colors = {
  bg: '#F2F4F8',
  surface: '#FFFFFF',
  surfaceMuted: '#F8FAFC',
  border: '#E2E8F0',
  borderStrong: '#CBD5E1',

  text: '#0F172A',
  textSecondary: '#334155',
  textMuted: '#475569',
  textFaint: '#64748B',
  placeholder: '#94A3B8',

  primary: '#1D5BEA',
  primaryDark: '#1440B8',
  primarySoft: '#E8F0FE',
  cyan: '#22D3EE',

  green: '#059669',
  greenSoft: '#E7F8F0',
  red: '#DC2626',
  redSoft: '#FDECEC',
  amber: '#D97706',
  amberSoft: '#FEF4E2',
  violet: '#7C3AED',
  violetSoft: '#F1EBFE',
  teal: '#0D9488',
  tealSoft: '#E3F6F4',
  slateSoft: '#EEF2F6',

  // chart series (colour-blind safe pair, validated)
  income: '#2A78D6',
  expense: '#EB6834',
};

export type Tone = 'blue' | 'green' | 'red' | 'amber' | 'violet' | 'teal' | 'slate';

export const tones: Record<Tone, { fg: string; bg: string }> = {
  blue: { fg: colors.primary, bg: colors.primarySoft },
  green: { fg: colors.green, bg: colors.greenSoft },
  red: { fg: colors.red, bg: colors.redSoft },
  amber: { fg: colors.amber, bg: colors.amberSoft },
  violet: { fg: colors.violet, bg: colors.violetSoft },
  teal: { fg: colors.teal, bg: colors.tealSoft },
  slate: { fg: colors.textMuted, bg: colors.slateSoft },
};

/** Inter font files bundled in android/app/src/main/assets/fonts */
export const fonts = {
  regular: 'Inter-Regular',
  medium: 'Inter-Medium',
  semibold: 'Inter-SemiBold',
  bold: 'Inter-Bold',
  extrabold: 'Inter-ExtraBold',
};

export const radius = { sm: 10, md: 14, lg: 18, xl: 24, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 };

/** Big, bold, high-contrast type scale for phones. */
export const type: Record<string, TextStyle> = {
  largeTitle: { fontFamily: fonts.extrabold, fontSize: 32, lineHeight: 38, letterSpacing: -0.6, color: colors.text },
  title: { fontFamily: fonts.bold, fontSize: 22, lineHeight: 28, letterSpacing: -0.3, color: colors.text },
  headline: { fontFamily: fonts.bold, fontSize: 18, lineHeight: 24, color: colors.text },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, color: colors.text },
  body: { fontFamily: fonts.medium, fontSize: 16, lineHeight: 22, color: colors.textSecondary },
  callout: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 20, color: colors.textMuted },
  caption: { fontFamily: fonts.medium, fontSize: 13.5, lineHeight: 18, color: colors.textMuted },
  label: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 18, color: colors.textSecondary },
  overline: { fontFamily: fonts.bold, fontSize: 12.5, lineHeight: 16, letterSpacing: 0.8, color: colors.textFaint, textTransform: 'uppercase' },
  number: { fontFamily: fonts.extrabold, fontSize: 24, lineHeight: 30, letterSpacing: -0.4, color: colors.text, fontVariant: ['tabular-nums'] },
};

export const shadow: ViewStyle = Platform.select({
  android: { elevation: 1.5 },
  default: { shadowColor: '#0F172A', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
}) as ViewStyle;

export const shadowStrong: ViewStyle = Platform.select({
  android: { elevation: 6 },
  default: { shadowColor: '#0F172A', shadowOpacity: 0.16, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
}) as ViewStyle;

export const ICON_STROKE = 2.3;
