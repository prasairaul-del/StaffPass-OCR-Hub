import assert from 'node:assert/strict';
import test from 'node:test';
import { parseOcrText } from './ocr-parser';

test('parses Emirates ID mock text block correctly', () => {
  const ocrText = `
    UNITED ARAB EMIRATES
    IDENTITY CARD
    ID Number / الرقم الموحد: 784-1992-1234567-8
    Name: John Doe
    Nationality: United Kingdom
    Expiry Date: 2028/10/15
    Phone Number: 050 123 4567
  `;

  const parsed = parseOcrText(ocrText);
  assert.equal(parsed.docType, 'Emirates ID');
  assert.equal(parsed.docNumber, '784-1992-1234567-8');
  assert.equal(parsed.firstName, 'John');
  assert.equal(parsed.lastName, 'Doe');
  assert.equal(parsed.phoneNumber, '+971501234567');
  assert.equal(parsed.expiryDate, '2028-10-15');
  assert.ok(parsed.confidenceScore >= 80);
});

test('parses Passport MRZ mock lines correctly', () => {
  const ocrText = `
    P<USAWASHINGTON<<GEORGE<<<<<<<<<<<<<<<<<<<<<<
    A123456782USA3201014M3012316<<<<<<<<<<<<<<02
  `;

  const parsed = parseOcrText(ocrText);
  assert.equal(parsed.docType, 'Passport');
  assert.equal(parsed.docNumber, 'A12345678');
  assert.equal(parsed.firstName, 'George');
  assert.equal(parsed.lastName, 'Washington');
  assert.equal(parsed.expiryDate, '2030-12-31');
  assert.ok(parsed.confidenceScore >= 90);
});

test('parses Passport text with labels (non-MRZ) correctly', () => {
  const ocrText = `
    PASSPORT
    Surname / اللقب: SMITH
    Given Names / الأسماء الأولى: ALICE JANE
    Passport No / رقم جواز السفر: N98765432
    Date of Expiry / تاريخ الانتهاء: 31 DEC 2029
  `;

  const parsed = parseOcrText(ocrText);
  assert.equal(parsed.docType, 'Passport');
  assert.equal(parsed.docNumber, 'N98765432');
  assert.equal(parsed.firstName, 'Alice Jane');
  assert.equal(parsed.lastName, 'Smith');
  assert.equal(parsed.expiryDate, '2029-12-31');
});

test('falls back gracefully on empty or garbage text', () => {
  const parsed = parseOcrText('Random unrelated text block');
  assert.equal(parsed.docType, 'Image Document');
  assert.equal(parsed.docNumber, '');
  assert.equal(parsed.firstName, '');
  assert.equal(parsed.lastName, '');
  assert.equal(parsed.expiryDate, '');
});
