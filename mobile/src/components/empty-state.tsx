import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme/colors';

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
};

export function EmptyState({ icon, title, body }: Props) {
  return (
    <View style={{ alignItems: 'center', gap: 10, padding: 26 }}>
      <Ionicons name={icon} size={42} color={colors.muted} />
      <Text style={{ color: colors.text, fontSize: 19, fontWeight: '800', textAlign: 'center' }}>{title}</Text>
      <Text selectable style={{ color: colors.muted, textAlign: 'center', lineHeight: 21 }}>{body}</Text>
    </View>
  );
}
