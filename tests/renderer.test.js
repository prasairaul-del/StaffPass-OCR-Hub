const assert = require('assert');
const {
  createQueueItem,
  getConfidenceStatus,
  normalizeExtraction,
  validateReviewData
} = require('../renderer');

describe('Renderer UI Helpers', () => {
  it('should map confidence scores to review statuses', () => {
    assert.strictEqual(getConfidenceStatus(95), 'Trusted');
    assert.strictEqual(getConfidenceStatus(80), 'Review Recommended');
    assert.strictEqual(getConfidenceStatus(79), 'Manual Review Required');
  });

  it('should validate required review fields', () => {
    const errors = validateReviewData({
      first_name: '',
      last_name: '',
      doc_type: '',
      doc_number: ''
    });
    assert.deepStrictEqual(errors, [
      'First name is required.',
      'Last name is required.',
      'Document type is required.',
      'Document number is required.'
    ]);
  });

  it('should normalize OCR result values for the inspector', () => {
    const result = normalizeExtraction({ first_name: 'JOHN', confidence: 94 });
    assert.strictEqual(result.first_name, 'JOHN');
    assert.strictEqual(result.last_name, '');
    assert.strictEqual(result.confidence_score, 94);
  });

  it('should create queued document items from Windows paths', () => {
    const item = createQueueItem('C:\\Docs\\passport.jpg');
    assert.strictEqual(item.fileName, 'passport.jpg');
    assert.strictEqual(item.status, 'queued');
    assert.strictEqual(item.reviewStatus, 'Pending Review');
  });

  it('should validate expiry date format YYYY-MM-DD', () => {
    const errors = validateReviewData({
      first_name: 'John',
      last_name: 'Doe',
      doc_type: 'Passport',
      doc_number: '1234',
      expiry_date: '2026/12/31'
    });
    assert.deepStrictEqual(errors, ['Expiry date format must be YYYY-MM-DD.']);
  });

  it('should parse and format file sizes in createQueueItem', () => {
    const itemB = createQueueItem('C:\\test.jpg', 512);
    assert.strictEqual(itemB.fileSize, '512 B');

    const itemKB = createQueueItem('C:\\test.jpg', 1536);
    assert.strictEqual(itemKB.fileSize, '1.5 KB');

    const itemMB = createQueueItem('C:\\test.jpg', 1048576 * 2.5);
    assert.strictEqual(itemMB.fileSize, '2.5 MB');
  });
});
