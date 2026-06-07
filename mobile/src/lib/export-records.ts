import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { csvEscape } from './validators';
import type { StaffPassRecord } from './types';

const columns: Array<[keyof StaffPassRecord, string]> = [
  ['firstName', 'First Name'],
  ['lastName', 'Last Name'],
  ['phoneNumber', 'Phone Number'],
  ['docType', 'Document Type'],
  ['docNumber', 'Document Number'],
  ['expiryDate', 'Expiry Date'],
  ['confidenceScore', 'Confidence Score'],
  ['reviewStatus', 'Review Status'],
  ['engine', 'Engine'],
  ['notes', 'Notes'],
  ['createdAt', 'Created At']
];

export function recordsToCsv(records: StaffPassRecord[]): string {
  const rows = [
    columns.map(([, heading]) => heading),
    ...records.map((record) => columns.map(([key]) => record[key]))
  ];
  return rows.map((row) => row.map(csvEscape).join(',')).join('\r\n');
}

export async function shareCsv(records: StaffPassRecord[]): Promise<string> {
  const csv = recordsToCsv(records);
  const date = new Date().toISOString().slice(0, 10);
  const file = new File(Paths.document, `staffpass-records-${date}.csv`);
  file.create({ overwrite: true });
  file.write(csv);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'text/csv',
      dialogTitle: 'Export StaffPass records'
    });
  }

  return file.uri;
}
