import type { IntakeDocument, OcrResponse } from './types';

export async function runManualReviewOcr(document: IntakeDocument): Promise<OcrResponse> {
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
      docType: document.mimeType === 'application/pdf' ? 'PDF Document' : 'Image Document',
      docNumber: '',
      expiryDate: '',
      confidenceScore: 0,
      notes: 'Mobile OCR adapter returned manual-review-only output.'
    }
  };
}
