// server_whatsapp_baileys.js
require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const makeWASocket = require('@whiskeysockets/baileys').default;
const {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const mysql = require('mysql2/promise');
const qrcode = require('qrcode');
const path = require('path');
const { io: ClientIO } = require('socket.io-client');

// ============================
//  CONFIG DB
// ============================
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'bank_ops',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4'
};

let db;
async function initDb() {
  if (!db) {
    db = await mysql.createPool(dbConfig);
    console.log('✅ Pool MySQL (Baileys) iniciado');
  }
}
initDb().catch(console.error);

// ============================
//  EXPRESS + SOCKET.IO (ADMIN)
// ============================
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.get('/', (req, res) => res.send('WhatsApp backend (Baileys) OK'));

// ---------------------------------------------
//  CONEXIÓN COMO CLIENTE AL SERVIDOR PRINCIPAL (cajero)
// ---------------------------------------------
const MAIN_SERVER_URL = process.env.MAIN_SERVER_URL || 'http://localhost:3000';
const cajeroSocket = ClientIO(MAIN_SERVER_URL, {
  transports: ['websocket'],
  reconnection: true
});

cajeroSocket.on('connect', () => {
  console.log('🔗 [Baileys] Conectado a servidor principal:', MAIN_SERVER_URL);
});

cajeroSocket.on('connect_error', (err) => {
  console.error('⚠️ [Baileys] Error de conexión con servidor principal:', err.message);
});

// ============================
//  GESTIÓN DE LÍNEAS (Baileys)
// ============================
/**
 * lineClients[lineId] = {
 *   sock,
 *   state,
 *   userJid
 * }
 */
const lineClients = {};
const lineNameCache = {};

async function updateLineStatus(lineId, status) {
  await db.query(
    `UPDATE whatsapp_lines 
     SET status = ?, last_connection = ?
     WHERE id = ?`,
    [status, status === 'connected' ? new Date() : null, lineId]
  );
}

async function createBaileysClient(lineId) {
  if (lineClients[lineId]?.sock) {
    return lineClients[lineId].sock;
  }

  console.log('🚀 Creando cliente Baileys para línea:', lineId);

  const authDir = path.join(__dirname, '.baileys_auth', lineId);
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    auth: state,
    version,
    printQRInTerminal: false,
    browser: ['TheAcademy Panel', 'Chrome', '1.0.0']
  });

  lineClients[lineId] = {
    sock,
    state,
    userJid: null
  };

  sock.ev.on('creds.update', saveCreds);

  // QR para emparejar
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log(`📱 QR para línea ${lineId}`);
      const qrDataUrl = await qrcode.toDataURL(qr);
      io.emit('admin:line:qr', { lineId, qrDataUrl });
    }

    if (connection === 'open') {
      console.log(`✅ Línea ${lineId} conectada (Baileys)`);
      lineClients[lineId].userJid = sock.user?.id || null;
      await updateLineStatus(lineId, 'connected');
      io.emit('admin:line:status', { lineId, status: 'connected' });
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;
      console.log(`⚠️ Conexión cerrada en línea ${lineId}:`, lastDisconnect?.error?.message);
      console.log('🔎 Detalle cierre:', lastDisconnect?.error?.output);

      await updateLineStatus(lineId, 'disconnected');
      io.emit('admin:line:status', { lineId, status: 'disconnected' });

      if (code === DisconnectReason.loggedOut) {
        console.log(`🔒 Línea ${lineId} hizo logout manual, no se reintenta.`);
        delete lineClients[lineId];
      } else {
        console.log(`🔁 Reintentando reconexión automática para línea ${lineId} en 8s`);
        setTimeout(() => {
          createBaileysClient(lineId).catch(console.error);
        }, 8000);
      }
    }
  });

  // Mensajes entrantes
  sock.ev.on('messages.upsert', async (m) => {
    try {
      if (m.type !== 'notify' || !m.messages) return;

      for (const msg of m.messages) {
        if (!msg.message || msg.key.fromMe) continue;

        const payload = {
          line_id: lineId,
          message_id: msg.key.id,
          chat_id: msg.key.remoteJid,
          from_number: msg.key.fromMe ? sock.user?.id : msg.key.remoteJid,
          to_number: msg.key.fromMe ? msg.key.remoteJid : sock.user?.id,
          body: msg.message?.conversation
            || msg.message?.extendedTextMessage?.text
            || msg.message?.imageMessage?.caption
            || msg.message?.videoMessage?.caption
            || '',
          timestamp: new Date((msg.messageTimestamp || msg.messageTimestampLow) * 1000)
        };

        console.log(`📩 [${lineId}] Mensaje entrante:`, payload.from_number, '=>', payload.body);

        // Obtener nombre legible de la línea (cacheado en memoria)
        let lineName = lineNameCache[lineId] || lineId;
        try {
          if (!lineNameCache[lineId]) {
            const [rows] = await db.query(
              'SELECT name FROM whatsapp_lines WHERE id = ? LIMIT 1',
              [lineId]
            );
            if (rows && rows[0] && rows[0].name) {
              lineName = rows[0].name;
              lineNameCache[lineId] = lineName;
            }
          }
        } catch (e) {
          console.error('⚠️ No se pudo obtener el nombre de la línea desde DB:', e.message);
        }

        // Enviar evento en tiempo real al servidor principal (cajero)
        if (cajeroSocket && cajeroSocket.connected) {
          try {
            cajeroSocket.emit('wa:message', {
              lineId,
              lineName,
              chatId: payload.chat_id,
              from: payload.from_number,
              body: payload.body,
              timestamp: payload.timestamp
            });
          } catch (e) {
            console.error('⚠️ No se pudo reenviar mensaje a servidor principal:', e.message);
          }
        } else {
          console.warn('⚠️ Socket hacia servidor principal no conectado, no se reenvía wa:message');
        }

        // Guardar en DB
        await db.query(
          `INSERT INTO whatsapp_messages
            (line_id, message_id, chat_id, from_number, to_number, body, timestamp, direction)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'IN')`,
          [
            payload.line_id,
            payload.message_id,
            payload.chat_id,
            payload.from_number,
            payload.to_number,
            payload.body,
            payload.timestamp
          ]
        );

        // Disparar al panel admin (centralizador de líneas)
        io.emit('admin:message:incoming', {
          lineId,
          message: {
            ...payload,
            direction: 'IN'
          }
        });
      }
    } catch (err) {
      console.error('❌ Error procesando messages.upsert en línea', lineId, err);
    }
  });

  return sock;
}

