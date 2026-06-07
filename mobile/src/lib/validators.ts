import type { ReviewStatus, StaffPassDraft } from './types';

export const REVIEW_STATUSES: ReviewStatus[] = [
  'Pending Review',
  'Reviewed',
  'Approved',
  'Rejected',
  'Corrected'
];

export function normalizeText(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

export function isValidIsoDate(value: string): boolean {
  const text = normalizeText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;

  const [year, month, day] = text.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export function clampConfidence(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(100, Math.max(0, Math.round(numeric)));
}

export function validateDraft(draft: StaffPassDraft): string[] {
  const errors: string[] = [];

  if (!normalizeText(draft.fileUri)) errors.push('A source document is required.');
  if (!normalizeText(draft.firstName)) errors.push('First name is required.');
  if (!normalizeText(draft.lastName)) errors.push('Last name is required.');
  if (!normalizeText(draft.docType)) errors.push('Document type is required.');
  if (!normalizeText(draft.docNumber)) errors.push('Document number is required.');
  if (draft.expiryDate && !isValidIsoDate(draft.expiryDate)) errors.push('Expiry date must use YYYY-MM-DD.');
  if (!REVIEW_STATUSES.includes(draft.reviewStatus)) errors.push('Review status is not allowed.');
  if (draft.confidenceScore < 0 || draft.confidenceScore > 100) errors.push('Confidence must be between 0 and 100.');

  return errors;
}

export function csvEscape(value: unknown): string {
  const text = value == null ? '' : String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}
