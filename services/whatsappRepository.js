const DEFAULT_MAX_LINES = parseInt(process.env.WHATSAPP_MAX_LINES || '8', 10);

function normalizeSessionKey(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  const raw = String(value).trim();
  if (!raw) return '';
  return raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '') || raw.replace(/\s+/g, '_');
}

function createWhatsappRepository(pool, options = {}) {
  if (!pool) {
    throw new Error('pool_required');
  }
  const maxLines = Number.isFinite(options.maxLines) && options.maxLines > 0 ? options.maxLines : DEFAULT_MAX_LINES;

  async function listLines() {
    const [rows] = await pool.query(
      `SELECT id, session_key, display_name, status, last_connection_at, last_message_at, created_at, updated_at
       FROM whatsapp_lines
       ORDER BY created_at ASC`
    );
    return rows;
  }

  async function countLines() {
    const [rows] = await pool.query('SELECT COUNT(*) as total FROM whatsapp_lines');
    return rows?.[0]?.total || 0;
  }

  async function createLine({ sessionKey, displayName }) {
    const normalizedKey = normalizeSessionKey(sessionKey || displayName);
    if (!normalizedKey || !displayName) {
      throw new Error('missing_line');
    }
    const existingTotal = await countLines();
    if (existingTotal >= maxLines) {
      throw new Error('max_lines_reached');
    }
    const [result] = await pool.query(
      `INSERT INTO whatsapp_lines (session_key, display_name, status)
       VALUES (?, ?, 'disconnected')`,
      [normalizedKey, displayName]
    );
    const [row] = await pool.query(
      `SELECT id, session_key, display_name, status, last_connection_at, last_message_at, created_at, updated_at
       FROM whatsapp_lines WHERE id = ?`,
      [result.insertId]
    );
    return row[0];
  }

  async function ensureLine(sessionKey) {
    const normalizedKey = normalizeSessionKey(sessionKey);
    if (!normalizedKey) return null;
    const [rows] = await pool.query(
      `SELECT id, session_key, display_name, status, last_connection_at, last_message_at, created_at, updated_at
       FROM whatsapp_lines WHERE session_key = ? LIMIT 1`,
      [normalizedKey]
    );
    return rows?.[0] || null;
  }

  async function updateStatus(sessionKey, status, lastConnection) {
    const normalizedKey = normalizeSessionKey(sessionKey);
    if (!normalizedKey) return null;
    await pool.query(
      `UPDATE whatsapp_lines
       SET status = ?, last_connection_at = COALESCE(?, last_connection_at), updated_at = NOW()
       WHERE session_key = ?`,
      [status, lastConnection ? new Date(lastConnection) : null, normalizedKey]
    );
    return ensureLine(normalizedKey);
  }

  async function touchMessageActivity(sessionKey) {
    const normalizedKey = normalizeSessionKey(sessionKey);
    if (!normalizedKey) return null;
    await pool.query(
      `UPDATE whatsapp_lines SET last_message_at = NOW(), updated_at = NOW() WHERE session_key = ?`,
      [normalizedKey]
    );
    return ensureLine(normalizedKey);
  }

  return {
    listLines,
    createLine,
    updateStatus,
    ensureLine,
    touchMessageActivity,
    maxLines,
  };
}

module.exports = createWhatsappRepository;
