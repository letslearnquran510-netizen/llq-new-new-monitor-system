import fs from 'node:fs';
import path from 'node:path';

let logPath = null;

export function initLogger(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    logPath = path.join(dir, 'server.log');
  } catch { /* best-effort */ }
}

function write(level, args) {
  const line =
    `[${new Date().toISOString()}] [${level}] ` +
    args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  if (level === 'ERROR') console.error(line);
  else console.log(line);
  if (logPath) {
    try { fs.appendFileSync(logPath, line + '\n'); } catch { /* ignore */ }
  }
}

export const log = {
  info: (...a) => write('INFO', a),
  warn: (...a) => write('WARN', a),
  error: (...a) => write('ERROR', a),
};
