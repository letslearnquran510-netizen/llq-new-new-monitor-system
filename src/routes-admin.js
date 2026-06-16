import express from 'express';
import fs from 'node:fs';
import { log } from './logger.js';

const clamp = (v, lo, hi, dflt) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, n));
};

export function adminRoutes(store, cfg) {
  const r = express.Router();

  // All machines with computed online/offline + latest status.
  r.get('/machines', (req, res) => {
    res.json({ machines: store.listMachines(cfg.onlineMs) });
  });

  // Mark machines as "being viewed" so their agents start sending frames.
  // The dashboard calls this repeatedly for the tiles on screen; entries
  // expire, so agents stop sending once you look away.
  r.post('/live', express.json(), (req, res) => {
    const { machineIds, fps, quality, width } = req.body || {};
    if (!Array.isArray(machineIds)) {
      return res.status(400).json({ error: 'machineIds (array) required' });
    }
    const params = {
      fps: clamp(fps, 0.2, 5, 0.5),       // frames per second
      quality: clamp(quality, 2, 31, 10), // ffmpeg q:v — lower = better/bigger
      width: clamp(width, 160, 1920, 420),
    };
    for (const id of machineIds) store.setLive(id, params);
    res.json({ ok: true, params, count: machineIds.length });
  });

  // Latest live frame (JPEG) for one machine.
  r.get('/machines/:id/frame', (req, res) => {
    const f = store.getFrame(req.params.id);
    if (!f) return res.status(404).json({ error: 'no frame' });
    res.setHeader('content-type', 'image/jpeg');
    res.setHeader('cache-control', 'no-store');
    res.end(f.buf);
  });

  // Ask a machine to report its recordings. Result arrives async; poll /listing.
  r.post('/machines/:id/list', (req, res) => {
    if (!store.getMachine(req.params.id)) {
      return res.status(404).json({ error: 'unknown machine' });
    }
    store.enqueue(req.params.id, { id: `list-${Date.now()}`, type: 'list' });
    res.json({ ok: true });
  });

  r.get('/machines/:id/listing', (req, res) => {
    const m = store.getMachine(req.params.id);
    if (!m) return res.status(404).json({ error: 'unknown machine' });
    res.json({ listing: m.listing, listedAt: m.listedAt });
  });

  // Request a specific recording -> creates a job and queues an upload command.
  r.post('/machines/:id/fetch', express.json(), (req, res) => {
    if (!store.getMachine(req.params.id)) {
      return res.status(404).json({ error: 'unknown machine' });
    }
    const file = req.body?.file;
    if (!file) return res.status(400).json({ error: 'file required' });
    const job = store.createJob(req.params.id, file);
    store.enqueue(req.params.id, { id: job.id, type: 'upload', file });
    log.info('Recording requested', req.params.id, file, '->', job.id);
    res.json({ jobId: job.id });
  });

  // Poll a job until ready, then use fileUrl to stream it.
  r.get('/jobs/:jobId', (req, res) => {
    const job = store.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'unknown job' });
    res.json({
      id: job.id,
      status: job.status,
      file: job.file,
      fileUrl: job.status === 'ready' ? `/api/admin/files/${job.id}` : null,
    });
  });

  // Stream the cached recording to the dashboard / <video> element.
  r.get('/files/:jobId', (req, res) => {
    const job = store.getJob(req.params.jobId);
    if (!job || job.status !== 'ready') {
      return res.status(404).json({ error: 'not ready' });
    }
    res.setHeader('content-type', 'video/mp4');
    fs.createReadStream(job.path)
      .on('error', () => res.sendStatus(500))
      .pipe(res);
  });

  return r;
}
