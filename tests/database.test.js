const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const SQLite = require('better-sqlite3');
const db = require('../database');

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
      notes: 'Signature does not match — verify with supervisor.',
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
    assert.strictEqual(records[0].notes, 'Signature does not match — verify with supervisor.');

    db.close();

    const inspectorDirect = new SQLite(dbPath, { readonly: true });
    const docRow = inspectorDirect.prepare(
      'SELECT notes FROM documents WHERE id = ?'
    ).get(records[0].document_id);
    assert.strictEqual(docRow.notes, 'Signature does not match — verify with supervisor.');
    inspectorDirect.close();

    const inspector = new SQLite(dbPath, { readonly: true });
    const auditRows = inspector.prepare(
      'SELECT event_type, details FROM audit_logs ORDER BY id ASC'
    ).all();

    assert.strictEqual(auditRows.length, 1);
    assert.strictEqual(auditRows[0].event_type, 'review.saved');
    assert.match(auditRows[0].details, /"document_id":\s*\d+/);
    assert.match(auditRows[0].details, /"review_status":"Approved"/);
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
});
