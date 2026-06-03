const Database = require('better-sqlite3');
let db;
let dbPath = 'staffpass.db';

function init(nextDbPath) {
  close();
  dbPath = nextDbPath || 'staffpass.db';
  db = new Database(dbPath);
  db.pragma('foreign_keys = ON');

  const schema = [
    'CREATE TABLE IF NOT EXISTS staff (',
    '  id INTEGER PRIMARY KEY AUTOINCREMENT,',
    '  first_name TEXT NOT NULL,',
    '  last_name TEXT NOT NULL,',
    '  phone_number TEXT,',
    "  overall_status TEXT DEFAULT 'Pending Review',",
    '  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,',
    '  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP',
    ');',
    '',
    'CREATE TABLE IF NOT EXISTS documents (',
    '  id INTEGER PRIMARY KEY AUTOINCREMENT,',
    '  staff_id INTEGER REFERENCES staff(id) ON DELETE CASCADE,',
    '  doc_type TEXT NOT NULL,',
    '  doc_number TEXT NOT NULL,',
    '  expiry_date TEXT,',
    '  confidence_score INTEGER DEFAULT 0,',
    '  file_path TEXT NOT NULL,',
    '  notes TEXT,',
    "  review_status TEXT DEFAULT 'Pending Review',",
    '  uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP',
    ');',
    '',
    'CREATE TABLE IF NOT EXISTS audit_logs (',
    '  id INTEGER PRIMARY KEY AUTOINCREMENT,',
    '  event_type TEXT NOT NULL,',
    '  details TEXT,',
    '  created_at DATETIME DEFAULT CURRENT_TIMESTAMP',
    ');'
  ].join('\n');

  db.exec(schema);

  try {
    db.exec('ALTER TABLE documents ADD COLUMN notes TEXT');
  } catch (_err) {
    // Column already exists on existing databases
  }
}

function ensureDb() {
  if (!db) {
    init(dbPath);
  }

  return db;
}

function getTables() {
  const rows = ensureDb().prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  return rows.map(function(r) { return r.name; });
}

function close() {
  if (!db) return;
  db.close();
  db = null;
}

function serializeDetails(details) {
  if (details == null) return null;
  if (typeof details === 'string') return details;
  return JSON.stringify(details);
}

function logAudit(eventType, details) {
  var database = ensureDb();
  var result = database.prepare(
    'INSERT INTO audit_logs (event_type, details) VALUES (?, ?)'
  ).run(eventType, serializeDetails(details));

  return result.lastInsertRowid;
}

function normalizeText(value) {
  return value == null ? '' : String(value).trim();
}

function saveReviewedDocument(payload) {
  payload = payload || {};
  var database = ensureDb();
  var saveTransaction = database.transaction(function(input) {
    var reviewStatus = normalizeText(input.review_status) || 'Reviewed';
    var overallStatus = normalizeText(input.overall_status) || reviewStatus;
    var staffId = input.staff_id ? Number(input.staff_id) : null;

    if (!staffId) {
      var staffResult = database.prepare([
        'INSERT INTO staff (',
        '  first_name,',
        '  last_name,',
        '  phone_number,',
        '  overall_status,',
        '  created_at,',
        '  updated_at',
        ') VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)'
      ].join('\n')).run(
        normalizeText(input.first_name),
        normalizeText(input.last_name),
        normalizeText(input.phone_number),
        overallStatus
      );
      staffId = Number(staffResult.lastInsertRowid);
    } else {
      database.prepare([
        'UPDATE staff',
        'SET overall_status = ?, updated_at = CURRENT_TIMESTAMP',
        'WHERE id = ?'
      ].join('\n')).run(overallStatus, staffId);
    }

    var documentResult = database.prepare([
      'INSERT INTO documents (',
      '  staff_id,',
      '  doc_type,',
      '  doc_number,',
      '  expiry_date,',
      '  confidence_score,',
      '  file_path,',
      '  notes,',
      '  review_status',
      ') VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ].join('\n')).run(
      staffId,
      normalizeText(input.doc_type),
      normalizeText(input.doc_number),
      normalizeText(input.expiry_date) || null,
      Number.isFinite(Number(input.confidence_score)) ? Number(input.confidence_score) : 0,
      normalizeText(input.file_path),
      normalizeText(input.notes) || null,
      reviewStatus
    );

    var documentId = Number(documentResult.lastInsertRowid);
    var auditId = database.prepare([
      'INSERT INTO audit_logs (event_type, details)',
      'VALUES (?, ?)'
    ].join('\n')).run(
      'review.saved',
      JSON.stringify({
        staff_id: staffId,
        document_id: documentId,
        review_status: reviewStatus,
        file_path: normalizeText(input.file_path)
      })
    ).lastInsertRowid;

    return {
      staff_id: staffId,
      document_id: documentId,
      audit_log_id: Number(auditId),
      review_status: reviewStatus
    };
  });

  return saveTransaction(payload);
}

function listRecords() {
  return ensureDb().prepare([
    'SELECT',
    '  documents.id AS document_id,',
    '  documents.staff_id,',
    '  staff.first_name,',
    '  staff.last_name,',
    '  staff.phone_number,',
    '  staff.overall_status,',
    '  documents.doc_type,',
    '  documents.doc_number,',
    '  documents.expiry_date,',
    '  documents.confidence_score,',
    '  documents.file_path,',
    '  documents.notes,',
    '  documents.review_status,',
    '  documents.uploaded_at',
    'FROM documents',
    'LEFT JOIN staff ON staff.id = documents.staff_id',
    'ORDER BY documents.uploaded_at DESC, documents.id DESC'
  ].join('\n')).all();
}

module.exports = { init: init, getTables: getTables, close: close, saveReviewedDocument: saveReviewedDocument, listRecords: listRecords, logAudit: logAudit };
