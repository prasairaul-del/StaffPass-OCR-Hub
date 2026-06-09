const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DEFAULT_DB_PATH = 'staffpass.db';
const LATEST_SCHEMA_VERSION = 2;
const REVIEW_STATUSES = Object.freeze([
  'Pending Review',
  'Reviewed',
  'Approved',
  'Rejected',
  'Corrected'
]);

let db;
let dbPath = DEFAULT_DB_PATH;
let dbExistedBeforeOpen = false;

let stmtInsertStaff;
let stmtUpdateStaff;
let stmtInsertDocument;
let stmtInsertAuditLog;
let stmtLogAudit;
let stmtGetSchemaVersion;
let stmtInsertSchemaVersion;
let stmtTableExists;


function sqlStringLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlValueList(values) {
  return values.map(sqlStringLiteral).join(', ');
}

function normalizeText(value) {
  return value == null ? '' : String(value).trim();
}

function isValidIsoDate(value) {
  var text = normalizeText(value);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;

  var parts = text.split('-').map(Number);
  var date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  return date.getUTCFullYear() === parts[0]
    && date.getUTCMonth() === parts[1] - 1
    && date.getUTCDate() === parts[2];
}

function registerDatabaseFunctions(database) {
  database.function('is_valid_iso_date', { deterministic: true }, function(value) {
    return isValidIsoDate(value) ? 1 : 0;
  });
}

function isInMemoryDatabasePath(value) {
  return value === ':memory:'
    || (typeof value === 'string' && value.startsWith('file:') && value.includes('mode=memory'));
}

function tableExists(database, tableName) {
  if (stmtTableExists) {
    var row = stmtTableExists.get(tableName);
    return !!row;
  }
  var row = database.prepare(
    "SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = ?"
  ).get(tableName);

  return !!row;
}

