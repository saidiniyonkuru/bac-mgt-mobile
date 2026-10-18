import { useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import Svg, { G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { colors, fonts, radius } from './theme';
import { haptic } from './feedback';
import { T } from './index';
import { compactNumber, formatBIF } from '../lib/periods';

export interface MonthTotals {
  label: string;
  income: number;
  expenses: number;
}

function niceMax(v: number) {
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const steps = [1, 2, 2.5, 5, 10];
  return (steps.find((s) => s * pow >= v) || 10) * pow;
}

/** Grouped bars: money received vs money spent per month. Tap a month for details. */
export function IncomeExpenseChart({ data, height = 210 }: { data: MonthTotals[]; height?: number }) {
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number>(data.length - 1);
  const sel = data[Math.min(selected, data.length - 1)];

  const max = niceMax(Math.max(...data.map((d) => Math.max(d.income, d.expenses)), 0));
  const padL = 38;
  const padB = 24;
  const padT = 6;
  const plotW = Math.max(0, width - padL);
  const plotH = height - padB - padT;
  const groupW = plotW / Math.max(1, data.length);
  const barW = Math.max(3, Math.min(16, (groupW - 8) / 2));
  const y = (v: number) => padT + plotH - (v / max) * plotH;
  const ticks = [0, 0.5, 1].map((t) => t * max);
  const labelEvery = data.length > 8 ? 2 : 1;

  const bar = (x: number, v: number, color: string) => {
    const h = Math.max(0, (v / max) * plotH);
    if (h < 0.5) return null;
    const r = Math.min(4, h, barW / 2);
    const top = padT + plotH - h;
    return <Path d={`M${x},${padT + plotH} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${padT + plotH} Z`} fill={color} />;
  };

  const net = sel ? sel.income - sel.expenses : 0;

  return (
    <View>
      {sel && (
        <View style={styles.summary}>
          <View style={{ flex: 1 }}>
            <T v="overline">{sel.label}</T>
            <View style={styles.legendRow}>
              <View style={[styles.swatch, { backgroundColor: colors.income }]} />
              <T v="caption" style={{ flex: 1 }}>Income</T>
              <T v="label" color={colors.text}>{formatBIF(sel.income)}</T>
            </View>
            <View style={styles.legendRow}>
              <View style={[styles.swatch, { backgroundColor: colors.expense }]} />
              <T v="caption" style={{ flex: 1 }}>Expenses</T>
              <T v="label" color={colors.text}>{formatBIF(sel.expenses)}</T>
            </View>
          </View>
          <View style={styles.netBox}>
            <T v="caption">Net</T>
            <T v="bodyStrong" color={net < 0 ? colors.red : colors.green} numberOfLines={1} adjustsFontSizeToFit>
              {formatBIF(net)}
            </T>
          </View>
        </View>
      )}
      <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} style={{ height }}>
        {width > 0 && (
          <Svg width={width} height={height}>
            {ticks.map((t) => (
              <G key={t}>
                <Line x1={padL} x2={width} y1={y(t)} y2={y(t)} stroke={colors.border} strokeDasharray={t === 0 ? undefined : '3 4'} />
                <SvgText x={padL - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill={colors.textFaint} fontFamily={fonts.medium}>
                  {compactNumber(t)}
                </SvgText>
              </G>
            ))}
            {data.map((d, i) => {
              const gx = padL + i * groupW;
              const x1 = gx + groupW / 2 - barW - 1;
              const x2 = gx + groupW / 2 + 1;
              const isSel = i === selected;
              return (
                <G key={d.label + i} opacity={isSel ? 1 : 0.5}>
                  {isSel && <Rect x={gx + 2} y={padT} width={groupW - 4} height={plotH} rx={8} fill={colors.slateSoft} />}
                  {bar(x1, d.income, colors.income)}
                  {bar(x2, d.expenses, colors.expense)}
                  {(i % labelEvery === (data.length - 1) % labelEvery || isSel) && (
                    <SvgText x={gx + groupW / 2} y={height - 6} textAnchor="middle" fontSize={11} fill={isSel ? colors.text : colors.textFaint} fontFamily={isSel ? fonts.bold : fonts.medium}>
                      {d.label.split(' ')[0]}
                    </SvgText>
                  )}
                </G>
              );
            })}
          </Svg>
        )}
        {/* touch targets per month */}
        <View style={[StyleSheet.absoluteFill, { flexDirection: 'row', paddingLeft: padL }]}>
          {data.map((d, i) => (
            <Pressable
              key={d.label + i}
              accessibilityLabel={`${d.label}: income ${formatBIF(d.income)}, expenses ${formatBIF(d.expenses)}`}
              style={{ flex: 1 }}
              onPress={() => {
                haptic(6);
                setSelected(i);
              }}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 12 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  netBox: { minWidth: 110, maxWidth: 150, padding: 10, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, alignItems: 'flex-end' },
});
