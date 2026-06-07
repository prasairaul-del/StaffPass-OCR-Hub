import * as SQLite from 'expo-sqlite';
import type { ReviewStatus, StaffPassDraft, StaffPassRecord } from './types';
import { clampConfidence, validateDraft } from './validators';

type DbRecord = {
  id: number;
  file_uri: string;
  file_name: string;
  mime_type: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  doc_type: string;
  doc_number: string;
  expiry_date: string;
  confidence_score: number;
  notes: string;
  review_status: ReviewStatus;
  warnings_json: string;
  engine: string;
  created_at: string;
  updated_at: string;
};

const db = SQLite.openDatabaseSync('staffpass-mobile.db');

export function initializeDatabase() {
  db.execSync(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_uri TEXT NOT NULL CHECK (length(trim(file_uri)) > 0),
      file_name TEXT NOT NULL CHECK (length(trim(file_name)) > 0),
      mime_type TEXT NOT NULL,
      first_name TEXT NOT NULL CHECK (length(trim(first_name)) > 0),
      last_name TEXT NOT NULL CHECK (length(trim(last_name)) > 0),
      phone_number TEXT,
      doc_type TEXT NOT NULL CHECK (length(trim(doc_type)) > 0),
      doc_number TEXT NOT NULL CHECK (length(trim(doc_number)) > 0),
      expiry_date TEXT CHECK (expiry_date = '' OR expiry_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
      confidence_score INTEGER NOT NULL DEFAULT 0 CHECK (confidence_score BETWEEN 0 AND 100),
      notes TEXT,
      review_status TEXT NOT NULL CHECK (review_status IN ('Pending Review', 'Reviewed', 'Approved', 'Rejected', 'Corrected')),
      warnings_json TEXT NOT NULL DEFAULT '[]',
      engine TEXT NOT NULL DEFAULT 'mobile-manual-review',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    INSERT OR IGNORE INTO schema_migrations (version) VALUES (1);
  `);
}

function mapRecord(row: DbRecord): StaffPassRecord {
  let warnings: string[] = [];
  try {
    const parsed = JSON.parse(row.warnings_json);
    warnings = Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    warnings = [];
  }

  return {
    id: row.id,
    fileUri: row.file_uri,
    fileName: row.file_name,
    mimeType: row.mime_type,
    firstName: row.first_name,
    lastName: row.last_name,
    phoneNumber: row.phone_number,
    docType: row.doc_type,
    docNumber: row.doc_number,
    expiryDate: row.expiry_date,
    confidenceScore: row.confidence_score,
    notes: row.notes,
    reviewStatus: row.review_status,
    warnings,
    engine: row.engine,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function listRecords(): StaffPassRecord[] {
  return db.getAllSync<DbRecord>('SELECT * FROM records ORDER BY datetime(updated_at) DESC, id DESC').map(mapRecord);
}

export function saveRecord(draft: StaffPassDraft, status: ReviewStatus): number {
  const record = {
    ...draft,
    reviewStatus: status,
    confidenceScore: clampConfidence(draft.confidenceScore)
  };
  const errors = validateDraft(record);
  if (errors.length > 0) {
    throw new Error(errors.join(' '));
  }

  const result = db.runSync(
    `INSERT INTO records (
      file_uri,
      file_name,
      mime_type,
      first_name,
      last_name,
      phone_number,
      doc_type,
      doc_number,
      expiry_date,
      confidence_score,
      notes,
      review_status,
      warnings_json,
      engine
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      record.fileUri,
      record.fileName,
      record.mimeType,
      record.firstName.trim(),
      record.lastName.trim(),
      record.phoneNumber.trim(),
      record.docType.trim(),
      record.docNumber.trim(),
      record.expiryDate.trim(),
      record.confidenceScore,
      record.notes.trim(),
      status,
      JSON.stringify(record.warnings),
      record.engine
    ]
  );

  return result.lastInsertRowId;
}