function ensureSchemaMigrationsTable(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function getAppliedSchemaVersion(database) {
  if (!tableExists(database, 'schema_migrations')) return 0;

  if (stmtGetSchemaVersion) {
    var row = stmtGetSchemaVersion.get();
    return row && row.version ? Number(row.version) : 0;
  }
  var row = database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get();
  return row && row.version ? Number(row.version) : 0;
}

function createMigrationBackupIfNeeded(sourcePath) {
  if (!sourcePath || isInMemoryDatabasePath(sourcePath) || !fs.existsSync(sourcePath)) {
    return null;
  }

  var backupPath = `${sourcePath}.bak`;
  fs.copyFileSync(sourcePath, backupPath);
  return backupPath;
}

function createLegacySchema(database) {
  ensureSchemaMigrationsTable(database);

  database.exec(`
    CREATE TABLE IF NOT EXISTS staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      phone_number TEXT,
      overall_status TEXT DEFAULT 'Pending Review',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS documents (
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

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function rebuildTablesWithChecks(database) {
  var reviewStatusList = sqlValueList(REVIEW_STATUSES);

  database.exec(`
    CREATE TABLE staff_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL CHECK (length(trim(first_name)) > 0),
      last_name TEXT NOT NULL CHECK (length(trim(last_name)) > 0),
      phone_number TEXT,
      overall_status TEXT DEFAULT 'Pending Review',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE documents_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      staff_id INTEGER REFERENCES staff(id) ON DELETE CASCADE,
      doc_type TEXT NOT NULL CHECK (length(trim(doc_type)) > 0),
      doc_number TEXT NOT NULL CHECK (length(trim(doc_number)) > 0),
      expiry_date TEXT CHECK (expiry_date IS NULL OR is_valid_iso_date(expiry_date)),
      confidence_score INTEGER NOT NULL DEFAULT 0 CHECK (confidence_score BETWEEN 0 AND 100),
      file_path TEXT NOT NULL CHECK (length(trim(file_path)) > 0),
      notes TEXT,
      review_status TEXT NOT NULL DEFAULT 'Pending Review'
        CHECK (review_status IN (${reviewStatusList})),
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  database.exec(`
    INSERT INTO staff_new (
      id,
      first_name,
      last_name,
      phone_number,
      overall_status,
      created_at,
      updated_at
    )
    SELECT
      id,
      first_name,
      last_name,
      phone_number,
      overall_status,
      created_at,
      updated_at
    FROM staff
    WHERE length(trim(first_name)) > 0
      AND length(trim(last_name)) > 0;
  `);

  database.exec(`
    INSERT INTO documents_new (
      id,
      staff_id,
      doc_type,
      doc_number,
      expiry_date,
      confidence_score,
      file_path,
      notes,
      review_status,
      uploaded_at
    )
    SELECT
      documents.id,
      documents.staff_id,
      documents.doc_type,
      documents.doc_number,
      documents.expiry_date,
      documents.confidence_score,
      documents.file_path,
      documents.notes,
      documents.review_status,
      documents.uploaded_at
    FROM documents
    WHERE length(trim(documents.doc_type)) > 0
      AND length(trim(documents.doc_number)) > 0
      AND length(trim(documents.file_path)) > 0
      AND documents.confidence_score BETWEEN 0 AND 100
      AND (documents.expiry_date IS NULL OR is_valid_iso_date(documents.expiry_date))
      AND documents.review_status IN (${reviewStatusList})
      AND (
        documents.staff_id IS NULL
        OR documents.staff_id IN (
          SELECT staff.id
          FROM staff
          WHERE length(trim(staff.first_name)) > 0
            AND length(trim(staff.last_name)) > 0
        )
      );
  `);

  database.exec(`
    DROP TABLE documents;
    ALTER TABLE documents_new RENAME TO documents;
    DROP TABLE staff;
    ALTER TABLE staff_new RENAME TO staff;
  `);
}

function recordMigrationVersion(database, version) {
  if (stmtInsertSchemaVersion) {
    stmtInsertSchemaVersion.run(version);
    return;
  }
  database.prepare(
    'INSERT INTO schema_migrations (version) VALUES (?)'
  ).run(version);
}

function applyPendingMigrations(database) {
  var currentVersion = getAppliedSchemaVersion(database);

  if (currentVersion >= LATEST_SCHEMA_VERSION) return;

  if (dbExistedBeforeOpen) {
    createMigrationBackupIfNeeded(dbPath);
  }

  database.pragma('foreign_keys = OFF');
  database.exec('BEGIN IMMEDIATE');

  try {
    for (var version = currentVersion + 1; version <= LATEST_SCHEMA_VERSION; version += 1) {
      if (version === 1) {
        createLegacySchema(database);
      } else if (version === 2) {
        rebuildTablesWithChecks(database);
      } else {
        throw new Error(`Missing migration for schema version ${version}.`);
      }

      recordMigrationVersion(database, version);
    }

    database.exec('COMMIT');
  } catch (error) {
    try {
      database.exec('ROLLBACK');
    } catch (_rollbackError) {
      // Ignore rollback failures; the original error is more useful.
    }

    throw error;
  } finally {
    database.pragma('foreign_keys = ON');
  }
}

function prepareStatements(database) {
  stmtInsertStaff = database.prepare([
    'INSERT INTO staff (',
    '  first_name,',
    '  last_name,',
    '  phone_number,',
    '  overall_status,',
    '  created_at,',
    '  updated_at',
    ') VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)'
  ].join('\n'));

  stmtUpdateStaff = database.prepare([
    'UPDATE staff',
    'SET overall_status = ?, updated_at = CURRENT_TIMESTAMP',
    'WHERE id = ?'
  ].join('\n'));

  stmtInsertDocument = database.prepare([
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
  ].join('\n'));

  stmtInsertAuditLog = database.prepare([
    'INSERT INTO audit_logs (event_type, details)',
    'VALUES (?, ?)'
  ].join('\n'));

  stmtLogAudit = database.prepare(
    'INSERT INTO audit_logs (event_type, details) VALUES (?, ?)'
  );

  stmtGetSchemaVersion = database.prepare('SELECT MAX(version) AS version FROM schema_migrations');
  stmtInsertSchemaVersion = database.prepare('INSERT INTO schema_migrations (version) VALUES (?)');
}

function init(nextDbPath) {
  close();
  dbPath = nextDbPath || DEFAULT_DB_PATH;
  dbExistedBeforeOpen = !isInMemoryDatabasePath(dbPath) && fs.existsSync(dbPath);
  db = new Database(dbPath);
  registerDatabaseFunctions(db);
  db.pragma('foreign_keys = ON');

  stmtTableExists = db.prepare("SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = ?");

  applyPendingMigrations(db);
  prepareStatements(db);
}

function ensureDb() {
  if (!db) {
    init(dbPath);
  }

  return db;
}

function getTables() {
  var rows = ensureDb().prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  return rows.map(function(row) { return row.name; });
}

function close() {
  if (!db) return;
  db.close();
  db = null;
  stmtInsertStaff = null;
  stmtUpdateStaff = null;
  stmtInsertDocument = null;
  stmtInsertAuditLog = null;
  stmtLogAudit = null;
  stmtGetSchemaVersion = null;
  stmtInsertSchemaVersion = null;
  stmtTableExists = null;
}

function serializeDetails(details) {
  if (details == null) return null;
  if (typeof details === 'string') return details;
  return JSON.stringify(details);
}

function logAudit(eventType, details) {
  var database = ensureDb();
  var result = stmtLogAudit.run(eventType, serializeDetails(details));

  return result.lastInsertRowid;
}

const ALLOWED_REVIEW_STATUSES = REVIEW_STATUSES.slice();

function validateReviewedDocument(input) {
  var errors = [];
  var requiredFields = [
    ['first_name', 'First name is required.'],
    ['last_name', 'Last name is required.'],
    ['doc_type', 'Document type is required.'],
    ['doc_number', 'Document number is required.'],
    ['file_path', 'File path is required.']
  ];

  requiredFields.forEach(function(field) {
    if (!normalizeText(input[field[0]])) errors.push(field[1]);
  });

  var expiryDate = normalizeText(input.expiry_date);
  if (expiryDate && !isValidIsoDate(expiryDate)) {
    errors.push('Expiry date must be a valid YYYY-MM-DD date.');
  }

  var confidenceScore = Number(input.confidence_score);
  if (!Number.isFinite(confidenceScore) || confidenceScore < 0 || confidenceScore > 100) {
    errors.push('Confidence score must be between 0 and 100.');
  }

  var reviewStatus = normalizeText(input.review_status) || 'Reviewed';
  if (!ALLOWED_REVIEW_STATUSES.includes(reviewStatus)) {
    errors.push('Review status is not valid.');
  }

  if (errors.length > 0) {
    throw new Error(errors.join(' '));
  }
}

function saveReviewedDocument(payload) {
  payload = payload || {};
  validateReviewedDocument(payload);
  var database = ensureDb();
  var saveTransaction = database.transaction(function(input) {
    var reviewStatus = normalizeText(input.review_status) || 'Reviewed';
    var overallStatus = normalizeText(input.overall_status) || reviewStatus;
    var staffId = input.staff_id ? Number(input.staff_id) : null;

    if (!staffId) {
      var staffResult = stmtInsertStaff.run(
        normalizeText(input.first_name),
        normalizeText(input.last_name),
        normalizeText(input.phone_number),
        overallStatus
      );
      staffId = Number(staffResult.lastInsertRowid);
    } else {
      stmtUpdateStaff.run(overallStatus, staffId);
    }

    var documentResult = stmtInsertDocument.run(
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
    var auditId = stmtInsertAuditLog.run(
      'review.saved',
      JSON.stringify({
        staff_id: staffId,
        document_id: documentId,
        review_status: reviewStatus
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

function listRecords(options) {
  options = options || {};
  const search = normalizeText(options.search).toLowerCase();
  const docType = normalizeText(options.type);
  const page = options.page ? Number(options.page) : null;
  const limit = options.limit ? Number(options.limit) : null;

  const conditions = [];
  const params = [];

  if (docType) {
    conditions.push('documents.doc_type = ?');
    params.push(docType);
  }

  if (search) {
    conditions.push('(LOWER(staff.first_name) LIKE ? OR LOWER(staff.last_name) LIKE ? OR LOWER(documents.doc_number) LIKE ? OR LOWER(documents.doc_type) LIKE ?)');
    const term = `%${search}%`;
    params.push(term, term, term, term);
  }

  let sql = [
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
    'LEFT JOIN staff ON staff.id = documents.staff_id'
  ].join('\n');

  if (conditions.length > 0) {
    sql += '\nWHERE ' + conditions.join(' AND ');
  }

  sql += '\nORDER BY documents.uploaded_at DESC, documents.id DESC';

  if (limit !== null && page !== null) {
    const offset = (page - 1) * limit;
    sql += '\nLIMIT ? OFFSET ?';
    params.push(limit, offset);
  }

  return ensureDb().prepare(sql).all(...params);
}

function countRecords(options) {
  options = options || {};
  const search = normalizeText(options.search).toLowerCase();
  const docType = normalizeText(options.type);

  const conditions = [];
  const params = [];

  if (docType) {
    conditions.push('documents.doc_type = ?');
    params.push(docType);
  }

  if (search) {
    conditions.push('(LOWER(staff.first_name) LIKE ? OR LOWER(staff.last_name) LIKE ? OR LOWER(documents.doc_number) LIKE ? OR LOWER(documents.doc_type) LIKE ?)');
    const term = `%${search}%`;
    params.push(term, term, term, term);
  }

  let sql = [
    'SELECT COUNT(1) AS count',
    'FROM documents',
    'LEFT JOIN staff ON staff.id = documents.staff_id'
  ].join('\n');

  if (conditions.length > 0) {
    sql += '\nWHERE ' + conditions.join(' AND ');
  }

  const row = ensureDb().prepare(sql).get(...params);
  return row ? row.count : 0;
}

module.exports = {
  init: init,
  getTables: getTables,
  close: close,
  saveReviewedDocument: saveReviewedDocument,
  listRecords: listRecords,
  countRecords: countRecords,
  logAudit: logAudit,
  validateReviewedDocument: validateReviewedDocument
};
