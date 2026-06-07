import { Pressable, View, type ViewStyle } from 'react-native';
import { colors } from '@/theme/colors';

type Props = {
  children: React.ReactNode;
  pressable?: boolean;
  tone?: 'default' | 'warning' | 'danger';
};

const toneStyles: Record<NonNullable<Props['tone']>, ViewStyle> = {
  default: { backgroundColor: colors.card, borderColor: colors.border },
  warning: { backgroundColor: '#422006', borderColor: '#a16207' },
  danger: { backgroundColor: '#450a0a', borderColor: '#991b1b' }
};

export function Card({ children, pressable = false, tone = 'default' }: Props) {
  const baseStyle: ViewStyle = {
    gap: 14,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    ...toneStyles[tone]
  };

  if (pressable) {
    return (
      <Pressable style={({ pressed }) => ({ ...baseStyle, opacity: pressed ? 0.84 : 1 })}>
        {children}
      </Pressable>
    );
  }

  return <View style={baseStyle}>{children}</View>;
}
