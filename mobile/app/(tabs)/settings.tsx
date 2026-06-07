import Constants from 'expo-constants';
import { ScrollView, Text } from 'react-native';
import { Card } from '@/components/card';
import { colors } from '@/theme/colors';

export default function SettingsScreen() {
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 18, gap: 16 }}>
      <Card>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800' }}>Privacy posture</Text>
        <Text selectable style={{ color: colors.muted, lineHeight: 21 }}>
          This Android build stores imported files and review records locally on the device. It does not send OCR input to a cloud service.
        </Text>
      </Card>

      <Card>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800' }}>OCR status</Text>
        <Text selectable style={{ color: colors.muted, lineHeight: 21 }}>
          The first mobile release uses a degraded manual-review adapter. A native Android OCR module can be added later without changing the review contract.
        </Text>
      </Card>

      <Card>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800' }}>Build</Text>
        <Text selectable style={{ color: colors.muted }}>App version: {Constants.expoConfig?.version || '1.4.0'}</Text>
        <Text selectable style={{ color: colors.muted }}>Package: {Constants.expoConfig?.android?.package || 'com.staffpass.ocrhub.mobile'}</Text>
      </Card>
    </ScrollView>
  );
}
