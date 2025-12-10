const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const EventEmitter = require('events');

const DATA_PATH = path.join(__dirname, '..', 'data', 'whatsapp-central.json');
const DEFAULT_MAX_LINES = parseInt(process.env.WHATSAPP_MAX_LINES || '8', 10);

const VALID_STATES = new Set(['disconnected', 'waiting_qr', 'connected', 'error']);

function normalizeLineId(value) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    return '';
  }
  const raw = String(value).trim();
  if (!raw) return '';
  const normalized = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (normalized) return normalized;
  return raw.replace(/\s+/g, '_');
}

function sanitizeDisplayName(value, fallback) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return fallback;
}

class WhatsappCentral extends EventEmitter {
  constructor() {
    super();
    this.io = null;
    this.repository = null;
    this.maxLines = DEFAULT_MAX_LINES;
    this.lines = new Map();
    this.storePath = DATA_PATH;
    this.store = { messages: {} };
    this.pendingQrs = new Map();
    this.#load();
  }

  attach(io) {
    this.io = io;
  }

  async useRepository(repository, options = {}) {
    this.repository = repository || null;
    if (options.maxLines) {
      const parsed = parseInt(options.maxLines, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        this.maxLines = parsed;
      }
    }
    if (this.repository) {
      await this.refreshLinesFromRepository();
    }
  }

