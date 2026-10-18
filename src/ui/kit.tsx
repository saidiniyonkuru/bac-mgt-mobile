import { ReactNode, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleProp, StyleSheet, Switch, Text, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Check, ChevronRight } from 'lucide-react-native';
import { ICON_STROKE, colors, fonts, radius, shadowStrong, space, Tone, tones } from './theme';
import { haptic } from './feedback';
import { IconType, T } from './index';

// ---------------------------------------------------------------------------
// Gradient surface (hero cards, profile header)
// ---------------------------------------------------------------------------

let gradientId = 0;

export function Gradient({
  from = '#2563EB',
  to = '#3730A3',
  style,
  children,
}: {
  from?: string;
  to?: string;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const [id] = useState(() => `g${++gradientId}`);
  return (
    <View style={[{ overflow: 'hidden' }, style]}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={from} />
            <Stop offset="1" stopColor={to} />
          </LinearGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
      {/* soft decorative circles, like the web hero */}
      <View pointerEvents="none" style={[styles.bubble, { width: 180, height: 180, right: -50, top: -70 }]} />
      <View pointerEvents="none" style={[styles.bubble, { width: 130, height: 130, right: 40, bottom: -70, backgroundColor: 'rgba(103,232,249,0.10)' }]} />
      {children}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Floating action button
// ---------------------------------------------------------------------------

export function Fab({ icon: Icon, label, onPress }: { icon: IconType; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel={label}
      onPress={() => {
        haptic();
        onPress();
      }}
      android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
      style={({ pressed }) => [styles.fab, pressed && { backgroundColor: colors.primaryDark }]}
    >
      <Icon size={22} color="#fff" strokeWidth={2.6} />
      <Text style={styles.fabText}>{label}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Callout banner
// ---------------------------------------------------------------------------

export function Banner({
  icon: Icon,
  tone = 'amber',
  children,
  onPress,
  action,
  style,
}: {
  icon: IconType;
  tone?: Tone;
  children: ReactNode;
  onPress?: () => void;
  action?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const t = tones[tone];
  const body = (
    <View style={[styles.banner, { backgroundColor: t.bg, borderColor: t.fg + '33' }, style]}>
      <View style={[styles.bannerIcon, { backgroundColor: t.fg }]}>
        <Icon size={18} color="#fff" strokeWidth={ICON_STROKE} />
      </View>
      <View style={{ flex: 1 }}>{typeof children === 'string' ? <T v="callout" color={colors.text}>{children}</T> : children}</View>
      {action}
      {onPress && <ChevronRight size={20} color={t.fg} strokeWidth={ICON_STROKE} />}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={() => { haptic(8); onPress(); }} style={({ pressed }) => pressed && { opacity: 0.85 }}>
      {body}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Selectable pills that wrap (methods, categories, reasons)
// ---------------------------------------------------------------------------

export function Pill({ label, active, onPress, tone = 'blue', dashed }: { label: string; active?: boolean; onPress: () => void; tone?: Tone; dashed?: boolean }) {
  const fg = tones[tone].fg;
  return (
    <Pressable
      onPress={() => {
        haptic(8);
        onPress();
      }}
      style={[styles.pill, active && { backgroundColor: fg, borderColor: fg }, dashed && !active && { borderStyle: 'dashed', borderColor: colors.borderStrong }]}
    >
      {active && <Check size={15} color="#fff" strokeWidth={3} />}
      <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: active ? '#fff' : colors.textSecondary }}>{label}</Text>
    </Pressable>
  );
}

export function PillGroup({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, style]}>{children}</View>;
}

// ---------------------------------------------------------------------------
// Switch row
// ---------------------------------------------------------------------------

export function SwitchRow({ label, description, value, onChange, last }: { label: string; description?: string; value: boolean; onChange: (v: boolean) => void; last?: boolean }) {
  return (
    <Pressable onPress={() => { haptic(8); onChange(!value); }} style={[styles.switchRow, !last && styles.divider]}>
      <View style={{ flex: 1 }}>
        <T v="bodyStrong">{label}</T>
        {description ? <T v="caption" style={{ marginTop: 2 }}>{description}</T> : null}
      </View>
      <Switch value={value} onValueChange={(v) => { haptic(8); onChange(v); }} trackColor={{ true: colors.primary, false: colors.borderStrong }} thumbColor="#fff" />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Key / value line used in details & receipts
// ---------------------------------------------------------------------------

export function InfoLine({ label, value, icon: Icon, last, valueColor }: { label: string; value?: ReactNode; icon?: IconType; last?: boolean; valueColor?: string }) {
  return (
    <View style={[styles.infoLine, !last && styles.divider]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {Icon && <Icon size={17} color={colors.textFaint} strokeWidth={ICON_STROKE} />}
        <T v="callout">{label}</T>
      </View>
      <View style={{ flexShrink: 1, alignItems: 'flex-end' }}>
        {typeof value === 'string' || typeof value === 'number' || value === undefined || value === null ? (
          <T v="bodyStrong" color={valueColor} style={{ textAlign: 'right' }}>
            {value === undefined || value === null || value === '' ? '—' : value}
          </T>
        ) : (
          value
        )}
      </View>
    </View>
  );
}

/** Small tinted metric tile (profile KPIs, attendance tallies). */
export function Metric({ label, value, hint, color, tone, style }: { label: string; value: string | number; hint?: string; color?: string; tone?: Tone; style?: StyleProp<ViewStyle> }) {
  const t = tone ? tones[tone] : null;
  return (
    <View style={[styles.metric, t && { backgroundColor: t.bg, borderColor: 'transparent' }, style]}>
      <T v="caption" color={t?.fg} numberOfLines={1}>
        {label}
      </T>
      <T v="headline" color={color || t?.fg} style={{ marginTop: 2, fontVariant: ['tabular-nums'] }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </T>
      {hint ? <T v="caption" numberOfLines={1} style={{ fontSize: 12 }}>{hint}</T> : null}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Bottom sheet
// ---------------------------------------------------------------------------

export function Sheet({ visible, onClose, title, subtitle, children, footer }: { visible: boolean; onClose: () => void; title?: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(15,23,42,0.45)' }]} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.grabber} />
          {(title || subtitle) && (
            <View style={{ paddingHorizontal: space.xl, paddingBottom: space.md }}>
              {title && <T v="title">{title}</T>}
              {subtitle && <T v="callout" style={{ marginTop: 2 }}>{subtitle}</T>}
            </View>
          )}
          <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ paddingHorizontal: space.xl, paddingBottom: space.sm }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          {footer && <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: space.xl, paddingTop: space.md }}>{footer}</View>}
        </View>
      </View>
    </Modal>
  );
}

/** Sheet with a list of options; tapping one selects it and closes. */
export function OptionSheet<V extends string>({
  visible,
  onClose,
  title,
  options,
  value,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  options: { value: V; label: string; description?: string; icon?: IconType; danger?: boolean }[];
  value?: V;
  onSelect: (v: V) => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      {options.map((o) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              haptic(8);
              onSelect(o.value);
              onClose();
            }}
            style={({ pressed }) => [styles.option, active && { backgroundColor: colors.primarySoft }, pressed && !active && { backgroundColor: colors.slateSoft }]}
          >
            {Icon && (
              <View style={[styles.optionIcon, o.danger && { backgroundColor: colors.redSoft }]}>
                <Icon size={20} color={o.danger ? colors.red : colors.textSecondary} strokeWidth={ICON_STROKE} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <T v="bodyStrong" color={o.danger ? colors.red : active ? colors.primary : undefined}>
                {o.label}
              </T>
              {o.description ? <T v="caption">{o.description}</T> : null}
            </View>
            {active && <Check size={20} color={colors.primary} strokeWidth={2.8} />}
          </Pressable>
        );
      })}
    </Sheet>
  );
}

/** Tappable field that opens an OptionSheet (replacement for <select>). */
export function SelectField<V extends string>({ value, options, onChange, title, placeholder = 'Choose…' }: { value: V; options: { value: V; label: string }[]; onChange: (v: V) => void; title: string; placeholder?: string }) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={styles.select}>
        <T v="bodyStrong" color={current ? colors.text : colors.placeholder} numberOfLines={1} style={{ flex: 1 }}>
          {current?.label || placeholder}
        </T>
        <ChevronRight size={20} color={colors.textFaint} strokeWidth={ICON_STROKE} style={{ transform: [{ rotate: '90deg' }] }} />
      </Pressable>
      <OptionSheet visible={open} onClose={() => setOpen(false)} title={title} options={options} value={value} onSelect={onChange} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Card header used inside Cards
// ---------------------------------------------------------------------------

export function CardHeader({ title, subtitle, icon: Icon, tone = 'blue', right }: { title: string; subtitle?: string; icon?: IconType; tone?: Tone; right?: ReactNode }) {
  const t = tones[tone];
  return (
    <View style={styles.cardHeader}>
      {Icon && (
        <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={19} color={t.fg} strokeWidth={ICON_STROKE} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <T v="headline" numberOfLines={1}>
          {title}
        </T>
        {subtitle ? <T v="caption" numberOfLines={1}>{subtitle}</T> : null}
      </View>
      {right}
    </View>
  );
}

/** "Show more" paging for long lists inside a ScrollView. */
export function useIncremental<T>(items: T[], step = 40, resetKey?: unknown) {
  const [count, setCount] = useState(step);
  useEffect(() => setCount(step), [resetKey, step]);
  return { visible: items.slice(0, count), hasMore: items.length > count, more: () => setCount((c) => c + step), remaining: Math.max(0, items.length - count) };
}

export function ShowMore({ remaining, onPress }: { remaining: number; onPress: () => void }) {
  if (remaining <= 0) return null;
  return (
    <Pressable onPress={() => { haptic(8); onPress(); }} style={({ pressed }) => [styles.showMore, pressed && { backgroundColor: colors.surfaceMuted }]}>
      <T v="bodyStrong" color={colors.primary}>
        Show {Math.min(remaining, 40)} more
      </T>
      <T v="caption">· {remaining} left</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bubble: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.10)' },
  fab: {
    position: 'absolute',
    right: space.lg,
    bottom: space.lg,
    height: 56,
    paddingHorizontal: 20,
    borderRadius: 18,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    overflow: 'hidden',
    ...shadowStrong,
  },
  fabText: { fontFamily: fonts.bold, fontSize: 16, color: '#fff' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.lg, borderWidth: 1, marginBottom: space.lg },
  bannerIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 42, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.border },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: space.lg, paddingVertical: 14 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  infoLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingHorizontal: space.lg, paddingVertical: 14, minHeight: 52 },
  metric: { flex: 1, padding: 12, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 10 },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.borderStrong, marginBottom: 14 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 14, borderRadius: radius.md, marginBottom: 2 },
  optionIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.slateSoft, alignItems: 'center', justifyContent: 'center' },
  select: { height: 52, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surfaceMuted, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.md },
  showMore: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
});
