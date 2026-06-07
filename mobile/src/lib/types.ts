export type ReviewStatus = 'Pending Review' | 'Reviewed' | 'Approved' | 'Rejected' | 'Corrected';

export type OcrResponse = {
  ok: boolean;
  degraded: boolean;
  engine: string;
  warnings: string[];
  data: {
    firstName: string;
    lastName: string;
    phoneNumber: string;
    docType: string;
    docNumber: string;
    expiryDate: string;
    confidenceScore: number;
    notes: string;
  };
};

export type IntakeDocument = {
  fileUri: string;
  fileName: string;
  mimeType: string;
};

export type StaffPassDraft = IntakeDocument & OcrResponse['data'] & {
  reviewStatus: ReviewStatus;
  warnings: string[];
  engine: string;
};

export type StaffPassRecord = StaffPassDraft & {
  id: number;
  createdAt: string;
  updatedAt: string;
};
