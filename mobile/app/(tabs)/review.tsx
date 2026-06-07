import { ScrollView, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Button } from '@/components/button';
import { Card } from '@/components/card';
import { EmptyState } from '@/components/empty-state';
import { Field } from '@/components/field';
import { useAppState } from '@/state/app-context';
import { colors } from '@/theme/colors';

export default function ReviewScreen() {
  const { currentDraft, setDraftField, saveCurrentDraft, markCurrentRejected, validationErrors } = useAppState();

  if (!currentDraft) {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 18 }}>
        <EmptyState
          icon="clipboard-outline"
          title="Review queue is empty"
          body="Capture or import a document first. Mobile OCR results are never auto-approved."
        />
      </ScrollView>
    );
  }

  async function approve() {
    await saveCurrentDraft('Approved');
    router.push('/records');
  }

  async function reject() {
    await markCurrentRejected();
    router.push('/records');
  }

  const canPreviewImage = currentDraft.mimeType.startsWith('image/');

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 18, gap: 16 }}>
      <Card>
        {canPreviewImage ? (
          <Image
            source={{ uri: currentDraft.fileUri }}
            contentFit="contain"
            style={{ width: '100%', aspectRatio: 0.78, backgroundColor: '#020617', borderRadius: 12 }}
          />
        ) : (
          <View style={{ minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>PDF preview pending</Text>
            <Text selectable style={{ color: colors.muted, textAlign: 'center' }}>
              Android PDF rasterization is explicit future work. Save only after manual inspection.
            </Text>
          </View>
        )}
      </Card>

      {currentDraft.warnings.length > 0 ? (
        <Card tone="warning">
          <Text style={{ color: colors.warningText, fontWeight: '800' }}>Manual review required</Text>
          {currentDraft.warnings.map((warning) => (
            <Text selectable key={warning} style={{ color: colors.warningText }}>{warning}</Text>
          ))}
        </Card>
      ) : null}

      <Card>
        <Field label="First name" value={currentDraft.firstName} onChangeText={(value) => setDraftField('firstName', value)} />
        <Field label="Last name" value={currentDraft.lastName} onChangeText={(value) => setDraftField('lastName', value)} />
        <Field label="Phone number" value={currentDraft.phoneNumber} onChangeText={(value) => setDraftField('phoneNumber', value)} keyboardType="phone-pad" />
        <Field label="Document type" value={currentDraft.docType} onChangeText={(value) => setDraftField('docType', value)} />
        <Field label="Document number" value={currentDraft.docNumber} onChangeText={(value) => setDraftField('docNumber', value)} />
        <Field label="Expiry date" value={currentDraft.expiryDate} onChangeText={(value) => setDraftField('expiryDate', value)} placeholder="YYYY-MM-DD" />
        <Field label="Confidence" value={String(currentDraft.confidenceScore)} onChangeText={(value) => setDraftField('confidenceScore', Number(value) || 0)} keyboardType="number-pad" />
        <View style={{ gap: 6 }}>
          <Text style={{ color: colors.muted, fontWeight: '700' }}>Notes</Text>
          <TextInput
            value={currentDraft.notes}
            onChangeText={(value) => setDraftField('notes', value)}
            multiline
            style={{
              minHeight: 92,
              color: colors.text,
              backgroundColor: colors.input,
              borderColor: colors.border,
              borderWidth: 1,
              borderRadius: 12,
              padding: 12,
              textAlignVertical: 'top'
            }}
          />
        </View>
      </Card>

      {validationErrors.length > 0 ? (
        <Card tone="danger">
          {validationErrors.map((error) => (
            <Text selectable key={error} style={{ color: colors.dangerText }}>{error}</Text>
          ))}
        </Card>
      ) : null}

      <View style={{ gap: 10 }}>
        <Button icon="checkmark-circle-outline" label="Approve record" onPress={approve} disabled={validationErrors.length > 0} />
        <Button icon="close-circle-outline" label="Reject record" variant="danger" onPress={reject} />
      </View>
    </ScrollView>
  );
}
