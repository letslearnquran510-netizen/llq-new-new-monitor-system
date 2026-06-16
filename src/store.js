// In-memory state. Rebuilt from heartbeats on restart (agents re-check-in within
// one interval), while cached recording files persist on disk. Fine for ~50 PCs.
export class Store {
  constructor() {
    this.machines = new Map(); // machineId -> machine record
    this.commands = new Map(); // machineId -> [ {id, type, file?} ]
    this.jobs = new Map();     // jobId -> { id, machineId, file, status, path }
    this.frames = new Map();   // machineId -> { buf, ts } (latest live screenshot)
    this.live = new Map();     // machineId -> { fps, quality, width, expires }
  }

  // Latest live frame for a machine.
  setFrame(machineId, buf) { this.frames.set(machineId, { buf, ts: Date.now() }); }
  getFrame(machineId, maxAgeMs = 12000) {
    const f = this.frames.get(machineId);
    if (!f || Date.now() - f.ts > maxAgeMs) return null;
    return f;
  }

  // "This machine is being viewed." Expires unless the dashboard keeps
  // refreshing it, so agents stop sending frames once nobody is watching.
  setLive(machineId, params, ttlMs = 15000) {
    this.live.set(machineId, { ...params, expires: Date.now() + ttlMs });
  }
  getLiveDirective(machineId) {
    const l = this.live.get(machineId);
    if (!l || Date.now() > l.expires) return { on: false };
    return { on: true, fps: l.fps, quality: l.quality, width: l.width };
  }

  upsertMachine(hb) {
    const prev = this.machines.get(hb.machineId) || {};
    this.machines.set(hb.machineId, {
      machineId: hb.machineId,
      hostname: hb.hostname || prev.hostname || hb.machineId,
      version: hb.version || prev.version || null,
      lastSeen: Date.now(),
      activity: hb.activity ?? null,
      activityMeta: hb.activityMeta ?? null,
      recording: hb.recording ?? null,
      diskFreeBytes: hb.diskFreeBytes ?? null,
      listing: prev.listing || null,
      listedAt: prev.listedAt || null,
    });
  }

  listMachines(onlineMs) {
    const now = Date.now();
    return [...this.machines.values()].map((m) => ({
      ...m,
      online: now - m.lastSeen < onlineMs,
    }));
  }

  getMachine(id) { return this.machines.get(id) || null; }

  enqueue(machineId, cmd) {
    const q = this.commands.get(machineId) || [];
    q.push(cmd);
    this.commands.set(machineId, q);
  }

  // At-most-once delivery: hand the agent its pending commands and clear them.
  drainCommands(machineId) {
    const q = this.commands.get(machineId) || [];
    this.commands.set(machineId, []);
    return q;
  }

  setListing(machineId, files) {
    const m = this.machines.get(machineId);
    if (m) { m.listing = files; m.listedAt = Date.now(); }
  }

  createJob(machineId, file) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const job = { id, machineId, file, status: 'pending', path: null };
    this.jobs.set(id, job);
    return job;
  }

  getJob(id) { return this.jobs.get(id) || null; }

  setJobReady(id, filePath) {
    const j = this.jobs.get(id);
    if (j) { j.status = 'ready'; j.path = filePath; }
  }
}
