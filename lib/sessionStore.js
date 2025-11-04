const crypto = require('crypto');

const DEFAULT_TTL_MS = parseInt(process.env.SESSION_TTL_MS, 10) || 6 * 60 * 60 * 1000; // 6h

const sessions = new Map();

function purgeExpired() {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (session.expiresAt <= now) {
      sessions.delete(token);
    }
  }
}

function createSession(type, payload = {}, ttlMs = DEFAULT_TTL_MS) {
  purgeExpired();
  const token = crypto.randomBytes(48).toString('hex');
  const expiresAt = Date.now() + ttlMs;
  const session = { token, type, ...payload, expiresAt };
  sessions.set(token, session);
  return session;
}

function getSession(token) {
  if (!token) return null;
  purgeExpired();
  const session = sessions.get(token);
  if (!session) {
    return null;
  }
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session;
}

function revokeSession(token) {
  sessions.delete(token);
}

function updateSession(token, updates = {}) {
  const session = sessions.get(token);
  if (!session) return null;
  Object.assign(session, updates);
  sessions.set(token, session);
  return session;
}

module.exports = {
  createSession,
  getSession,
  revokeSession,
  updateSession,
  purgeExpired,
};
