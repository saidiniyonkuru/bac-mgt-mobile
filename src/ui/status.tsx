import { View } from 'react-native';
import { Check, Minus, X } from 'lucide-react-native';
import { LedgerMonth, MonthState } from '../lib/paymentStatus';
import { colors, Tone } from './theme';
import { Badge } from './index';

export const MONTH_STATE: Record<MonthState, { label: string; tone: Tone; color: string }> = {
  paid: { label: 'Paid', tone: 'green', color: '#10B981' },
  partial: { label: 'Partial', tone: 'amber', color: '#F59E0B' },
  unpaid: { label: 'Unpaid', tone: 'red', color: '#EF4444' },
  waived: { label: 'Free', tone: 'slate', color: '#CBD5E1' },
};

export function MonthStateBadge({ state, noRecord }: { state: MonthState; noRecord?: boolean }) {
  const meta = MONTH_STATE[state];
  return <Badge tone={meta.tone} label={state === 'unpaid' && noRecord ? 'Not paid' : meta.label} />;
}

export const LEARNER_STATUS: Record<string, { label: string; tone: Tone }> = {
  active: { label: 'Active', tone: 'green' },
  abandoned: { label: 'Abandoned', tone: 'slate' },
  graduated: { label: 'Graduated', tone: 'blue' },
};

export const LEVEL_TONE: Record<string, Tone> = {
  Beginner: 'teal',
  Intermediate: 'violet',
  Advanced: 'blue',
};

/**
 * Compact strip of the most recent months (oldest → newest). Each cell has an
 * icon as well as a colour so states never rely on colour alone.
 */
export function MonthStrip({ months, count = 6, size = 26 }: { months: LedgerMonth[]; count?: number; size?: number }) {
  const recent = months.filter((m) => !m.isAdvance).slice(0, count).reverse();
  const icon = Math.round(size * 0.55);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      {Array.from({ length: Math.max(0, count - recent.length) }).map((_, i) => (
        <View key={`e${i}`} style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: colors.slateSoft }} />
      ))}
      {recent.map((m) => {
        const Icon = m.state === 'paid' ? Check : m.state === 'unpaid' ? X : Minus;
        return (
          <View
            key={m.key}
            style={{
              width: size,
              height: size,
              borderRadius: size * 0.28,
              backgroundColor: MONTH_STATE[m.state].color,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: m.isCurrent ? 2 : 0,
              borderColor: colors.text,
            }}
          >
            <Icon size={icon} color="#fff" strokeWidth={3.2} />
          </View>
        );
      })}
    </View>
  );
}
