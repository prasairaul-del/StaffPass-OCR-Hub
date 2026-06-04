const { spawn, spawnSync } = require('child_process');
const path = require('path');

let child = null;
let buffer = '';
const pending = [];
const DEFAULT_TIMEOUT_MS = 30000;
const PYTHON_CANDIDATES = ['python', 'python3', 'py'];

function resolvePython() {
  if (process.env.PYTHON) return process.env.PYTHON;

  for (const candidate of PYTHON_CANDIDATES) {
    try {
      const result = spawnSync(candidate, ['--version'], { stdio: 'ignore' });
      if (result.status === 0) return candidate;
    } catch {
      // Not found — try next candidate
    }
  }

  return 'python';
}

function startChild() {
  const scriptPath = path.join(__dirname, 'sidecar', 'ocr_sidecar.py');
  const python = resolvePython();
  child = spawn(python, [scriptPath], {
    stdio: ['pipe', 'pipe', 'pipe']
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
    const error = new Error(`OCR sidecar exited with code ${code ?? 'null'} and signal ${signal ?? 'null'}`);
    child = null;
    buffer = '';
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
      request.resolve(response.data);
      return;
    }
    request.reject(new Error(response.message || 'OCR failed'));
  } catch (error) {
    request.reject(error);
  }
}

function runOCR(filePath) {
  return new Promise((resolve, reject) => {
    const py = getChild();
    const timeoutMs = Number(process.env.OCR_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
    const request = {
      resolve,
      reject,
      timeout: setTimeout(() => {
        removeRequest(request);
        reject(new Error(`OCR request timed out after ${timeoutMs}ms`));
      }, timeoutMs)
    };

    pending.push(request);
    py.stdin.write(`${JSON.stringify({ action: 'ocr', file_path: filePath })}\n`, (error) => {
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

  py.stdin.write(`${JSON.stringify({ action: 'exit' })}\n`);
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

module.exports = { runOCR, stop, isRunning };
