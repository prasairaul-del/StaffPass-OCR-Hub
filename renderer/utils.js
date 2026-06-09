export function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

export function getConfidenceStatus(score) {
  const value = Number(score) || 0;
  if (value >= 95) return 'Trusted';
  if (value >= 80) return 'Review Recommended';
  return 'Manual Review Required';
}

export function validateReviewData(data) {
  const errors = [];
  if (!String(data.first_name || '').trim()) errors.push('First name is required.');
  if (!String(data.last_name || '').trim()) errors.push('Last name is required.');
  if (!String(data.doc_type || '').trim()) errors.push('Document type is required.');
  if (!String(data.doc_number || '').trim()) errors.push('Document number is required.');
  
  const expiry = String(data.expiry_date || '').trim();
  if (expiry && !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) {
    errors.push('Expiry date format must be YYYY-MM-DD.');
  }
  return errors;
}

export function normalizeExtraction(result = {}) {
  const structured = result && typeof result === 'object' && Object.prototype.hasOwnProperty.call(result, 'data');
  const data = structured ? (result.data || {}) : result;
  return {
    first_name: data.first_name || '',
    last_name: data.last_name || '',
    doc_type: data.doc_type || '',
    doc_number: data.doc_number || '',
    expiry_date: data.expiry_date || '',
    phone_number: data.phone_number || '',
    confidence_score: Number(data.confidence_score || data.confidence || 0),
    notes: data.notes || '',
    ok: structured ? Boolean(result.ok) : true,
    degraded: structured ? Boolean(result.degraded) : false,
    engine: structured ? (result.engine || 'unknown') : 'legacy',
    warnings: structured && Array.isArray(result.warnings) ? result.warnings : []
  };
}

export function getReviewStatusForExtraction(extraction) {
  if (extraction && extraction.degraded) return 'Manual Review Required';
  return getConfidenceStatus(extraction?.confidence_score || 0);
}

export function getExtractionNotes(extraction) {
  if (!extraction) return '';
  const warnings = Array.isArray(extraction.warnings) ? extraction.warnings.filter(Boolean) : [];
  if (warnings.length > 0) return warnings.join(' ');
  return extraction.notes || '';
}

export function createQueueItem(filePath, fileSize = null) {
  const fileName = filePath.split(/[\\/]/).pop() || filePath;
  let sizeStr = 'Unknown';
  if (fileSize !== null) {
    if (fileSize < 1024) sizeStr = `${fileSize} B`;
    else if (fileSize < 1024 * 1024) sizeStr = `${(fileSize / 1024).toFixed(1)} KB`;
    else sizeStr = `${(fileSize / (1024 * 1024)).toFixed(1)} MB`;
  }
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    filePath,
    fileName,
    fileSize: sizeStr,
    source: filePath,
    receivedAt: new Date().toLocaleString(),
    status: 'queued',
    reviewStatus: 'Pending Review',
    extraction: null,
    error: null
  };
}

export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}
