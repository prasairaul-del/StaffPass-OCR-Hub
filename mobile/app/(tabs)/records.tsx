import { Link } from 'expo-router';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { useAppState } from '@/state/app-context';
import { colors } from '@/theme/colors';

export default function RecordsScreen() {
  const { exportRecords, filteredRecords, refreshRecords, search, setSearch } = useAppState();

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 18, gap: 16 }}>
      <Card>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search names, documents, status"
          placeholderTextColor={colors.placeholder}
          style={{
            color: colors.text,
            backgroundColor: colors.input,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 12
          }}
        />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Button icon="refresh-outline" label="Refresh" variant="secondary" onPress={refreshRecords} />
          </View>
          <View style={{ flex: 1 }}>
            <Button icon="share-outline" label="Export CSV" onPress={exportRecords} />
          </View>
        </View>
      </Card>

      {filteredRecords.length === 0 ? (
        <EmptyState icon="folder-open-outline" title="No records found" body="Approved and rejected reviews appear here after saving." />
      ) : (
        filteredRecords.map((record) => (
          <Link key={record.id} href={{ pathname: '/record/[id]', params: { id: String(record.id) } }} asChild>
            <Card pressable>
              <View style={{ gap: 4 }}>
                <Text selectable style={{ color: colors.text, fontWeight: '800', fontSize: 17 }}>
                  {record.firstName} {record.lastName}
                </Text>
                <Text selectable style={{ color: colors.muted }}>{record.docType} - {record.docNumber}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <Text style={{ color: colors.accent, fontWeight: '800' }}>{record.reviewStatus}</Text>
                <Text style={{ color: colors.muted, fontVariant: ['tabular-nums'] }}>{record.confidenceScore}%</Text>
              </View>
            </Card>
          </Link>
        ))
      )}
    </ScrollView>
  );
}
