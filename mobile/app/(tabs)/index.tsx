import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { useAppState } from '@/state/app-context';
import { colors } from '@/theme/colors';

export default function CaptureScreen() {
  const { currentDraft, importFromCamera, importFromDocuments, importFromLibrary, runOcrForCurrent, queueState } = useAppState();

  async function runOcr() {
    await runOcrForCurrent();
    router.push('/review');
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 18, gap: 16 }}>
      <Card>
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.text, fontSize: 22, fontWeight: '800' }}>Local document intake</Text>
          <Text selectable style={{ color: colors.muted, lineHeight: 21 }}>
            Capture or import one staff document at a time. Files stay in app-local storage and every OCR result starts in manual review.
          </Text>
        </View>
        <View style={{ gap: 10 }}>
          <Button icon="camera-outline" label="Capture with camera" onPress={importFromCamera} />
          <Button icon="image-outline" label="Import from gallery" variant="secondary" onPress={importFromLibrary} />
          <Button icon="document-attach-outline" label="Import document file" variant="secondary" onPress={importFromDocuments} />
        </View>
      </Card>

      {currentDraft ? (
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Ionicons name="document-text-outline" size={28} color={colors.accent} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text selectable style={{ color: colors.text, fontWeight: '800' }}>{currentDraft.fileName}</Text>
              <Text selectable style={{ color: colors.muted }}>{currentDraft.mimeType || 'Unknown type'}</Text>
            </View>
          </View>
          <Button icon="scan-outline" label="Prepare manual-review OCR" onPress={runOcr} loading={queueState === 'running'} />
        </Card>
      ) : (
        <EmptyState
          icon="cloud-offline-outline"
          title="No document selected"
          body="Use camera, gallery, or document import to begin a local review."
        />
      )}
    </ScrollView>
  );
}
