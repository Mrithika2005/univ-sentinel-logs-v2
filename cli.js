#!/usr/bin/env node

// univ-sentinel CLI  v2.0
// Usage: npx --yes github:Mrithika2005/univ-sentinel-logs-v2

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SENTINEL_PORT = process.env.SENTINEL_PORT || '4318';
const SENTINEL_URL  = `http://localhost:${SENTINEL_PORT}/sentinel/ingest`;

const C = {
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red:    (s) => `\x1b[31m${s}\x1b[0m`,
  cyan:   (s) => `\x1b[36m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
};

const log = {
  info: (s) => console.log(C.cyan(`[sentinel] ${s}`)),
  ok:   (s) => console.log(C.green(`[sentinel] ✓ ${s}`)),
  warn: (s) => console.log(C.yellow(`[sentinel] ⚠ ${s}`)),
  err:  (s) => console.log(C.red(`[sentinel] ✗ ${s}`)),
};

/* ─────────────────────────────────────────────────────────────
   PYTHON PATCH
   Injects full init_sentinel() call into main.py
───────────────────────────────────────────────────────────── */

const PYTHON_MARKER  = '# ── sentinel-sdk ──';

const PYTHON_SNIPPET = `
${PYTHON_MARKER}
import sys as _sys, os as _os
_sys.path.insert(0, _os.path.join(_os.path.dirname(__file__), 'sentinel-sdk', 'python'))
try:
    from agent import init_sentinel as _init_sentinel
    _sentinel = _init_sentinel(
        service_name=_os.getenv('SENTINEL_SERVICE', 'python-service'),
        clickhouse_host=_os.getenv('CLICKHOUSE_HOST', 'http://localhost:8123'),
        clickhouse_database=_os.getenv('CLICKHOUSE_DATABASE', 'sentinel'),
        clickhouse_table=_os.getenv('CLICKHOUSE_TABLE', 'logs'),
        clickhouse_user=_os.getenv('CLICKHOUSE_USER', ''),
        clickhouse_password=_os.getenv('CLICKHOUSE_PASSWORD', ''),
        debug=_os.getenv('SENTINEL_DEBUG', 'false').lower() == 'true',
        log_level=_os.getenv('LOG_LEVEL', 'INFO'),
    )
except Exception as _e:
    import logging as _logging
    _logging.warning(f'[sentinel] failed to init: {_e}')
# ── /sentinel-sdk ──
`;

function patchPython(filePath) {
  let src = fs.readFileSync(filePath, 'utf-8');
  if (src.includes(PYTHON_MARKER)) {
    log.warn(`${filePath} already patched — skipping`);
    return;
  }
  const lines = src.split('\n');
  let lastImport = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^(import |from )/.test(lines[i])) lastImport = i;
  }
  lines.splice(lastImport + 1, 0, PYTHON_SNIPPET);
  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
  log.ok(`Patched Python: ${filePath}`);
}

/* ─────────────────────────────────────────────────────────────
   NODE.JS PATCH  (index.ts / server.ts / app.ts / main.ts)
   Injects initSentinel() at the very top — before anything else
───────────────────────────────────────────────────────────── */

const NODE_MARKER  = '// ── sentinel-sdk-node ──';

const NODE_SNIPPET = `
${NODE_MARKER}
import { initSentinel as __initSentinel } from './sentinel-sdk/node/agent.ts';
await __initSentinel({
  serviceName:        process.env.SENTINEL_SERVICE        || 'node-service',
  clickhouseHost:     process.env.CLICKHOUSE_HOST         || 'http://localhost:8123',
  clickhouseDatabase: process.env.CLICKHOUSE_DATABASE     || 'sentinel',
  clickhouseTable:    process.env.CLICKHOUSE_TABLE        || 'logs',
  clickhouseUser:     process.env.CLICKHOUSE_USER         || '',
  clickhousePassword: process.env.CLICKHOUSE_PASSWORD     || '',
  debug:              process.env.SENTINEL_DEBUG === 'true',
  logLevel:           process.env.LOG_LEVEL               || 'INFO',
  certCheckHosts:     process.env.SENTINEL_CERT_HOSTS
                        ? process.env.SENTINEL_CERT_HOSTS.split(',').map(h => h.trim())
                        : [],
});
// ── /sentinel-sdk-node ──
`;

// Files that are Node.js entry points (not frontend)
const NODE_ENTRY_NAMES = /^(index|server|app|main)\.[jt]s$/;
// Files we should NOT patch (they are frontend/browser files)
const SKIP_IF_CONTAINS  = ['React', 'ReactDOM', 'createRoot', 'angular', 'NgModule', 'bootstrapModule'];

function isNodeFile(filePath, src) {
  const name = path.basename(filePath);
  if (!NODE_ENTRY_NAMES.test(name)) return false;
  // Skip if it looks like a browser/frontend file
  for (const sig of SKIP_IF_CONTAINS) {
    if (src.includes(sig)) return false;
  }
  return true;
}

function patchNode(filePath) {
  let src = fs.readFileSync(filePath, 'utf-8');
  if (!isNodeFile(filePath, src)) return false;
  if (src.includes(NODE_MARKER)) {
    log.warn(`${filePath} already patched — skipping`);
    return true;
  }
  // Insert after last import line
  const lines = src.split('\n');
  let lastImport = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^import /.test(lines[i])) lastImport = i;
  }
  lines.splice(lastImport + 1, 0, NODE_SNIPPET);
  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
  log.ok(`Patched Node: ${filePath}`);
  return true;
}

/* ─────────────────────────────────────────────────────────────
   BROWSER PATCH  (React App.tsx / App.jsx / Angular app.component.ts)
   Injects initBrowserSentinel() — full browser agent with
   fetch/XHR hooks, web vitals, error tracking, etc.
───────────────────────────────────────────────────────────── */

const BROWSER_MARKER  = '// ── sentinel-sdk-browser ──';

const BROWSER_SNIPPET = `
${BROWSER_MARKER}
import { initBrowserSentinel as __initBrowserSentinel } from './sentinel-sdk/browser/agent.ts';
__initBrowserSentinel({
  serviceName:   (window.__SENTINEL_SERVICE__  || 'browser-app'),
  relayUrl:      (window.__SENTINEL_RELAY__    || '${SENTINEL_URL}'),
  debug:         (window.__SENTINEL_DEBUG__    || false),
  samplingRate:  (window.__SENTINEL_SAMPLING__ || 1.0),
});
// ── /sentinel-sdk-browser ──
`;

// Angular-specific — wraps in a try/catch since it's module-scoped
const ANGULAR_SNIPPET = `
${BROWSER_MARKER}
// @ts-ignore
import { initBrowserSentinel as __initBrowserSentinel } from '../sentinel-sdk/browser/agent.ts';
try {
  __initBrowserSentinel({
    serviceName:  'angular-app',
    relayUrl:     '${SENTINEL_URL}',
    debug:        false,
    samplingRate: 1.0,
  });
} catch(e) { console.warn('[sentinel] init failed', e); }
// ── /sentinel-sdk-browser ──
`;

// React: App.jsx / App.tsx
const REACT_FILE_RE   = /^[Aa]pp\.[jt]sx?$/;
// Angular: app.component.ts / app.module.ts
const ANGULAR_FILE_RE = /^app\.(component|module)\.[jt]s$/;

function patchBrowser(filePath) {
  let src = fs.readFileSync(filePath, 'utf-8');
  if (src.includes(BROWSER_MARKER)) {
    log.warn(`${filePath} already patched — skipping`);
    return;
  }

  const name     = path.basename(filePath);
  const isAngular = ANGULAR_FILE_RE.test(name);
  const snippet  = isAngular ? ANGULAR_SNIPPET : BROWSER_SNIPPET;
  const label    = isAngular ? 'Angular' : 'React/Browser';

  const lines = src.split('\n');
  let lastImport = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/^import /.test(lines[i])) lastImport = i;
  }
  lines.splice(lastImport + 1, 0, snippet);
  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
  log.ok(`Patched ${label}: ${filePath}`);
}

/* ─────────────────────────────────────────────────────────────
   FILE FINDER
───────────────────────────────────────────────────────────── */

const SKIP_DIRS = new Set(['node_modules', '.git', '__pycache__', '.venv', 'dist', 'build', '.next', 'out']);

function findFiles(dir, matcher, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) findFiles(full, matcher, results);
    else if (matcher(entry.name, full)) results.push(full);
  }
  return results;
}

/* ─────────────────────────────────────────────────────────────
   MAIN
───────────────────────────────────────────────────────────── */

console.log(C.bold('\n  univ-sentinel v2.0 — auto-patch\n'));

const cwd = process.cwd();
log.info(`Scanning: ${cwd}\n`);

let patched = 0;

// 1. Python — main.py anywhere in tree
const pyFiles = findFiles(cwd, (n) => n === 'main.py');
if (pyFiles.length === 0) {
  log.warn('No main.py found — skipping Python patch');
} else {
  pyFiles.forEach(f => { patchPython(f); patched++; });
}

// 2. Node.js backend entry points
const nodeFiles = findFiles(cwd, (n) => NODE_ENTRY_NAMES.test(n));
nodeFiles.forEach(f => {
  if (patchNode(f)) patched++;
});
if (patched === 0 && nodeFiles.length === 0) {
  log.warn('No Node.js entry file found (index.ts/server.ts/app.ts/main.ts) — skipping Node patch');
}

// 3. React — App.jsx / App.tsx
const reactFiles = findFiles(cwd, (n) => REACT_FILE_RE.test(n));
if (reactFiles.length === 0) {
  log.warn('No App.jsx/App.tsx found — skipping React patch');
} else {
  reactFiles.forEach(f => { patchBrowser(f); patched++; });
}

// 4. Angular — app.component.ts / app.module.ts
const angularFiles = findFiles(cwd, (n) => ANGULAR_FILE_RE.test(n));
if (angularFiles.length === 0) {
  log.warn('No app.component.ts/app.module.ts found — skipping Angular patch');
} else {
  angularFiles.forEach(f => { patchBrowser(f); patched++; });
}

if (patched === 0) {
  log.err('Nothing patched. Run this from your project root.');
  process.exit(1);
}

console.log('');
log.ok('Done! Make sure ClickHouse + relay server are running:');
console.log(C.cyan(`
  # Start the relay server (from sentinel repo):
  npx tsx server.ts

  # Health check:
  curl http://localhost:${SENTINEL_PORT}/sentinel/health

  # Env vars you can set in your app:
  SENTINEL_SERVICE=my-app
  CLICKHOUSE_HOST=http://localhost:8123
  CLICKHOUSE_DATABASE=sentinel
  SENTINEL_DEBUG=true
  LOG_LEVEL=INFO
`));
