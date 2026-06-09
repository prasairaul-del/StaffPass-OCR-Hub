const { spawn, spawnSync } = require('child_process');
const path = require('path');

let child = null;
let buffer = '';
const pending = [];
const DEFAULT_TIMEOUT_MS = 180000;
const PYTHON_CANDIDATES = ['python', 'python3', 'py'];

function getSidecarDir() {
  if (process.versions.electron) {
    try {
      const electron = require('electron');
      if (electron && electron.app && electron.app.isPackaged) {
        return path.join(process.resourcesPath, 'sidecar');
      }
    } catch (e) {
      // Safe fallback
    }
  }
  return path.join(__dirname, 'sidecar');
}

function resolvePython() {
  if (process.env.PYTHON) return process.env.PYTHON;

  for (const candidate of PYTHON_CANDIDATES) {
    try {
      const result = spawnSync(candidate, ['--version'], { stdio: 'ignore' });
      if (result.status === 0) return candidate;
    } catch {
      // Not found; try next candidate
    }
  }

  return 'python';
}
function validatePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Payload must be an object');
  }
  if (!payload.action || !['ocr', 'preview', 'exit'].includes(payload.action)) {
    throw new Error('Invalid action');
  }
  if (['ocr', 'preview'].includes(payload.action)) {
    if (!payload.file_path || typeof payload.file_path !== 'string') {
      throw new Error('Missing or invalid file_path');
    }
  }
}


function startChild() {
  const scriptPath = path.join(getSidecarDir(), 'ocr_sidecar.py');
  const python = resolvePython();
  const env = { OCR_ENGINE: 'glm-ocr', ...process.env };
  child = spawn(python, [scriptPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env
  });

  child.stdout.on('data', (chunk) => {
    buffer += chunk.toString();
    flushStdoutBuffer();
  });

  child.stderr.on('data', (chunk) => {
    console.error(`python error: ${chunk}`);
  });

  child.on('error', (error) => {
    rejectPending(error);
    child = null;
    buffer = '';
  });

  child.on('exit', (code, signal) => {
    child = null;
    buffer = '';

    // If premature exit (non-zero code, or while we had active requests and signal)
    if ((code !== 0 || signal !== null) && pending.length > 0) {
      const retryable = [];
      const nonRetryable = [];
      pending.forEach((req) => {
        req.attempts = (req.attempts || 0) + 1;
        if (req.attempts < 3) {
          retryable.push(req);
        } else {
          nonRetryable.push(req);
        }
      });

      nonRetryable.forEach((req) => {
        removeRequest(req);
        clearTimeout(req.timeout);
        req.reject(new Error(`OCR sidecar exited with code ${code ?? 'null'} and signal ${signal ?? 'null'}`));
      });

      if (retryable.length > 0) {
        console.warn(`OCR sidecar exited unexpectedly (code: ${code}, signal: ${signal}). Attempting auto-restart...`);
        try {
          const newChild = getChild();
          retryable.forEach((req) => {
            newChild.stdin.write(`${JSON.stringify(req.payload)}\n`, (err) => {
              if (err) {
                removeRequest(req);
                clearTimeout(req.timeout);
                req.reject(err);
              }
            });
          });
          return;
        } catch (err) {
          console.error('Failed to auto-restart OCR sidecar:', err);
        }
      }
    }

    const error = new Error(`OCR sidecar exited with code ${code ?? 'null'} and signal ${signal ?? 'null'}`);
    rejectPending(error);
  });

  return child;
}

function getChild() {
  return child || startChild();
}

function flushStdoutBuffer() {
  let newlineIndex = buffer.indexOf('\n');
  while (newlineIndex !== -1) {
    const line = buffer.slice(0, newlineIndex).trim();
    buffer = buffer.slice(newlineIndex + 1);

    if (line && pending.length > 0) {
      const request = pending.shift();
      clearTimeout(request.timeout);
      settleResponse(line, request);
    }

    newlineIndex = buffer.indexOf('\n');
  }
}