  async refreshLinesFromRepository() {
    if (!this.repository || typeof this.repository.listLines !== 'function') return;
    const rows = await this.repository.listLines();
    rows.forEach((row) => this.#storeRepositoryLine(row));
  }

  registerSocket(socket) {
    const emitInitial = async () => {
      socket.emit('whatsapp:lineas', { lineas: this.getLines() });
    };

    const statusListener = (payload) => {
      socket.emit('whatsapp:line_status_changed', payload);
      socket.emit('whatsapp:estadoLinea', payload);
    };

    const qrListener = (payload) => {
      socket.emit('whatsapp:new_qr', payload);
    };

    const messageListener = (payload) => {
      socket.emit('whatsapp:nuevoMensaje', payload);
    };

    const lineListener = (payload) => {
      socket.emit('whatsapp:lineaActualizada', payload);
    };

    this.on('line_status_changed', statusListener);
    this.on('nuevoMensaje', messageListener);
    this.on('lineaActualizada', lineListener);
    this.on('new_qr', qrListener);

    socket.on('whatsapp:subscribe', emitInitial);
    emitInitial();

    socket.on('whatsapp:solicitarHistorial', ({ linea, limit }) => {
      if (!linea) return;
      try {
        const mensajes = this.getMessages(linea, limit);
        socket.emit('whatsapp:historial', { linea, mensajes });
      } catch (error) {
        socket.emit('whatsapp:error', {
          linea,
          message: error.message === 'line_not_found' ? 'Línea no encontrada.' : 'No pudimos obtener el historial.',
        });
      }
    });

    const handleSend = (payload = {}, ack) => {
      const lineId = normalizeLineId(payload.linea || payload.line || payload.id);
      const bodyRaw = typeof payload.body === 'string' ? payload.body : String(payload.body ?? '');
      const body = bodyRaw.trim();
      if (!lineId || !body) {
        const response = { ok: false, error: 'Solicitud inválida.' };
        if (typeof ack === 'function') ack(response);
        return;
      }

      try {
        const message = this.appendMessage(lineId, {
          direction: 'outgoing',
          body,
          to: payload.to || null,
          timestamp: new Date().toISOString(),
        });

        this.emit('salida:enviar', {
          linea: lineId,
          to: payload.to || null,
          body,
          metadata: payload.metadata || {},
        });

        if (typeof ack === 'function') {
          ack({ ok: true, mensaje: message });
        }
      } catch (error) {
        const response = {
          ok: false,
          error: error.message === 'line_not_found' ? 'La línea indicada no existe.' : 'No pudimos registrar el mensaje.',
        };
        if (typeof ack === 'function') ack(response);
        socket.emit('whatsapp:error', { message: response.error });
      }
    };

    socket.on('enviarMensaje', (payload, ack) => {
      if (payload && payload.linea) {
        handleSend(payload, ack);
      }
    });

    socket.on('whatsapp:enviarMensaje', handleSend);

    socket.on('whatsapp:registrarEntrante', (payload = {}, ack) => {
      const respond = typeof ack === 'function' ? ack : () => {};
      const lineId = normalizeLineId(payload.linea || payload.line || payload.id);
      const bodyRaw = typeof payload.body === 'string' ? payload.body : String(payload.body ?? '');
      const body = bodyRaw.trim();
      if (!lineId || !body) {
        respond({ ok: false, error: 'missing_parameters' });
        return;
      }

      try {
        const message = this.registerIncoming(lineId, {
          body,
          from: payload.from ?? null,
          to: payload.to ?? null,
          timestamp: payload.timestamp || new Date().toISOString(),
          metadata: payload.metadata || {},
        });
        respond({ ok: true, mensaje: message, linea: lineId });
      } catch (error) {
        respond({ ok: false, error: error.message === 'line_not_found' ? 'line_not_found' : 'register_failed' });
      }
    });

    socket.on('whatsapp:actualizarEstado', async (payload = {}, ack) => {
      const respond = typeof ack === 'function' ? ack : () => {};
      const lineId = normalizeLineId(payload.linea || payload.line || payload.id);
      if (!lineId) {
        respond({ ok: false, error: 'missing_line' });
        return;
      }

      const desired = typeof payload.estado === 'string' ? payload.estado.trim().toLowerCase() : '';
      const estado = VALID_STATES.has(desired) ? desired : 'connected';

      try {
        const status = await this.setLineStatus(lineId, estado, payload.metadata || {}, { silent: false });
        respond({ ok: true, linea: lineId, estado: status.estado, lineaActualizada: this.getLine(lineId) });
      } catch (error) {
        respond({ ok: false, error: error.message === 'line_not_found' ? 'line_not_found' : 'update_failed' });
      }
    });

    socket.on('whatsapp:startSession', async (payload = {}, ack) => {
      const respond = typeof ack === 'function' ? ack : () => {};
      const lineId = normalizeLineId(payload.linea || payload.line || payload.id);
      if (!lineId) {
        respond({ ok: false, error: 'missing_line' });
        return;
      }

      try {
        const { qr } = await this.startSession(lineId);
        respond({ ok: true, qr });
      } catch (error) {
        respond({ ok: false, error: error.message || 'start_failed' });
      }
    });

    socket.on('whatsapp:upsertLinea', async (payload = {}, ack) => {
      const respond = typeof ack === 'function' ? ack : () => {};
      const sessionKey = normalizeLineId(payload.id || payload.linea || payload.line);
      const nombre = sanitizeDisplayName(payload.nombre, sessionKey || 'Línea');
      if (!sessionKey && !nombre) {
        respond({ ok: false, error: 'missing_line' });
        return;
      }

      try {
        const created = await this.createLine({ sessionKey: sessionKey || null, displayName: nombre });
        respond({ ok: true, linea: created.id, lineaActualizada: created });
      } catch (error) {
        respond({ ok: false, error: error.message || 'upsert_failed' });
      }
    });

    socket.on('disconnect', () => {
      this.off('line_status_changed', statusListener);
      this.off('nuevoMensaje', messageListener);
      this.off('lineaActualizada', lineListener);
      this.off('new_qr', qrListener);
    });
  }

  getLines() {
    return Array.from(this.lines.values()).map((line) => this.#serializeLine(line));
  }

  getLine(lineId) {
    const key = normalizeLineId(lineId);
    if (!key) return null;
    const line = this.lines.get(key);
    if (!line) return null;
    return this.#serializeLine(line);
  }

  getMessages(lineId, limit = 100) {
    const key = normalizeLineId(lineId);
    if (!key || !this.lines.has(key)) {
      throw new Error('line_not_found');
    }
    const messages = Array.isArray(this.store?.messages?.[key]) ? this.store.messages[key] : [];
    const slice = limit ? messages.slice(-Math.abs(parseInt(limit, 10) || 100)) : messages;
    return slice.map((message) => this.#formatMessage(message));
  }

  appendMessage(lineId, message, options = {}) {
    const key = normalizeLineId(lineId);
    if (!key || !this.lines.has(key)) {
      throw new Error('line_not_found');
    }
    if (!Array.isArray(this.store.messages[key])) {
      this.store.messages[key] = [];
    }

    const stored = this.#normalizeMessage({
      ...message,
      id: message.id,
      timestamp: message.timestamp || new Date().toISOString(),
    });

    this.store.messages[key].push(stored);
    this.#save();

    if (this.repository && typeof this.repository.touchMessageActivity === 'function') {
      this.repository.touchMessageActivity(key).catch(() => {});
    }

    const formatted = this.#formatMessage(stored);
    const line = this.lines.get(key) || { id: key };
    line.ultimoMensaje = formatted;
    this.lines.set(key, line);

    if (!options.silent) {
      const payload = { linea: key, mensaje: formatted };
      if (this.io) {
        this.io.emit('whatsapp:nuevoMensaje', payload);
      }
      this.emit('nuevoMensaje', payload);
    }
    this.#broadcastLine(key, options);
    return formatted;
  }

  async setLineStatus(lineId, estado, metadata = {}, options = {}) {
    const key = normalizeLineId(lineId);
    if (!key || !this.lines.has(key)) {
      throw new Error('line_not_found');
    }
    let line = this.lines.get(key);
    line.estado = VALID_STATES.has(estado) ? estado : line.estado || 'disconnected';
    if (metadata.ultimaConexion) {
      line.ultimaConexion = metadata.ultimaConexion;
    } else if (line.estado === 'connected') {
      line.ultimaConexion = new Date().toISOString();
    }
    if (line.estado !== 'waiting_qr') {
      this.pendingQrs.delete(key);
    }
    this.lines.set(key, line);

    if (this.repository && typeof this.repository.updateStatus === 'function') {
      const updated = await this.repository.updateStatus(key, line.estado, line.ultimaConexion || null);
      if (updated) {
        this.#storeRepositoryLine(updated);
        line = this.lines.get(key) || line;
      }
    }

    const payload = {
      linea: key,
      estado: line.estado,
      ultimaConexion: line.ultimaConexion || null,
    };

    if (!options.silent) {
      if (this.io) {
        this.io.emit('whatsapp:line_status_changed', payload);
        this.io.emit('whatsapp:estadoLinea', payload);
      }
      this.emit('line_status_changed', payload);
    }

    this.#broadcastLine(key, options);

    return payload;
  }

  async createLine({ sessionKey, displayName }) {
    const normalizedKey = normalizeLineId(sessionKey || displayName || `linea-${Date.now()}`);
    const nombre = sanitizeDisplayName(displayName, normalizedKey);
    if (!normalizedKey || !nombre) {
      throw new Error('missing_line');
    }

    if (this.lines.size >= this.maxLines) {
      throw new Error('max_lines_reached');
    }

    if (this.repository && typeof this.repository.createLine === 'function') {
      const row = await this.repository.createLine({ sessionKey: normalizedKey, displayName: nombre });
      this.#storeRepositoryLine(row);
    } else {
      this.lines.set(normalizedKey, {
        id: normalizedKey,
        nombre,
        estado: 'disconnected',
        ultimaConexion: null,
      });
    }

    if (!this.store.messages[normalizedKey]) {
      this.store.messages[normalizedKey] = [];
      this.#save();
    }

    return this.#broadcastLine(normalizedKey, { silent: false });
  }

  async startSession(lineId) {
    const key = normalizeLineId(lineId);
    if (!key) {
      throw new Error('line_not_found');
    }
    if (!this.lines.has(key) && this.repository && typeof this.repository.ensureLine === 'function') {
      const dbLine = await this.repository.ensureLine(key);
      if (dbLine) {
        this.#storeRepositoryLine(dbLine);
      }
    }
    if (!this.lines.has(key)) {
      throw new Error('line_not_found');
    }
    await this.setLineStatus(key, 'waiting_qr');
    const qr = this.#generateQr(key);
    this.pendingQrs.set(key, qr);
    const payload = { linea: key, qr };
    if (this.io) {
      this.io.emit('whatsapp:new_qr', payload);
    }
    this.emit('new_qr', payload);
    return { qr };
  }

  registerIncoming(lineId, message) {
    return this.appendMessage(lineId, { ...message, direction: 'incoming' });
  }

  registerOutgoing(lineId, message) {
    return this.appendMessage(lineId, { ...message, direction: 'outgoing' });
  }

  #storeRepositoryLine(row) {
    if (!row) return null;
    const sessionKey = normalizeLineId(row.session_key || row.id);
    if (!sessionKey) return null;
    const line = {
      id: sessionKey,
      dbId: row.id,
      nombre: sanitizeDisplayName(row.display_name, sessionKey),
      estado: VALID_STATES.has(row.status) ? row.status : 'disconnected',
      ultimaConexion: row.last_connection_at ? new Date(row.last_connection_at).toISOString() : null,
      ultimoMensaje: row.last_message_at ? new Date(row.last_message_at).toISOString() : null,
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null,
    };
    this.lines.set(sessionKey, line);
    return line;
  }

