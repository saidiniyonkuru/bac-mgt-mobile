import { ComponentRef, ComponentType, ReactNode, Ref, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { SvgXml } from 'react-native-svg';
import { Calendar, ChevronLeft, ChevronRight, LucideProps, Search, X } from 'lucide-react-native';
import { ICON_STROKE, colors, fonts, radius, shadow, space, Tone, tones, type } from './theme';
import { haptic } from './feedback';
import { LOGO_SVG } from './logo';
import { formatDate, MONTH_NAMES, parseISODate, toISODate } from '../lib/periods';

export type IconType = ComponentType<LucideProps>;

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

type Variant = keyof typeof type;

export function T({ v = 'body', color, style, center, ...rest }: TextProps & { v?: Variant; color?: string; center?: boolean }) {
  return <Text {...rest} style={[type[v], color ? { color } : null, center && { textAlign: 'center' }, style]} />;
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dangerSoft' | 'success' | 'white';

const BTN: Record<BtnVariant, { bg: string; fg: string; border?: string; pressed: string }> = {
  primary: { bg: colors.primary, fg: '#fff', pressed: colors.primaryDark },
  secondary: { bg: colors.surface, fg: colors.text, border: colors.border, pressed: colors.surfaceMuted },
  ghost: { bg: 'transparent', fg: colors.primary, pressed: colors.primarySoft },
  danger: { bg: colors.red, fg: '#fff', pressed: '#B91C1C' },
  dangerSoft: { bg: colors.redSoft, fg: colors.red, pressed: '#FAD4D4' },
  success: { bg: colors.green, fg: '#fff', pressed: '#047857' },
  white: { bg: '#fff', fg: colors.primary, pressed: '#EEF4FF' },
};

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon: Icon,
  loading,
  disabled,
  size = 'md',
  style,
  flex,
}: {
  title: string;
  onPress?: () => void;
  variant?: BtnVariant;
  icon?: IconType;
  loading?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
  flex?: boolean;
}) {
  const v = BTN[variant];
  const h = size === 'sm' ? 38 : size === 'lg' ? 56 : 48;
  const fs = size === 'sm' ? 14 : size === 'lg' ? 17 : 16;
  return (
    <Pressable
      onPress={() => {
        haptic();
        onPress?.();
      }}
      disabled={disabled || loading}
      android_ripple={{ color: 'rgba(0,0,0,0.08)' }}
      style={({ pressed }) => [
        {
          height: h,
          paddingHorizontal: size === 'sm' ? 14 : 20,
          borderRadius: size === 'sm' ? radius.sm : radius.md,
          backgroundColor: pressed ? v.pressed : v.bg,
          borderWidth: v.border ? 1 : 0,
          borderColor: v.border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          opacity: disabled ? 0.5 : 1,
          overflow: 'hidden',
        },
        flex && { flex: 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={v.fg} /> : Icon && <Icon size={fs + 3} color={v.fg} strokeWidth={ICON_STROKE} />}
      <Text style={{ fontFamily: fonts.bold, fontSize: fs, color: v.fg }} numberOfLines={1}>
        {title}
      </Text>
    </Pressable>
  );
}

export function IconButton({ icon: Icon, onPress, color = colors.textSecondary, bg = 'transparent', size = 44, label }: { icon: IconType; onPress?: () => void; color?: string; bg?: string; size?: number; label: string }) {
  return (
    <Pressable
      accessibilityLabel={label}
      onPress={() => {
        haptic();
        onPress?.();
      }}
      hitSlop={6}
      style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? colors.slateSoft : bg })}
    >
      <Icon size={size * 0.5} color={color} strokeWidth={ICON_STROKE} />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Surfaces & lists
// ---------------------------------------------------------------------------

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const base = [styles.card, style];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable onPress={() => { haptic(); onPress(); }} android_ripple={{ color: 'rgba(0,0,0,0.05)' }} style={({ pressed }) => [base, pressed && { opacity: 0.92 }]}>
      {children}
    </Pressable>
  );
}

/** Inset-grouped section with an optional title above it. */
export function Section({ title, action, children, style }: { title?: string; action?: ReactNode; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ marginBottom: space.xl }, style]}>
      {(title || action) && (
        <View style={styles.sectionHead}>
          {title ? <T v="overline">{title}</T> : <View />}
          {action}
        </View>
      )}
      <View style={styles.group}>{children}</View>
    </View>
  );
}

