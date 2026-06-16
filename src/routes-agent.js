import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { log } from './logger.js';

export function agentRoutes(store, cfg) {
  const r = express.Router();

  // Check-in: record status, hand back pending commands + the live directive
  // (whether this machine is currently being viewed, and at what fps/quality).
  r.post('/heartbeat', express.json({ limit: '1mb' }), (req, res) => {
    const hb = req.body || {};
    if (!hb.machineId) return res.status(400).json({ error: 'machineId required' });
    store.upsertMachine(hb);
    res.json({
      ok: true,
      commands: store.drainCommands(hb.machineId),
      live: store.getLiveDirective(hb.machineId),
    });
  });

  // Agent pushes a live screenshot frame (only while it's being viewed).
  r.post(
    '/frame',
    express.raw({ type: 'application/octet-stream', limit: '10mb' }),
    (req, res) => {
      const machineId = req.query.machineId;
      if (!machineId) return res.status(400).json({ error: 'machineId required' });
      store.setFrame(machineId, req.body);
      res.json({ ok: true });
    },
  );

  // Agent reports its recording file index (answer to a 'list' command).
  r.post('/listing', express.json({ limit: '5mb' }), (req, res) => {
    const { machineId, files } = req.body || {};
    if (!machineId || !Array.isArray(files)) {
      return res.status(400).json({ error: 'bad listing' });
    }
    store.setListing(machineId, files);
    res.json({ ok: true });
  });

  // Agent uploads a requested segment (answer to an 'upload' command).
  // Raw bytes; commandId == jobId.
  r.post(
    '/upload',
    express.raw({ type: 'application/octet-stream', limit: '4gb' }),
    (req, res) => {
      const jobId = req.query.commandId;
      const job = store.getJob(jobId);
      if (!job) return res.status(404).json({ error: 'unknown job' });
      const out = path.join(cfg.cacheDir, `${jobId}.mp4`);
      try {
        fs.writeFileSync(out, req.body);
        store.setJobReady(jobId, out);
        log.info('Upload stored', jobId, `${(req.body.length / 1048576).toFixed(1)}MB`);
        res.json({ ok: true });
      } catch (e) {
        log.error('Upload write failed', e.message);
        res.status(500).json({ error: 'write failed' });
      }
    },
  );

  return r;
}
