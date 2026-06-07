import { Text, TextInput, type KeyboardTypeOptions } from 'react-native';
import { colors } from '@/theme/colors';

type Props = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: KeyboardTypeOptions;
};

export function Field({ label, value, onChangeText, placeholder, keyboardType = 'default' }: Props) {
  return (
    <>
      <Text style={{ color: colors.muted, fontWeight: '700' }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        keyboardType={keyboardType}
        style={{
          color: colors.text,
          backgroundColor: colors.input,
          borderColor: colors.border,
          borderWidth: 1,
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: 11,
          fontSize: 16
        }}
      />
    </>
  );
}
