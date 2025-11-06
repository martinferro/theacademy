const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const EventEmitter = require('events');

const DATA_PATH = path.join(__dirname, '..', 'data', 'whatsapp-central.json');
const DEFAULT_LINES = (process.env.WHATSAPP_LINES || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean)
  .map((value) => ({ id: value, nombre: value }))
  .concat([
    { id: 'cajero1', nombre: 'Cajero 1' },
    { id: 'cajero2', nombre: 'Cajero 2' },
    { id: 'soporte', nombre: 'Soporte' },
  ]);

const VALID_STATES = new Set(['connected', 'connecting', 'disconnected']);

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
    this.store = { lines: {} };
    this.storePath = DATA_PATH;
    this.#load();
  }

  attach(io) {
    this.io = io;
  }

  registerSocket(socket) {
    const emitInitial = () => {
      socket.emit('whatsapp:lineas', { lineas: this.getLines() });
    };

    const statusListener = (payload) => {
      socket.emit('whatsapp:estadoLinea', payload);
    };

    const messageListener = (payload) => {
      socket.emit('whatsapp:nuevoMensaje', payload);
    };

    const lineListener = (payload) => {
      socket.emit('whatsapp:lineaActualizada', payload);
    };

    this.on('estadoLinea', statusListener);
    this.on('nuevoMensaje', messageListener);
    this.on('lineaActualizada', lineListener);

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

    socket.on('whatsapp:actualizarEstado', (payload = {}, ack) => {
      const respond = typeof ack === 'function' ? ack : () => {};
      const lineId = normalizeLineId(payload.linea || payload.line || payload.id);
      if (!lineId) {
        respond({ ok: false, error: 'missing_line' });
        return;
      }

      const desired = typeof payload.estado === 'string' ? payload.estado.trim().toLowerCase() : '';
      const estado = VALID_STATES.has(desired) ? desired : 'connected';

      try {
        const status = this.setLineStatus(lineId, estado, payload.metadata || {}, { silent: false });
        respond({ ok: true, linea: lineId, estado: status.estado, lineaActualizada: this.getLine(lineId) });
      } catch (error) {
        respond({ ok: false, error: error.message === 'line_not_found' ? 'line_not_found' : 'update_failed' });
      }
    });

    socket.on('whatsapp:upsertLinea', (payload = {}, ack) => {
      const respond = typeof ack === 'function' ? ack : () => {};
      const lineId = normalizeLineId(payload.id || payload.linea || payload.line);
      if (!lineId) {
        respond({ ok: false, error: 'missing_line' });
        return;
      }

      const nombre = sanitizeDisplayName(payload.nombre, this.#inferDisplayName(lineId));

      try {
        const updated = this.upsertLine(lineId, { nombre }, { silent: false });
        respond({ ok: true, linea: lineId, lineaActualizada: updated });
      } catch (error) {
        respond({ ok: false, error: error.message === 'line_not_found' ? 'line_not_found' : 'upsert_failed' });
      }
    });

    socket.on('disconnect', () => {
      this.off('estadoLinea', statusListener);
      this.off('nuevoMensaje', messageListener);
      this.off('lineaActualizada', lineListener);
    });
  }

  getLines() {
    const lines = this.store?.lines || {};
    return Object.values(lines).map((line) => this.#serializeLine(line));
  }

  getLine(lineId) {
    if (!lineId) return null;
    const lines = this.store?.lines || {};
    if (!lines[lineId]) return null;
    return this.#serializeLine(lines[lineId]);
  }

  getMessages(lineId, limit = 100) {
    const line = this.#ensureLine(lineId);
    if (!line) {
      throw new Error('line_not_found');
    }
    const messages = Array.isArray(line.mensajes) ? line.mensajes : [];
    const slice = limit ? messages.slice(-Math.abs(parseInt(limit, 10) || 100)) : messages;
    return slice.map((message) => this.#formatMessage(message));
  }

  appendMessage(lineId, message, options = {}) {
    const line = this.#ensureLine(lineId, true);
    if (!line) {
      throw new Error('line_not_found');
    }
    if (!Array.isArray(line.mensajes)) {
      line.mensajes = [];
    }

    const stored = this.#normalizeMessage({
      ...message,
      id: message.id,
      timestamp: message.timestamp || new Date().toISOString(),
    });

    line.mensajes.push(stored);
    line.ultimaActividad = stored.timestamp;
    line.ultimoMensaje = stored.id;
    this.store.lines[lineId] = line;
    this.#save();

    const formatted = this.#formatMessage(stored);
    if (!options.silent) {
      const payload = { linea: lineId, mensaje: formatted };
      if (this.io) {
        this.io.emit('whatsapp:nuevoMensaje', payload);
      }
      this.emit('nuevoMensaje', payload);
    }
    this.#broadcastLine(lineId, options);
    return formatted;
  }

  setLineStatus(lineId, estado, metadata = {}, options = {}) {
    const line = this.#ensureLine(lineId, true);
    if (!line) {
      throw new Error('line_not_found');
    }
    line.estado = VALID_STATES.has(estado) ? estado : line.estado || 'disconnected';
    if (metadata.ultimaConexion) {
      line.ultimaConexion = metadata.ultimaConexion;
    } else if (estado === 'connected') {
      line.ultimaConexion = new Date().toISOString();
    }
    this.store.lines[lineId] = line;
    this.#save();

    const payload = {
      linea: lineId,
      estado: line.estado,
      ultimaConexion: line.ultimaConexion || null,
    };

    if (!options.silent) {
      if (this.io) {
        this.io.emit('whatsapp:estadoLinea', payload);
      }
      this.emit('estadoLinea', payload);
    }

    this.#broadcastLine(lineId, options);

    return payload;
  }

  registerIncoming(lineId, message) {
    return this.appendMessage(lineId, { ...message, direction: 'incoming' });
  }

  registerOutgoing(lineId, message) {
    return this.appendMessage(lineId, { ...message, direction: 'outgoing' });
  }

  upsertLine(lineId, updates = {}, options = {}) {
    const line = this.#ensureLine(lineId, true);
    if (!line) {
      throw new Error('line_not_found');
    }

    if (typeof updates.nombre === 'string' && updates.nombre.trim()) {
      line.nombre = updates.nombre.trim();
    }

    if (typeof updates.estado === 'string' && VALID_STATES.has(updates.estado)) {
      line.estado = updates.estado;
    }

    if (updates.ultimaConexion) {
      line.ultimaConexion = updates.ultimaConexion;
    }

    this.store.lines[lineId] = line;
    this.#save();

    return this.#broadcastLine(lineId, options);
  }

  #ensureLine(lineId, autoCreate = false) {
    if (!lineId) return null;
    if (!this.store.lines[lineId]) {
      if (!autoCreate) {
        return null;
      }
      this.store.lines[lineId] = {
        id: lineId,
        nombre: this.#inferDisplayName(lineId),
        estado: 'disconnected',
        ultimaConexion: null,
        mensajes: [],
      };
    }
    return this.store.lines[lineId];
  }

  #inferDisplayName(lineId) {
    const predefined = DEFAULT_LINES.find((line) => line.id === lineId);
    if (predefined) return predefined.nombre || lineId;
    if (!lineId) return 'Línea';
    return lineId.replace(/_/g, ' ');
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
    const messages = Array.isArray(line.mensajes) ? line.mensajes : [];
    const lastMessage = messages.length ? messages[messages.length - 1] : null;
    return {
      id: line.id,
      nombre: line.nombre || this.#inferDisplayName(line.id),
      estado: VALID_STATES.has(line.estado) ? line.estado : 'disconnected',
      ultimaConexion: line.ultimaConexion || null,
      ultimoMensaje: lastMessage ? this.#formatMessage(lastMessage) : null,
    };
  }

  #broadcastLine(lineId, options = {}) {
    if (!lineId) return null;
    const line = this.store?.lines?.[lineId];
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
      this.store = { lines: {} };
    }

    if (!this.store || typeof this.store !== 'object') {
      this.store = { lines: {} };
    }

    if (!this.store.lines || typeof this.store.lines !== 'object') {
      this.store.lines = {};
    }

    DEFAULT_LINES.forEach((line) => {
      if (!line.id) return;
      if (!this.store.lines[line.id]) {
        this.store.lines[line.id] = {
          id: line.id,
          nombre: line.nombre || line.id,
          estado: 'disconnected',
          ultimaConexion: null,
          mensajes: [],
        };
      } else if (!this.store.lines[line.id].nombre) {
        this.store.lines[line.id].nombre = line.nombre || line.id;
      }
    });

    this.#save();
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
