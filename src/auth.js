// Agents authenticate with the shared enrollment (tenant) key — this is what
// "paired to your account" means: an agent with the wrong key is rejected.
export function agentAuth(tenantKey) {
  return (req, res, next) => {
    const key = req.get('x-tenant-key') || req.query.tenantKey;
    if (key !== tenantKey) return res.status(401).json({ error: 'bad tenant key' });
    next();
  };
}

// The dashboard authenticates with a separate admin token. Bearer header for
// API calls; query token is allowed so a <video> element can stream a file
// (browsers can't set headers on media requests). Phase 1 — swap for signed,
// short-lived URLs later if you want to keep the token out of URLs/logs.
export function adminAuth(adminToken) {
  return (req, res, next) => {
    const h = req.get('authorization') || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : req.query.token;
    if (token !== adminToken) return res.status(401).json({ error: 'unauthorized' });
    next();
  };
}