async function destroyBaileysClient(lineId) {
  const entry = lineClients[lineId];
  if (!entry || !entry.sock) return;
  try {
    await entry.sock.logout();
  } catch (e) {
    console.error('Error al hacer logout Baileys:', e.message);
  }
  delete lineClients[lineId];
  await updateLineStatus(lineId, 'disconnected');
}

// ============================
//  SOCKET.IO (PANEL ADMIN)
// ============================
io.on('connection', (socket) => {
  console.log('🧠 Admin conectado a backend Baileys');

  socket.on('admin:lines:list', async () => {
    try {
      const [rows] = await db.query('SELECT * FROM whatsapp_lines ORDER BY name');
      socket.emit('admin:lines:list:result', { lines: rows });
    } catch (err) {
      console.error(err);
      socket.emit('admin:lines:list:result', { lines: [], error: 'Error consultando líneas' });
    }
  });

  socket.on('admin:line:save', async ({ id, name }) => {
    try {
      await db.query(
        `INSERT INTO whatsapp_lines (id, name, status)
         VALUES (?, ?, 'disconnected')
         ON DUPLICATE KEY UPDATE name = VALUES(name)`,
        [id, name]
      );

      const [rows] = await db.query('SELECT * FROM whatsapp_lines ORDER BY name');
      io.emit('admin:lines:list:result', { lines: rows });

      socket.emit('admin:line:save:result', { ok: true });
    } catch (err) {
      console.error(err);
      socket.emit('admin:line:save:result', { error: 'No se pudo guardar la línea' });
    }
  });

  socket.on('admin:line:detail', async ({ lineId }) => {
    try {
      const [rows] = await db.query('SELECT * FROM whatsapp_lines WHERE id = ?', [lineId]);
      const line = rows[0];
      if (!line) {
        socket.emit('admin:line:detail:result', { lineId, error: 'Línea no encontrada' });
        return;
      }

      socket.emit('admin:line:detail:result', {
        lineId,
        name: line.name,
        status: line.status,
        lastConnection: line.last_connection
      });
    } catch (err) {
      console.error(err);
      socket.emit('admin:line:detail:result', { lineId, error: 'Error consultando línea' });
    }
  });

  socket.on('admin:messages:list', async ({ lineId }) => {
    try {
      const [rows] = await db.query(
        `SELECT * FROM whatsapp_messages
         WHERE line_id = ?
         ORDER BY timestamp ASC
         LIMIT 300`,
        [lineId]
      );
      socket.emit('admin:messages:list:result', {
        lineId,
        messages: rows,
        count: rows.length,
        lineName: lineId
      });
    } catch (err) {
      console.error(err);
      socket.emit('admin:messages:list:result', { lineId, messages: [], error: 'Error consultando mensajes' });
    }
  });

  socket.on('admin:line:start', async ({ lineId }) => {
    try {
      await createBaileysClient(lineId);
      socket.emit('admin:line:start:result', { lineId, ok: true });
    } catch (err) {
      console.error(err);
      socket.emit('admin:line:start:result', { lineId, error: 'No se pudo iniciar la sesión Baileys' });
    }
  });

  socket.on('admin:line:stop', async ({ lineId }) => {
    try {
      await destroyBaileysClient(lineId);
      socket.emit('admin:line:stop:result', { lineId, ok: true });
      io.emit('admin:line:status', { lineId, status: 'disconnected' });
    } catch (err) {
      console.error(err);
      socket.emit('admin:line:stop:result', { lineId, error: 'No se pudo cerrar la sesión Baileys' });
    }
  });

  socket.on('admin:message:send', async ({ lineId, to, body }) => {
    try {
      const client = await createBaileysClient(lineId);
      const jid = to.includes('@') ? to : `${to}@s.whatsapp.net`;

      await client.sendMessage(jid, { text: body });
      const now = new Date();

      await db.query(
        `INSERT INTO whatsapp_messages
          (line_id, message_id, chat_id, from_number, to_number, body, timestamp, direction)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'OUT')`,
        [
          lineId,
          `local-${Date.now()}`,
          jid,
          null,
          jid,
          body,
          now
        ]
      );

      const [rows] = await db.query(
        `SELECT * FROM whatsapp_messages
         WHERE line_id = ?
         ORDER BY timestamp ASC
         LIMIT 300`,
        [lineId]
      );

      socket.emit('admin:message:send:result', {
        lineId,
        ok: true,
        messages: rows
      });
    } catch (err) {
      console.error(err);
      socket.emit('admin:message:send:result', { lineId, error: 'Error enviando mensaje con Baileys' });
    }
  });
});

// ============================
//  ARRANCAR SERVIDOR
// ============================
const PORT = process.env.WHATSAPP_PORT || 4000;
server.listen(PORT, () => {
  console.log(`🌐 Baileys backend escuchando en http://localhost:${PORT}`);
});