  #normalizeMessage(message) {
    const direction = message.direction === 'outgoing' ? 'outgoing' : 'incoming';
    const body = typeof message.body === 'string' ? message.body : String(message.body ?? '');
    const timestamp = message.timestamp ? new Date(message.timestamp).toISOString() : new Date().toISOString();
    let id = message.id;
    if (!id) {
      if (typeof crypto.randomUUID === 'function') {
        id = crypto.randomUUID();
      } else {
        id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      }
    }
    return {
      id,
      direction,
      body,
      from: message.from ?? null,
      to: message.to ?? null,
      timestamp,
      status: message.status ?? null,
      metadata: message.metadata || {},
    };
  }

  #formatMessage(message) {
    return {
      id: message.id,
      direction: message.direction,
      body: message.body,
      from: message.from ?? null,
      to: message.to ?? null,
      timestamp: message.timestamp,
      status: message.status ?? null,
      metadata: message.metadata || {},
    };
  }

  #serializeLine(line) {
    if (!line) return null;
    const messages = Array.isArray(this.store?.messages?.[line.id]) ? this.store.messages[line.id] : [];
    const lastMessage = messages.length ? messages[messages.length - 1] : line.ultimoMensaje || null;
    return {
      id: line.id,
      nombre: line.nombre || line.id,
      estado: VALID_STATES.has(line.estado) ? line.estado : 'disconnected',
      ultimaConexion: line.ultimaConexion || null,
      ultimoMensaje: lastMessage ? this.#formatMessage(lastMessage) : null,
      qr: this.pendingQrs.get(line.id) || null,
      dbId: line.dbId || null,
    };
  }

  #broadcastLine(lineId, options = {}) {
    if (!lineId) return null;
    const line = this.lines.get(lineId);
    if (!line) return null;
    const serialized = this.#serializeLine(line);
    if (!options.silent) {
      const payload = { linea: lineId, lineaActualizada: serialized };
      if (this.io) {
        this.io.emit('whatsapp:lineaActualizada', payload);
      }
      this.emit('lineaActualizada', payload);
    }
    return serialized;
  }

  #generateQr(lineId) {
    const secret = crypto.randomBytes(8).toString('hex');
    return `WAC-${lineId}-${secret}`;
  }

  #load() {
    try {
      if (fs.existsSync(this.storePath)) {
        const raw = fs.readFileSync(this.storePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          this.store = parsed;
        }
      }
    } catch (error) {
      console.warn('No se pudo leer el estado de WhatsApp central, se regenerará.', error.message);
      this.store = { messages: {} };
    }

    if (!this.store || typeof this.store !== 'object') {
      this.store = { messages: {} };
    }
    if (!this.store.messages || typeof this.store.messages !== 'object') {
      this.store.messages = {};
    }
  }

  #save() {
    const directory = path.dirname(this.storePath);
    try {
      if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
      }
      fs.writeFileSync(this.storePath, JSON.stringify(this.store, null, 2), 'utf8');
    } catch (error) {
      console.error('No se pudo guardar el estado de WhatsApp central:', error.message);
    }
  }
}

module.exports = new WhatsappCentral();
