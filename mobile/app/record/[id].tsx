import { useLocalSearchParams } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { useAppState } from '@/state/app-context';
import { colors } from '@/theme/colors';

export default function RecordDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { records } = useAppState();
  const record = records.find((item) => String(item.id) === id);

  if (!record) {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 18 }}>
        <EmptyState icon="alert-circle-outline" title="Record unavailable" body="Refresh records and try again." />
      </ScrollView>
    );
  }

  const rows = [
    ['Name', `${record.firstName} ${record.lastName}`],
    ['Phone', record.phoneNumber || ''],
    ['Document type', record.docType],
    ['Document number', record.docNumber],
    ['Expiry date', record.expiryDate || ''],
    ['Confidence', `${record.confidenceScore}%`],
    ['Review status', record.reviewStatus],
    ['Engine', record.engine],
    ['Notes', record.notes || '']
  ];

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 18, gap: 16 }}>
      <Card>
        {rows.map(([label, value]) => (
          <View key={label} style={{ gap: 4 }}>
            <Text style={{ color: colors.muted, fontWeight: '700' }}>{label}</Text>
            <Text selectable style={{ color: colors.text, fontSize: 16 }}>{value || 'Not provided'}</Text>
          </View>
        ))}
      </Card>
      {record.warnings.length > 0 ? (
        <Card tone="warning">
          {record.warnings.map((warning) => (
            <Text selectable key={warning} style={{ color: colors.warningText }}>{warning}</Text>
          ))}
        </Card>
      ) : null}
    </ScrollView>
  );
}
