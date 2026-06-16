import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Store } from './store.js';
import { agentAuth, adminAuth } from './auth.js';
import { agentRoutes } from './routes-agent.js';
import { adminRoutes } from './routes-admin.js';
import { initLogger, log } from './logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const cfg = {
  port: parseInt(process.env.PORT || '4000', 10),
  tenantKey: process.env.TENANT_KEY || '',
  adminToken: process.env.ADMIN_TOKEN || '',
  cacheDir: process.env.CACHE_DIR || path.join(__dirname, '..', 'recordings-cache'),
  onlineMs: parseInt(process.env.ONLINE_MS || '60000', 10),
};

if (!cfg.tenantKey) throw new Error('TENANT_KEY env var is required');
if (!cfg.adminToken) throw new Error('ADMIN_TOKEN env var is required');
fs.mkdirSync(cfg.cacheDir, { recursive: true });
initLogger(path.join(__dirname, '..', 'logs'));

export const store = new Store();

export const app = express();
app.disable('x-powered-by');

// Agent API — tenant key. Dashboard API — admin token.
app.use('/api/agent', agentAuth(cfg.tenantKey), agentRoutes(store, cfg));
app.use('/api/admin', adminAuth(cfg.adminToken), adminRoutes(store, cfg));

app.get('/health', (req, res) =>
  res.json({ ok: true, machines: store.machines.size }),
);

// Serve the dashboard from this server. Open the tunnel URL in a browser to
// reach it; it calls this same server's API (same origin, no CORS needed).
const publicDir = path.join(__dirname, '..', 'public');
app.get('/', (req, res) => res.sendFile(path.join(publicDir, 'dashboard.html')));
app.use(express.static(publicDir));

export function start(port = cfg.port) {
  return app.listen(port, () => log.info(`LLQA server listening on :${port}`));
}

// Auto-start in production; tests import { app, start } and control the port.
if (process.env.NODE_ENV !== 'test') start();