/** One row of a grouped list. */
export function Row({
  title,
  subtitle,
  left,
  right,
  onPress,
  chevron,
  danger,
  last,
  titleColor,
  style,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  danger?: boolean;
  last?: boolean;
  titleColor?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const content = (
    <View style={[styles.row, !last && styles.rowDivider, style]}>
      {left}
      <View style={{ flex: 1, minWidth: 0 }}>
        {typeof title === 'string' ? (
          <T v="bodyStrong" numberOfLines={1} color={danger ? colors.red : titleColor}>
            {title}
          </T>
        ) : (
          title
        )}
        {subtitle !== undefined && subtitle !== null && (typeof subtitle === 'string' ? <T v="caption" numberOfLines={2} style={{ marginTop: 2 }}>{subtitle}</T> : subtitle)}
      </View>
      {right}
      {chevron && <ChevronRight size={20} color={colors.placeholder} strokeWidth={ICON_STROKE} />}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={() => { haptic(8); onPress(); }} android_ripple={{ color: 'rgba(0,0,0,0.06)' }} style={({ pressed }) => pressed && Platform.OS === 'ios' && { backgroundColor: colors.surfaceMuted }}>
      {content}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Badges, avatar, logo, progress
// ---------------------------------------------------------------------------

export function Badge({ label, tone = 'slate', solid, icon: Icon }: { label: string; tone?: Tone; solid?: boolean; icon?: IconType }) {
  const t = tones[tone];
  return (
    <View style={[styles.badge, { backgroundColor: solid ? t.fg : t.bg }]}>
      {Icon && <Icon size={13} color={solid ? '#fff' : t.fg} strokeWidth={2.6} />}
      <Text style={{ fontFamily: fonts.bold, fontSize: 12.5, color: solid ? '#fff' : t.fg }}>{label}</Text>
    </View>
  );
}

const AVATAR = ['#DBEAFE:#1D4ED8', '#D1FAE5:#047857', '#EDE9FE:#6D28D9', '#FEF3C7:#B45309', '#FFE4E6:#BE123C', '#CCFBF1:#0F766E', '#E0E7FF:#4338CA', '#FFEDD5:#C2410C'];

export function Avatar({ name, size = 44, alert }: { name: string; size?: number; alert?: boolean }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('') || '?';
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  const [bg, fg] = AVATAR[Math.abs(h) % AVATAR.length].split(':');
  return (
    <View>
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontFamily: fonts.bold, fontSize: size * 0.38, color: fg }}>{initials}</Text>
      </View>
      {alert && <View style={[styles.alertDot, { width: size * 0.3, height: size * 0.3, borderRadius: size * 0.15 }]} />}
    </View>
  );
}

export function Logo({ size = 40 }: { size?: number }) {
  return <SvgXml xml={LOGO_SVG} width={size} height={size} />;
}

export function ProgressBar({ value, color = colors.primary, track = colors.slateSoft, height = 8 }: { value: number; color?: string; track?: string; height?: number }) {
  return (
    <View style={{ height, borderRadius: height, backgroundColor: track, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(0, Math.min(100, value))}%`, height: '100%', borderRadius: height, backgroundColor: color }} />
    </View>
  );
}

export function IconTile({ icon: Icon, tone = 'blue', size = 40 }: { icon: IconType; tone?: Tone; size?: number }) {
  const t = tones[tone];
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon size={size * 0.52} color={t.fg} strokeWidth={ICON_STROKE} />
    </View>
  );
}

export function StatCard({ label, value, icon, tone = 'blue', hint, onPress, alert, style }: { label: string; value: string | number; icon: IconType; tone?: Tone; hint?: string; onPress?: () => void; alert?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <Card onPress={onPress} style={[{ flex: 1, padding: space.lg, minHeight: 118 }, alert && { borderColor: '#FCA5A5', backgroundColor: '#FFF7F7' }, style]}>
      <IconTile icon={icon} tone={tone} size={38} />
      <T v="number" style={{ marginTop: 10, fontSize: 22 }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </T>
      <T v="label" color={colors.textMuted} numberOfLines={1}>
        {label}
      </T>
      {hint ? <T v="caption" numberOfLines={1}>{hint}</T> : null}
    </Card>
  );
}

export function EmptyState({ icon: Icon, title, message, action }: { icon: IconType; title: string; message?: string; action?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 40, paddingHorizontal: 24 }}>
      <View style={{ width: 64, height: 64, borderRadius: 22, backgroundColor: colors.slateSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={30} color={colors.textFaint} strokeWidth={ICON_STROKE} />
      </View>
      <T v="headline" center style={{ marginTop: 14 }}>
        {title}
      </T>
      {message && <T v="callout" center style={{ marginTop: 4 }}>{message}</T>}
      {action && <View style={{ marginTop: 16 }}>{action}</View>}
    </View>
  );
}

export function Loader() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80 }}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export function Field({ label, hint, required, children, style }: { label: string; hint?: string; required?: boolean; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ marginBottom: space.lg }, style]}>
      <T v="label" style={{ marginBottom: 6 }}>
        {label}
        {required ? <Text style={{ color: colors.red }}> *</Text> : null}
      </T>
      {children}
      {hint ? <T v="caption" style={{ marginTop: 6 }}>{hint}</T> : null}
    </View>
  );
}

export function Input({ style, big, ...rest }: TextInputProps & { big?: boolean; ref?: Ref<ComponentRef<typeof TextInput>> }) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      placeholderTextColor={colors.placeholder}
      {...rest}
      onFocus={(e) => {
        setFocused(true);
        rest.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        rest.onBlur?.(e);
      }}
      style={[
        styles.input,
        big && { fontSize: 24, fontFamily: fonts.bold, height: 60 },
        rest.multiline && { height: undefined, minHeight: 88, paddingTop: 12, textAlignVertical: 'top' },
        focused && { borderColor: colors.primary, backgroundColor: '#fff' },
        style as StyleProp<TextStyle>,
      ]}
    />
  );
}

export function SearchBar({ value, onChange, placeholder = 'Search' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <View style={styles.search}>
      <Search size={20} color={colors.textFaint} strokeWidth={ICON_STROKE} />
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={colors.placeholder} style={styles.searchInput} returnKeyType="search" />
      {value ? <IconButton icon={X} label="Clear" size={34} onPress={() => onChange('')} color={colors.textFaint} /> : null}
    </View>
  );
}

/** Horizontally scrolling filter pills. */
export function Chips<V extends string>({ options, value, onChange, style }: { options: { value: V; label: string; count?: number; alert?: boolean }[]; value: V; onChange: (v: V) => void; style?: StyleProp<ViewStyle> }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: space.lg }} style={[{ marginHorizontal: -space.lg, flexGrow: 0 }, style]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              haptic(8);
              onChange(o.value);
            }}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text style={{ fontFamily: fonts.semibold, fontSize: 14.5, color: active ? '#fff' : colors.textSecondary }}>{o.label}</Text>
            {o.count !== undefined && (
              <View style={[styles.chipCount, o.alert && o.count > 0 ? { backgroundColor: colors.red } : active ? { backgroundColor: 'rgba(255,255,255,0.22)' } : null]}>
                <Text style={{ fontFamily: fonts.bold, fontSize: 12, color: active || (o.alert && o.count > 0) ? '#fff' : colors.textMuted }}>{o.count}</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** iOS/Android style segmented control. */
export function Segmented<V extends string>({ options, value, onChange, style }: { options: { value: V; label: string; count?: number }[]; value: V; onChange: (v: V) => void; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.segment, style]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              haptic(8);
              onChange(o.value);
            }}
            style={[styles.segmentItem, active && styles.segmentActive]}
          >
            <Text style={{ fontFamily: active ? fonts.bold : fonts.semibold, fontSize: 14.5, color: active ? colors.text : colors.textMuted }} numberOfLines={1}>
              {o.label}
              {o.count ? ` · ${o.count}` : ''}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Previous / next stepper with a label (months or days). */
export function Stepper({ label, onPrev, onNext, nextDisabled, onPressLabel }: { label: string; onPrev: () => void; onNext: () => void; nextDisabled?: boolean; onPressLabel?: () => void }) {
  return (
    <View style={styles.stepper}>
      <IconButton icon={ChevronLeft} label="Previous" onPress={onPrev} color={colors.text} />
      <Pressable onPress={onPressLabel} style={{ flex: 1, alignItems: 'center', paddingVertical: 8 }}>
        <T v="bodyStrong" color={colors.text}>
          {label}
        </T>
      </Pressable>
      <View style={{ opacity: nextDisabled ? 0.3 : 1 }}>
        <IconButton icon={ChevronRight} label="Next" onPress={nextDisabled ? undefined : onNext} color={colors.text} />
      </View>
    </View>
  );
}

export function MonthStepper({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  const [y, m] = value.split('-').map(Number);
  const step = (n: number) => {
    const d = new Date(y, m - 1 + n, 1);
    onChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  return <Stepper label={`${MONTH_NAMES[m - 1]} ${y}`} onPrev={() => step(-1)} onNext={() => step(1)} />;
}

/** Field that opens the native date picker. */
export function DateField({ value, onChange, maximumDate }: { value: string; onChange: (iso: string) => void; maximumDate?: Date }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={[styles.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
        <T v="bodyStrong">{formatDate(value, 'long')}</T>
        <Calendar size={20} color={colors.textFaint} strokeWidth={ICON_STROKE} />
      </Pressable>
      {open && (
        <DateTimePicker
          value={parseISODate(value)}
          mode="date"
          maximumDate={maximumDate}
          onChange={(e: DateTimePickerEvent, d?: Date) => {
            setOpen(Platform.OS === 'ios');
            if (e.type === 'set' && d) onChange(toISODate(d));
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Screen layout
// ---------------------------------------------------------------------------

/**
 * Scrollable screen with a large native-style title, pull-to-refresh, and
 * padding that clears the status bar (tab screens) or the header (pushed screens).
 */
export function Screen({
  title,
  subtitle,
  right,
  children,
  refreshing,
  onRefresh,
  noTitleInset,
  contentStyle,
}: {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  noTitleInset?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={[{ paddingHorizontal: space.lg, paddingTop: noTitleInset ? space.lg : insets.top + 12, paddingBottom: 32 }, contentStyle]}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} colors={[colors.primary]} tintColor={colors.primary} /> : undefined}
    >
      {title && <ScreenTitle title={title} subtitle={subtitle} right={right} />}
      {children}
    </ScrollView>
  );
}

export function ScreenTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: space.lg, gap: 12 }}>
      <View style={{ flex: 1 }}>
        <T v="largeTitle" numberOfLines={1} adjustsFontSizeToFit>
          {title}
        </T>
        {subtitle ? <T v="callout" style={{ marginTop: 2 }}>{subtitle}</T> : null}
      </View>
      {right}
    </View>
  );
}

/** Sticky bottom action bar for forms. */
export function BottomBar({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>{children}</View>;
}

export const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, ...shadow },
  group: { backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, ...shadow },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 8, minHeight: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: space.lg, paddingVertical: 14, minHeight: 64 },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 3.5, borderRadius: radius.pill },
  alertDot: { position: 'absolute', right: -1, top: -1, backgroundColor: colors.red, borderWidth: 2, borderColor: '#fff' },
  input: {
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 14,
    fontFamily: fonts.semibold,
    fontSize: 16.5,
    color: colors.text,
  },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 50, borderRadius: radius.md, backgroundColor: colors.surface, paddingLeft: 14, paddingRight: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, ...shadow },
  searchInput: { flex: 1, fontFamily: fonts.medium, fontSize: 16.5, color: colors.text, paddingVertical: 0 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.text, borderColor: colors.text },
  chipCount: { minWidth: 22, paddingHorizontal: 6, height: 22, borderRadius: 11, backgroundColor: colors.slateSoft, alignItems: 'center', justifyContent: 'center' },
  segment: { flexDirection: 'row', backgroundColor: '#E4E8EF', borderRadius: radius.md, padding: 4 },
  segmentItem: { flex: 1, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  segmentActive: { backgroundColor: '#fff', ...shadow },
  stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: 4, height: 52, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, ...shadow },
  bottomBar: { flexDirection: 'row', gap: 10, paddingHorizontal: space.lg, paddingTop: 12, backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
