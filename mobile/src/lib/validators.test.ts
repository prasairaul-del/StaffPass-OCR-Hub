import assert from 'node:assert/strict';
import test from 'node:test';
import { clampConfidence, csvEscape, isValidIsoDate, validateDraft } from './validators';
import type { StaffPassDraft } from './types';

const validDraft: StaffPassDraft = {
  fileUri: 'file:///local/document.jpg',
  fileName: 'document.jpg',
  mimeType: 'image/jpeg',
  firstName: 'Amina',
  lastName: 'Khan',
  phoneNumber: '',
  docType: 'Staff ID',
  docNumber: 'SP-100',
  expiryDate: '2027-01-31',
  confidenceScore: 0,
  notes: '',
  reviewStatus: 'Pending Review',
  warnings: [],
  engine: 'manual-review'
};

test('validates ISO dates strictly', () => {
  assert.equal(isValidIsoDate('2027-01-31'), true);
  assert.equal(isValidIsoDate('2027-02-31'), false);
  assert.equal(isValidIsoDate('31-01-2027'), false);
});

test('clamps confidence into database bounds', () => {
  assert.equal(clampConfidence(144), 100);
  assert.equal(clampConfidence(-10), 0);
  assert.equal(clampConfidence(79.6), 80);
});

test('rejects incomplete drafts', () => {
  const errors = validateDraft({ ...validDraft, firstName: '', expiryDate: 'bad-date' });
  assert.deepEqual(errors, ['First name is required.', 'Expiry date must use YYYY-MM-DD.']);
});

test('escapes CSV output deterministically', () => {
  assert.equal(csvEscape('Plain'), 'Plain');
  assert.equal(csvEscape('A, B'), '"A, B"');
  assert.equal(csvEscape('A "B"'), '"A ""B"""');
});
