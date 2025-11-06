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
    const isAuthorized = () =>
      Boolean(socket?.data && socket.data.sessionType === 'cajero' && socket.data.cajeroId);

    const ensureAuthorized = (ack) => {
      if (isAuthorized()) {
        return true;
      }

      if (typeof ack === 'function') {
        ack({ ok: false, error: 'unauthorized' });
      } else {
        socket.emit('whatsapp:error', { message: 'No autorizado.' });
      }

      return false;
    };

    const emitInitial = () => {
      if (!ensureAuthorized()) {
        return;
      }
      socket.emit('whatsapp:lineas', { lineas: this.getLines() });
    };

    const statusListener = (payload) => {
      if (!isAuthorized()) {
        return;
      }
      socket.emit('whatsapp:estadoLinea', payload);
    };

    const messageListener = (payload) => {
      if (!isAuthorized()) {
        return;
      }
      socket.emit('whatsapp:nuevoMensaje', payload);
    };

    this.on('estadoLinea', statusListener);
    this.on('nuevoMensaje', messageListener);

    socket.on('whatsapp:subscribe', emitInitial);
    emitInitial();

    socket.on('whatsapp:solicitarHistorial', ({ linea, limit }) => {
      if (!ensureAuthorized()) {
        return;
      }
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
      if (!ensureAuthorized(ack)) {
        return;
      }
      if (!payload.linea || !payload.body) {
        const response = { ok: false, error: 'Solicitud inválida.' };
        if (typeof ack === 'function') ack(response);
        return;
      }

      try {
        const message = this.appendMessage(payload.linea, {
          direction: 'outgoing',
          body: payload.body,
          to: payload.to || null,
          timestamp: new Date().toISOString(),
        });

        this.emit('salida:enviar', {
          linea: payload.linea,
          to: payload.to || null,
          body: payload.body,
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
      if (!ensureAuthorized(ack)) {
        return;
      }
      if (payload && payload.linea) {
        handleSend(payload, ack);
      }
    });

    socket.on('whatsapp:enviarMensaje', handleSend);

    socket.on('disconnect', () => {
      this.off('estadoLinea', statusListener);
      this.off('nuevoMensaje', messageListener);
      if (socket?.data) {
        socket.data.whatsappRegistered = false;
      }
    });
  }

  getLines() {
    const lines = this.store?.lines || {};
    return Object.values(lines).map((line) => {
      const messages = Array.isArray(line.mensajes) ? line.mensajes : [];
      const lastMessage = messages.length ? messages[messages.length - 1] : null;
      return {
        id: line.id,
        nombre: line.nombre || line.id,
        estado: line.estado || 'disconnected',
        ultimaConexion: line.ultimaConexion || null,
        ultimoMensaje: lastMessage ? this.#formatMessage(lastMessage) : null,
      };
    });
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
    return formatted;
  }

  setLineStatus(lineId, estado, metadata = {}, options = {}) {
    const line = this.#ensureLine(lineId, true);
    if (!line) {
      throw new Error('line_not_found');
    }
    line.estado = estado || line.estado || 'disconnected';
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

    return payload;
  }

  registerIncoming(lineId, message) {
    return this.appendMessage(lineId, { ...message, direction: 'incoming' });
  }

  registerOutgoing(lineId, message) {
    return this.appendMessage(lineId, { ...message, direction: 'outgoing' });
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
