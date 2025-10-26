const crypto = require('crypto');

const CODE_TTL_MS = parseInt(process.env.SMS_CODE_TTL_MS, 10) || 5 * 60 * 1000;
const TOKEN_TTL_MS = parseInt(process.env.SSO_TOKEN_TTL_MS, 10) || 60 * 60 * 1000;
const RESEND_INTERVAL_MS = parseInt(process.env.SMS_RESEND_INTERVAL_MS, 10) || 60 * 1000;
const MAX_ATTEMPTS = parseInt(process.env.SMS_MAX_ATTEMPTS, 10) || 5;

const pendingCodes = new Map();
const activeTokens = new Map();

function purgeExpired() {
  const now = Date.now();

  for (const [phone, entry] of pendingCodes) {
    if (entry.expiresAt <= now) {
      pendingCodes.delete(phone);
    }
  }

  for (const [token, entry] of activeTokens) {
    if (entry.expiresAt <= now) {
      activeTokens.delete(token);
    }
  }
}

function normalizePhone(phone) {
  if (!phone) {
    return null;
  }

  const trimmed = String(phone).trim();
  if (!trimmed) {
    return null;
  }

  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) {
    return null;
  }

  const normalized = hasPlus ? `+${digits}` : digits;
  if (!/^\+?\d{7,15}$/.test(normalized)) {
    return null;
  }

  return normalized;
}

function canRequestCode(phone) {
  purgeExpired();
  const entry = pendingCodes.get(phone);
  if (!entry) {
    return { allowed: true };
  }

  const elapsed = Date.now() - entry.lastSentAt;
  if (elapsed >= RESEND_INTERVAL_MS) {
    return { allowed: true };
  }

  return { allowed: false, retryAfter: Math.ceil((RESEND_INTERVAL_MS - elapsed) / 1000) };
}

function createVerificationCode(phone) {
  purgeExpired();

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = Date.now() + CODE_TTL_MS;
  pendingCodes.set(phone, {
    code,
    expiresAt,
    attempts: 0,
    lastSentAt: Date.now(),
  });

  return { code, expiresAt };
}

function getPendingCode(phone) {
  purgeExpired();
  return pendingCodes.get(phone) || null;
}

function verifyCode(phone, submittedCode) {
  purgeExpired();
  const entry = pendingCodes.get(phone);
  if (!entry) {
    return { ok: false, reason: 'code_not_found' };
  }

  if (entry.expiresAt <= Date.now()) {
    pendingCodes.delete(phone);
    return { ok: false, reason: 'code_expired' };
  }

  if (entry.code !== submittedCode) {
    entry.attempts += 1;
    if (entry.attempts >= MAX_ATTEMPTS) {
      pendingCodes.delete(phone);
    }
    return { ok: false, reason: 'code_invalid', attempts: entry.attempts };
  }

  pendingCodes.delete(phone);
  return { ok: true };
}

function clearPendingCode(phone) {
  pendingCodes.delete(phone);
}

function issueToken(phone) {
  purgeExpired();
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  activeTokens.set(token, { phone, expiresAt });
  return { token, expiresAt };
}

function validateToken(token) {
  purgeExpired();
  if (!token) {
    return null;
  }

  const entry = activeTokens.get(token);
  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    activeTokens.delete(token);
    return null;
  }

  return { phone: entry.phone, expiresAt: entry.expiresAt };
}

function revokeToken(token) {
  activeTokens.delete(token);
}

module.exports = {
  normalizePhone,
  canRequestCode,
  createVerificationCode,
  getPendingCode,
  verifyCode,
  clearPendingCode,
  issueToken,
  validateToken,
  revokeToken,
  CODE_TTL_MS,
};
