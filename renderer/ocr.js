import { state } from './state.js';
import { normalizeExtraction, getReviewStatusForExtraction, getExtractionNotes } from './utils.js';
import { query, setStatus } from './dom.js';
import { setActiveView } from './queue.js';
import { showToast } from './overlays.js';

let isBatchProcessing = false;
let _ocrRender = () => {};

export function setOcrRenderCallback(fn) {
  _ocrRender = fn;
}

export async function processBatchOCR() {
  if (isBatchProcessing) return;

  const itemsToProcess = state.queue.filter(item => ['queued', 'error'].includes(item.status));
  if (itemsToProcess.length === 0) {
    setStatus('No pending documents to process.', 'error');
    return;
  }

  if (!window.api || !window.api.processOCR) {
    setStatus('OCR bridge is unavailable.', 'error');
    return;
  }

  isBatchProcessing = true;
  const batchContainer = query('batch-progress-container');
  const batchProgressBar = query('batch-progress-bar');
  const batchProgressText = query('batch-progress-text');

  if (batchContainer) batchContainer.classList.add('batch-progress-container', 'is-visible');

  const stepPrep = query('step-preparing');
  const stepRun = query('step-running');
  const stepSave = query('step-saving');

  const updateStep = (stepEl, stepState) => {
    if (!stepEl) return;
    stepEl.className = 'checklist-step';
    const icon = stepEl.querySelector('.step-icon');
    if (stepState === 'pending') {
      if (icon) icon.textContent = 'o';
    } else if (stepState === 'active') {
      stepEl.classList.add('is-active');
      if (icon) icon.textContent = '*';
    } else if (stepState === 'completed') {
      stepEl.classList.add('is-completed');
      if (icon) icon.textContent = 'v';
    }
  };

  setStatus(`Starting batch OCR on ${itemsToProcess.length} documents...`);

  for (let i = 0; i < itemsToProcess.length; i++) {
    const item = itemsToProcess[i];
    state.selectedId = item.id;
    item.status = 'processing';
    item.error = null;

    if (batchProgressText) {
      batchProgressText.textContent = `Processing ${i + 1} of ${itemsToProcess.length}: ${item.fileName}`;
    }
    if (batchProgressBar) {
      batchProgressBar.value = Math.round((i / itemsToProcess.length) * 100);
    }

    _ocrRender();

    // Step 1: Preparing
    updateStep(stepPrep, 'active');
    updateStep(stepRun, 'pending');
    updateStep(stepSave, 'pending');
    await new Promise(r => setTimeout(r, 600));

    // Step 2: Running Model
    updateStep(stepPrep, 'completed');
    updateStep(stepRun, 'active');
    await new Promise(r => setTimeout(r, 400));

    try {
      const rawResult = await window.api.processOCR(item.filePath);
      item.extraction = normalizeExtraction(rawResult);
      item.status = 'review';
      item.reviewStatus = getReviewStatusForExtraction(item.extraction);
      item.notes = getExtractionNotes(item.extraction);
      if (item.extraction.degraded) {
        setStatus(item.notes || 'OCR degraded. Manual review is required.', 'error');
      }

      // Step 3: Saving
      updateStep(stepRun, 'completed');
      updateStep(stepSave, 'active');
      await new Promise(r => setTimeout(r, 500));
      updateStep(stepSave, 'completed');

    } catch (error) {
      item.status = 'error';
      item.error = error.message || 'OCR failed.';
      updateStep(stepRun, 'pending');
      updateStep(stepSave, 'pending');
      setStatus(item.error, 'error');
    }

    _ocrRender();
    await new Promise(r => setTimeout(r, 500));
  }

  if (batchProgressBar) batchProgressBar.value = 100;
  if (batchProgressText) batchProgressText.textContent = `Completed batch processing of ${itemsToProcess.length} files.`;

  isBatchProcessing = false;
  setStatus('Batch processing complete.', 'success');

  setActiveView('review');
  _ocrRender();

  setTimeout(() => {
    if (batchContainer) batchContainer.classList.remove('is-visible');
  }, 3000);
}

export async function processSelectedOCR() {
  await processBatchOCR();
}

export function setupModelDownloadUI() {
  const btn = query('download-model-btn');
  const statusEl = query('model-download-status');
  const progressContainer = query('model-progress-container');
  const progressBar = query('model-progress-bar');
  const progressDetail = query('model-progress-detail');
  if (!btn || !window.api || !window.api.downloadModel) return;

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Downloading...';
    if (statusEl) statusEl.textContent = 'Starting download...';
    if (progressContainer) progressContainer.classList.add('is-visible');
    if (progressBar) progressBar.value = 0;
    if (progressDetail) progressDetail.textContent = '0% (Connecting...)';
    showToast('Starting OCR Model download...');

    try {
      await window.api.downloadModel();
      btn.textContent = 'Download OCR Model';
      btn.disabled = false;
      if (statusEl) statusEl.textContent = 'Ready (Cached)';
      if (progressContainer) progressContainer.classList.remove('is-visible');
      showToast('OCR Model cached successfully!');
    } catch (error) {
      btn.textContent = 'Download OCR Model';
      btn.disabled = false;
      if (statusEl) statusEl.textContent = 'Failed';
      showToast(`Download failed: ${error.message}`);
    }
  });

  if (window.api.onDownloadStatus) {
    window.api.onDownloadStatus((progress) => {
      const lastText = progress.trim();
      if (!lastText) return;

      const percentMatch = lastText.match(/(\d+)%/);
      const sizeMatch = lastText.match(/([\d\.]+[GMK]B?)\/([\d\.]+[GMK]B?)/i);
      const speedMatch = lastText.match(/([\d\.]+\s*[GMK]B\/s)/i);

      if (percentMatch) {
        const percent = parseInt(percentMatch[1], 10);
        if (progressBar) progressBar.value = percent;
        
        let details = `${percent}%`;
        if (sizeMatch) details += ` (${sizeMatch[0]})`;
        if (speedMatch) details += ` @ ${speedMatch[1]}`;
        
        if (progressDetail) progressDetail.textContent = details;
        if (statusEl) statusEl.textContent = 'Downloading weights...';
      } else {
        const lines = lastText.split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length > 0) {
          const currentTask = lines[lines.length - 1];
          if (statusEl) statusEl.textContent = currentTask;
          if (progressDetail && !currentTask.includes('%')) {
            progressDetail.textContent = currentTask;
          }
        }
      }
    });
  }
}
