import TextRecognition from '@react-native-ml-kit/text-recognition';
import type { IntakeDocument, OcrResponse } from './types';
import { parseOcrText } from './ocr-parser';

/**
 * Runs Google ML Kit Text Recognition on the document image offline.
 * Falls back to manual review if the native module is unavailable (e.g. running on simulator or web).
 */
export async function runManualReviewOcr(document: IntakeDocument): Promise<OcrResponse> {
  const defaultDocType = document.mimeType === 'application/pdf' ? 'PDF Document' : 'Image Document';
  
  try {
    // 1. Run native ML Kit Text Recognition on the document URI
    const result = await TextRecognition.recognize(document.fileUri);
    
    if (result && result.text) {
      // 2. Parse the recognized text using heuristics
      const extractedData = parseOcrText(result.text, defaultDocType);
      
      return {
        ok: true,
        degraded: false,
        engine: 'mobile-google-mlkit',
        warnings: [],
        data: extractedData
      };
    }
  } catch (error) {
    console.warn('Native ML Kit OCR failed, falling back to manual entry:', error);
  }

  // Fallback: Degraded manual-entry mode
  return {
    ok: false,
    degraded: true,
    engine: 'mobile-manual-review',
    warnings: [
      'Native Android OCR is not enabled in this build.',
      'No identity fields were inferred automatically.',
      'Enter document details manually before approval.'
    ],
    data: {
      firstName: '',
      lastName: '',
      phoneNumber: '',
      docType: defaultDocType,
      docNumber: '',
      expiryDate: '',
      confidenceScore: 0,
      notes: 'Mobile OCR adapter returned manual-review-only output.'
    }
  };
}
