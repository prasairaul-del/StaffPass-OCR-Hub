const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const SQLite = require('better-sqlite3');
const db = require('../database');

function isValidIsoDate(value) {
  if (value == null) return false;

  const text = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;

  const parts = text.split('-').map(Number);
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return date.getUTCFullYear() === parts[0]
    && date.getUTCMonth() === parts[1] - 1
    && date.getUTCDate() === parts[2];
}

function createLegacyDatabase(targetPath) {
  const legacy = new SQLite(targetPath);
  legacy.exec(`
    CREATE TABLE staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      phone_number TEXT,
      overall_status TEXT DEFAULT 'Pending Review',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      staff_id INTEGER REFERENCES staff(id) ON DELETE CASCADE,
      doc_type TEXT NOT NULL,
      doc_number TEXT NOT NULL,
      expiry_date TEXT,
      confidence_score INTEGER DEFAULT 0,
      file_path TEXT NOT NULL,
      notes TEXT,
      review_status TEXT DEFAULT 'Pending Review',
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const staffResult = legacy.prepare(`
    INSERT INTO staff (first_name, last_name, phone_number, overall_status)
    VALUES (?, ?, ?, ?)
  `).run('Maya', 'Hassan', '+971500000100', 'Pending Review');
  const staffId = Number(staffResult.lastInsertRowid);

  legacy.prepare(`
    INSERT INTO documents (
      staff_id,
      doc_type,
      doc_number,
      expiry_date,
      confidence_score,
      file_path,
      notes,
      review_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    staffId,
    'RESIDENCE_PERMIT',
    'RP-123',
    '2031-01-15',
    91,
    'legacy/document.jpg',
    'Legacy note',
    'Pending Review'
  );

  legacy.close();
  return staffId;
}

describe('Database persistence helpers', () => {
  let dbPath;

  beforeEach(() => {
    dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'staffpass-ocr-')), 'staffpass.db');
    db.init(dbPath);
  });

  afterEach(() => {
    db.close();
    const folder = path.dirname(dbPath);
    fs.rmSync(folder, { recursive: true, force: true });
  });

  it('creates the expected tables', () => {
    const tables = db.getTables();
    assert.ok(tables.includes('staff'));
    assert.ok(tables.includes('documents'));
    assert.ok(tables.includes('audit_logs'));
    assert.ok(tables.includes('schema_migrations'));
  });

  it('creates a backup and migrates legacy databases with preserved valid rows', () => {
    db.close();
    fs.rmSync(dbPath, { force: true });

    const staffId = createLegacyDatabase(dbPath);
    db.init(dbPath);

    assert.ok(fs.existsSync(`${dbPath}.bak`));

    const tables = db.getTables();
    assert.ok(tables.includes('schema_migrations'));

    const records = db.listRecords();
    assert.strictEqual(records.length, 1);
    assert.strictEqual(records[0].staff_id, staffId);
    assert.strictEqual(records[0].doc_type, 'RESIDENCE_PERMIT');
    assert.strictEqual(records[0].review_status, 'Pending Review');
    assert.strictEqual(records[0].notes, 'Legacy note');

    db.close();

    const inspector = new SQLite(dbPath);
    try {
      inspector.function('is_valid_iso_date', function(value) {
        return isValidIsoDate(value) ? 1 : 0;
      });

      const versions = inspector.prepare(
        'SELECT version FROM schema_migrations ORDER BY version ASC'
      ).all().map((row) => row.version);
      assert.deepStrictEqual(versions, [1, 2]);

      const documentRow = inspector.prepare(
        'SELECT doc_type, review_status, notes FROM documents WHERE staff_id = ?'
      ).get(staffId);
      assert.strictEqual(documentRow.doc_type, 'RESIDENCE_PERMIT');
      assert.strictEqual(documentRow.review_status, 'Pending Review');
      assert.strictEqual(documentRow.notes, 'Legacy note');

      assert.throws(
        () => inspector.prepare(`
          INSERT INTO documents (
            staff_id,
            doc_type,
            doc_number,
            expiry_date,
            confidence_score,
            file_path,
            review_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(staffId, ' ', 'BAD-1', '2031-02-30', 50, 'legacy/bad.jpg', 'Approved'),
        /CHECK constraint failed|constraint failed/i
      );
    } finally {
      inspector.close();
    }
  });

  it('saves reviewed metadata, reuses an explicit staff row, and logs the audit event', () => {
    const seed = new SQLite(dbPath);
    const staffInsert = seed.prepare(`
      INSERT INTO staff (first_name, last_name, phone_number, overall_status)
      VALUES (?, ?, ?, ?)
    `).run('Ava', 'Patel', '+971500000000', 'Pending Review');
    const staffId = Number(staffInsert.lastInsertRowid);
    seed.close();

    const saved = db.saveReviewedDocument({
      staff_id: staffId,
      first_name: 'Ignored',
      last_name: 'Fields',
      phone_number: '+971500000001',
      doc_type: 'PASSPORT',
      doc_number: 'P1234567',
      expiry_date: '2030-12-31',
      confidence_score: 97,
      file_path: 'sample/passport.jpg',
      notes: 'Signature does not match; verify with supervisor.',
      review_status: 'Approved'
    });

    assert.strictEqual(saved.staff_id, staffId);
    assert.strictEqual(saved.review_status, 'Approved');

    const records = db.listRecords();
    assert.strictEqual(records.length, 1);
    assert.strictEqual(records[0].staff_id, staffId);
    assert.strictEqual(records[0].first_name, 'Ava');
    assert.strictEqual(records[0].doc_type, 'PASSPORT');
    assert.strictEqual(records[0].review_status, 'Approved');
    assert.strictEqual(records[0].notes, 'Signature does not match; verify with supervisor.');

    db.close();

    const inspectorDirect = new SQLite(dbPath, { readonly: true });
    const docRow = inspectorDirect.prepare(
      'SELECT notes FROM documents WHERE id = ?'
    ).get(records[0].document_id);
    assert.strictEqual(docRow.notes, 'Signature does not match; verify with supervisor.');
    inspectorDirect.close();

    const inspector = new SQLite(dbPath, { readonly: true });
    const auditRows = inspector.prepare(
      'SELECT event_type, details FROM audit_logs ORDER BY id ASC'
    ).all();

    assert.strictEqual(auditRows.length, 1);
    assert.strictEqual(auditRows[0].event_type, 'review.saved');
    assert.match(auditRows[0].details, /"document_id":\s*\d+/);
    assert.match(auditRows[0].details, /"review_status":"Approved"/);
    assert.doesNotMatch(auditRows[0].details, /file_path|sample\/passport\.jpg/);
    inspector.close();
  });

  it('writes standalone audit entries as serialized text', () => {
    const auditId = db.logAudit('manual.check', { status: 'ok', count: 2 });
    assert.ok(auditId);

    db.close();

    const inspector = new SQLite(dbPath, { readonly: true });
    const row = inspector.prepare(
      'SELECT event_type, details FROM audit_logs WHERE id = ?'
    ).get(auditId);

    assert.strictEqual(row.event_type, 'manual.check');
    assert.strictEqual(row.details, '{"status":"ok","count":2}');
    inspector.close();
  });

  it('rejects reviewed documents with missing required fields or invalid values', () => {
    const basePayload = {
      first_name: 'Ava',
      last_name: 'Patel',
      phone_number: '+971500000000',
      doc_type: 'PASSPORT',
      doc_number: 'P1234567',
      expiry_date: '2030-12-31',
      confidence_score: 95,
      file_path: 'sample/passport.jpg',
      review_status: 'Approved'
    };

    assert.throws(
      () => db.saveReviewedDocument({
        ...basePayload,
        first_name: ''
      }),
      /first name|required/i
    );

    assert.throws(
      () => db.saveReviewedDocument({
        ...basePayload,
        last_name: ''
      }),
      /last name|required/i
    );

    assert.throws(
      () => db.saveReviewedDocument({
        ...basePayload,
        doc_type: ''
      }),
      /document type|required/i
    );

    assert.throws(
      () => db.saveReviewedDocument({
        ...basePayload,
        doc_number: ''
      }),
      /document number|required/i
    );

    assert.throws(
      () => db.saveReviewedDocument({
        ...basePayload,
        file_path: ''
      }),
      /file path|required/i
    );

    assert.throws(
      () => db.saveReviewedDocument({
        ...basePayload,
        expiry_date: '2030/12/31'
      }),
      /expiry date|YYYY-MM-DD/i
    );

    assert.throws(
      () => db.saveReviewedDocument({
        ...basePayload,
        expiry_date: '2030-13-01'
      }),
      /expiry date|valid/i
    );

    assert.throws(
      () => db.saveReviewedDocument({
        ...basePayload,
        confidence_score: 101
      }),
      /confidence/i
    );

    assert.throws(
      () => db.saveReviewedDocument({
        ...basePayload,
        confidence_score: -1
      }),
      /confidence/i
    );

    assert.throws(
      () => db.saveReviewedDocument({
        ...basePayload,
        review_status: 'Archived'
      }),
      /review status/i
    );
  });

  it('supports pagination, countRecords, filtering, and backward compatibility in listRecords', () => {
    const basePayload = {
      first_name: 'John',
      last_name: 'Doe',
      phone_number: '+971500000000',
      doc_type: 'PASSPORT',
      doc_number: 'P1234567',
      expiry_date: '2030-12-31',
      confidence_score: 95,
      file_path: 'sample/passport.jpg',
      review_status: 'Approved'
    };

    db.saveReviewedDocument(basePayload);
    db.saveReviewedDocument({
      ...basePayload,
      first_name: 'Alice',
      doc_type: 'VISA',
      doc_number: 'V9876543'
    });
    db.saveReviewedDocument({
      ...basePayload,
      first_name: 'Bob',
      doc_type: 'PASSPORT',
      doc_number: 'P7777777'
    });

    const allRecords = db.listRecords();
    assert.strictEqual(allRecords.length, 3);

    const allCount = db.countRecords();
    assert.strictEqual(allCount, 3);

    const searchRecords = db.listRecords({ search: 'Alice' });
    assert.strictEqual(searchRecords.length, 1);
    assert.strictEqual(searchRecords[0].first_name, 'Alice');

    const searchCount = db.countRecords({ search: 'Alice' });
    assert.strictEqual(searchCount, 1);

    const typeRecords = db.listRecords({ type: 'PASSPORT' });
    assert.strictEqual(typeRecords.length, 2);
    const typeCount = db.countRecords({ type: 'PASSPORT' });
    assert.strictEqual(typeCount, 2);

    const page1 = db.listRecords({ page: 1, limit: 2 });
    assert.strictEqual(page1.length, 2);
    assert.strictEqual(page1[0].first_name, 'Bob');
    assert.strictEqual(page1[1].first_name, 'Alice');

    const page2 = db.listRecords({ page: 2, limit: 2 });
    assert.strictEqual(page2.length, 1);
    assert.strictEqual(page2[0].first_name, 'John');
  });

  it('rolls back the transaction and saves nothing if a database-level constraint fails', () => {
    // A non-existent staff_id will pass JS validation but fail SQLite foreign key check
    assert.throws(
      () => db.saveReviewedDocument({
        staff_id: 999999,
        first_name: 'John',
        last_name: 'Doe',
        doc_type: 'PASSPORT',
        doc_number: 'P1234567',
        file_path: 'sample/passport.jpg',
        confidence_score: 95,
        review_status: 'Approved'
      }),
      /foreign key/i
    );

    // Verify database remains empty/unaffected
    const records = db.listRecords();
    assert.strictEqual(records.length, 0);
  });
});
