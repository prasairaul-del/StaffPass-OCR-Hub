import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { captureImage, pickDocumentFile, pickImageFromLibrary } from '@/lib/documents';
import { shareCsv } from '@/lib/export-records';
import { runManualReviewOcr } from '@/lib/ocr';
import { initializeDatabase, listRecords, saveRecord } from '@/lib/storage';
import type { IntakeDocument, ReviewStatus, StaffPassDraft, StaffPassRecord } from '@/lib/types';
import { validateDraft } from '@/lib/validators';

type QueueState = 'idle' | 'running';

type AppContextValue = {
  currentDraft: StaffPassDraft | null;
  filteredRecords: StaffPassRecord[];
  queueState: QueueState;
  records: StaffPassRecord[];
  search: string;
  validationErrors: string[];
  exportRecords: () => Promise<void>;
  importFromCamera: () => Promise<void>;
  importFromDocuments: () => Promise<void>;
  importFromLibrary: () => Promise<void>;
  markCurrentRejected: () => Promise<void>;
  refreshRecords: () => void;
  runOcrForCurrent: () => Promise<void>;
  saveCurrentDraft: (status: ReviewStatus) => Promise<void>;
  setDraftField: <K extends keyof StaffPassDraft>(field: K, value: StaffPassDraft[K]) => void;
  setSearch: (value: string) => void;
};

const AppContext = createContext<AppContextValue | null>(null);

function createPendingDraft(document: IntakeDocument): StaffPassDraft {
  return {
    ...document,
    firstName: '',
    lastName: '',
    phoneNumber: '',
    docType: document.mimeType === 'application/pdf' ? 'PDF Document' : 'Image Document',
    docNumber: '',
    expiryDate: '',
    confidenceScore: 0,
    notes: '',
    reviewStatus: 'Pending Review',
    warnings: ['Run OCR preparation or enter details manually before approval.'],
    engine: 'not-run'
  };
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [currentDraft, setCurrentDraft] = useState<StaffPassDraft | null>(null);
  const [records, setRecords] = useState<StaffPassRecord[]>([]);
  const [search, setSearch] = useState('');
  const [queueState, setQueueState] = useState<QueueState>('idle');

  const refreshRecords = () => {
    try {
      setRecords(listRecords());
    } catch (error) {
      Alert.alert('Records unavailable', error instanceof Error ? error.message : 'Unable to load records.');
    }
  };

  useEffect(() => {
    initializeDatabase();
    refreshRecords();
  }, []);

  async function setDocument(document: IntakeDocument | null) {
    if (!document) return;
    setCurrentDraft(createPendingDraft(document));
  }

  async function importFromCamera() {
    await setDocument(await captureImage());
  }

  async function importFromDocuments() {
    await setDocument(await pickDocumentFile());
  }

  async function importFromLibrary() {
    await setDocument(await pickImageFromLibrary());
  }

  async function runOcrForCurrent() {
    if (!currentDraft) return;
    setQueueState('running');
    try {
      const response = await runManualReviewOcr(currentDraft);
      setCurrentDraft({
        ...currentDraft,
        ...response.data,
        warnings: response.warnings,
        engine: response.engine,
        reviewStatus: 'Pending Review'
      });
    } finally {
      setQueueState('idle');
    }
  }

  function setDraftField<K extends keyof StaffPassDraft>(field: K, value: StaffPassDraft[K]) {
    setCurrentDraft((draft) => (draft ? { ...draft, [field]: value } : draft));
  }

  async function saveCurrentDraft(status: ReviewStatus) {
    if (!currentDraft) return;
    try {
      saveRecord(currentDraft, status);
      setCurrentDraft(null);
      refreshRecords();
    } catch (error) {
      Alert.alert('Record not saved', error instanceof Error ? error.message : 'Review validation failed.');
    }
  }

  async function markCurrentRejected() {
    if (!currentDraft) return;
    const rejected = {
      ...currentDraft,
      firstName: currentDraft.firstName || 'Rejected',
      lastName: currentDraft.lastName || 'Document',
      docType: currentDraft.docType || 'Unknown',
      docNumber: currentDraft.docNumber || `REJECTED-${Date.now()}`,
      notes: currentDraft.notes || 'Rejected during mobile review.'
    };
    try {
      saveRecord(rejected, 'Rejected');
      setCurrentDraft(null);
      refreshRecords();
    } catch (error) {
      Alert.alert('Rejection not saved', error instanceof Error ? error.message : 'Review validation failed.');
    }
  }

  async function exportRecords() {
    try {
      await shareCsv(records);
    } catch (error) {
      Alert.alert('Export failed', error instanceof Error ? error.message : 'Unable to export records.');
    }
  }

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return records;
    return records.filter((record) => [
      record.firstName,
      record.lastName,
      record.docType,
      record.docNumber,
      record.reviewStatus
    ].join(' ').toLowerCase().includes(query));
  }, [records, search]);

  const validationErrors = useMemo(() => (
    currentDraft ? validateDraft(currentDraft) : []
  ), [currentDraft]);

  const value: AppContextValue = {
    currentDraft,
    filteredRecords,
    queueState,
    records,
    search,
    validationErrors,
    exportRecords,
    importFromCamera,
    importFromDocuments,
    importFromLibrary,
    markCurrentRejected,
    refreshRecords,
    runOcrForCurrent,
    saveCurrentDraft,
    setDraftField,
    setSearch
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppState() {
  const value = useContext(AppContext);
  if (!value) throw new Error('useAppState must be used inside AppProvider');
  return value;
}