function settleResponse(line, request) {
  try {
    const response = JSON.parse(line);
    if (response.status === 'success') {
      const data = request.type === 'ocr' ? normalizeOcrResponse(response.data) : response.data;
      request.resolve(data);
      return;
    }
    request.reject(new Error(response.message || 'OCR failed'));
  } catch (error) {
    request.reject(error);
  }
}

function normalizeOcrResponse(data) {
  if (data && typeof data === 'object' && Object.prototype.hasOwnProperty.call(data, 'ok') && data.data) {
    return {
      ok: Boolean(data.ok),
      degraded: Boolean(data.degraded),
      engine: data.engine || 'unknown',
      warnings: Array.isArray(data.warnings) ? data.warnings : [],
      data: data.data || {}
    };
  }

  return {
    ok: true,
    degraded: false,
    engine: process.env.OCR_ENGINE || 'legacy',
    warnings: [],
    data: data || {}
  };
}

function runOCR(filePath) {
  return new Promise((resolve, reject) => {
    const payload = { action: 'ocr', file_path: filePath };
    try {
      validatePayload(payload);
    } catch (validationError) {
      return reject(validationError);
    }
    const py = getChild();
    const timeoutMs = Number(process.env.OCR_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
    const request = {
      type: 'ocr',
      payload,
      resolve,
      reject,
      timeout: setTimeout(() => {
        removeRequest(request);
        reject(new Error(`OCR request timed out after ${timeoutMs}ms`));
      }, timeoutMs)
    };

    pending.push(request);
    py.stdin.write(`${JSON.stringify(payload)}\n`, (error) => {
      if (!error) return;
      removeRequest(request);
      clearTimeout(request.timeout);
      reject(error);
    });
  });
}

function stop() {
  if (!child) return;
  rejectPending(new Error('OCR sidecar stopped'));
  const py = child;
  child = null;
  buffer = '';

  const payload = { action: 'exit' };
  try {
    validatePayload(payload);
    py.stdin.write(`${JSON.stringify(payload)}\n`);
  } catch (err) {
    console.error('Failed to send exit action:', err);
  }
  setTimeout(() => {
    try {
      if (py.exitCode === null) {
        py.kill('SIGKILL');
      }
    } catch (_err) {}
  }, 500).unref();
}

function isRunning() {
  return Boolean(child && !child.killed);
}

function removeRequest(request) {
  const requestIndex = pending.indexOf(request);
  if (requestIndex !== -1) {
    pending.splice(requestIndex, 1);
  }
}

function rejectPending(error) {
  while (pending.length > 0) {
    const request = pending.shift();
    clearTimeout(request.timeout);
    request.reject(error);
  }
}

function downloadModel(onProgress) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(getSidecarDir(), 'download_model.py');
    const python = resolvePython();
    const env = { OCR_ENGINE: 'glm-ocr', ...process.env };
    const childProcess = spawn(python, [scriptPath], { env });

    childProcess.stdout.on('data', (chunk) => {
      if (typeof onProgress === 'function') {
        onProgress(chunk.toString());
      }
    });

    childProcess.stderr.on('data', (chunk) => {
      if (typeof onProgress === 'function') {
        onProgress(chunk.toString());
      }
    });

    childProcess.on('error', (err) => {
      reject(err);
    });

    childProcess.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Download model exited with code ${code}`));
      }
    });
  });
}

function previewPdfPage(filePath) {
  return new Promise((resolve, reject) => {
    const payload = { action: 'preview', file_path: filePath };
    try {
      validatePayload(payload);
    } catch (validationError) {
      return reject(validationError);
    }
    const py = getChild();
    const timeoutMs = Number(process.env.PDF_PREVIEW_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
    const request = {
      type: 'preview',
      payload,
      resolve,
      reject,
      timeout: setTimeout(() => {
        removeRequest(request);
        reject(new Error(`PDF preview request timed out after ${timeoutMs}ms`));
      }, timeoutMs)
    };

    pending.push(request);
    py.stdin.write(`${JSON.stringify(payload)}\n`, (error) => {
      if (!error) return;
      removeRequest(request);
      clearTimeout(request.timeout);
      reject(error);
    });
  });
}

module.exports = { runOCR, stop, isRunning, downloadModel, previewPdfPage, normalizeOcrResponse };
