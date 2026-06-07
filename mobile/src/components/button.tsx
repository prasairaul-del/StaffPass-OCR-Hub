import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';

type ButtonVariant = 'primary' | 'secondary' | 'danger';

const variantColors: Record<ButtonVariant, { background: string; border: string; text: string }> = {
  primary: { background: colors.accent, border: colors.accent, text: '#082f49' },
  secondary: { background: colors.panel, border: colors.border, text: colors.text },
  danger: { background: colors.danger, border: colors.danger, text: '#fee2e2' }
};

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void | Promise<void>;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
};

export function Button({ icon, label, onPress, variant = 'primary', disabled = false, loading = false }: Props) {
  const palette = variantColors[variant];
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 52,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        borderRadius: 15,
        borderWidth: 1,
        borderColor: palette.border,
        backgroundColor: disabled ? colors.disabled : palette.background,
        opacity: pressed ? 0.82 : 1,
        paddingHorizontal: 16,
        paddingVertical: 13
      })}
    >
      {loading ? <ActivityIndicator color={palette.text} /> : <Ionicons name={icon} size={20} color={palette.text} />}
      <Text style={{ color: palette.text, fontWeight: '800', fontSize: 16 }}>{label}</Text>
    </Pressable>
  );
}
