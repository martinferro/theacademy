// =============================================
// server_whatsapp.js (versión corregida y estable)
// =============================================
require('dotenv').config();

process.on('unhandledRejection', (reason) => {
  console.error("⚠️ Unhandled Rejection:", reason);
});

process.on('uncaughtException', (err) => {
  console.error("💥 Uncaught Exception:", err);
});

// ---------------------------------------------
//  DEPENDENCIAS
// ---------------------------------------------
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mysql = require('mysql2/promise');
const qrcode = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js');

// ---------------------------------------------
//  CONFIG MYSQL
// ---------------------------------------------
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'bank_ops',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  waitForConnections: true,
  connectionLimit: 10
};

let db;
async function initDb() {
  if (!db) {
    db = await mysql.createPool(dbConfig);
    console.log("✅ Pool MySQL iniciado");
  }
}
initDb().catch(console.error);

// ---------------------------------------------
//  EXPRESS + SOCKET.IO
// ---------------------------------------------
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.get('/', (req, res) => res.send('WhatsApp backend OK'));

// ---------------------------------------------
//  CLIENTES DE WHATSAPP POR LÍNEA
// ---------------------------------------------
const clients = {};

async function updateLineStatus(lineId, status) {
  await db.query(
    `UPDATE whatsapp_lines 
     SET status = ?, last_connection = ?
     WHERE id = ?`,
    [
      status,
      status === "connected" ? new Date() : null,
      lineId
    ]
  );
}

// ---------------------------------------------
//  CREAR CLIENTE DE WHATSAPP (CON REINTENTOS)
// ---------------------------------------------
async function createWhatsappClient(lineId) {
  if (clients[lineId]?.client) {
    console.log(`ℹ️ Cliente ya creado para línea ${lineId}`);
    return clients[lineId].client;
  }

  console.log(`🚀 Creando cliente para línea: ${lineId}`);

  const client = new Client({
    authStrategy: new LocalAuth({ clientId: lineId }),
    puppeteer: {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    }
  });

  clients[lineId] = { client, status: "connecting" };
  await updateLineStatus(lineId, "connecting");

  // ---------------------------------------------
  //  EVENTOS DE QR
  // ---------------------------------------------
  client.on("qr", async (qr) => {
    console.log(`📱 QR listo para línea ${lineId}`);
    const qrDataUrl = await qrcode.toDataURL(qr);
    io.emit("admin:line:qr", { lineId, qrDataUrl });
  });

  // ---------------------------------------------
  //  READY
  // ---------------------------------------------
  client.on("ready", async () => {
    console.log(`✅ WhatsApp CONECTADO → línea ${lineId}`);
    clients[lineId].status = "connected";
    await updateLineStatus(lineId, "connected");

    io.emit("admin:line:status", { lineId, status: "connected" });
  });

  // ---------------------------------------------
  //  DESCONEXIÓN
  // ---------------------------------------------
  client.on("disconnected", async (reason) => {
    console.log(`⚠️ WhatsApp desconectado en línea ${lineId}:`, reason);

    clients[lineId].status = "disconnected";
    await updateLineStatus(lineId, "disconnected");

    // Intentar reconectar
    setTimeout(() => {
      console.log(`🔁 Reintentando iniciar línea ${lineId} (por desconexión)`);
      destroyWhatsappClient(lineId);
      createWhatsappClient(lineId);
    }, 8000);
  });

  // ---------------------------------------------
  //  MENSAJES ENTRANTES
  // ---------------------------------------------
  client.on("message", async (msg) => {
    try {
      console.log(`📩 [${lineId}] Mensaje:`, msg.from, "=>", msg.body);

      // detectar chat id
      let chatId = msg.from;
      try {
        const chat = await msg.getChat();
        chatId = chat.id._serialized;
      } catch (err) {
        console.warn("⚠️ getChat falló:", err.message);
      }

      const payload = {
        line_id: lineId,
        message_id: msg.id._serialized,
        chat_id: chatId,
        from_number: msg.author || msg.from || null,
        to_number: msg.to || null,
        body: msg.body,
        timestamp: new Date(msg.timestamp * 1000)
      };

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

      io.emit("admin:message:incoming", { lineId, message: payload });

    } catch (err) {
      console.error(`❌ Error guardando mensaje en línea ${lineId}:`, err);
    }
  });

  // ---------------------------------------------
  //  INICIALIZACIÓN CON RETRY
  // ---------------------------------------------
  try {
    await client.initialize();
    console.log(`🎯 initialize() completado para línea ${lineId}`);
  } catch (err) {
    console.error(`❌ Error en initialize() para línea ${lineId}:`, err);

    try {
      await client.destroy();
    } catch {}

    setTimeout(() => {
      console.log(`🔁 Reintentando createWhatsappClient(${lineId}) después de error`);
      delete clients[lineId];
      createWhatsappClient(lineId);
    }, 8000);
  }

  return client;
}

// ---------------------------------------------
//  DESTRUIR CLIENTE
// ---------------------------------------------
async function destroyWhatsappClient(lineId) {
  if (!clients[lineId]) return;

  try {
    await clients[lineId].client.destroy();
  } catch {}
  delete clients[lineId];

  await updateLineStatus(lineId, "disconnected");
}

// ---------------------------------------------
//  SOCKET.IO → EVENTOS DEL ADMIN PANEL
// ---------------------------------------------
io.on("connection", (socket) => {
  console.log("🧠 Admin conectado");

  socket.on("admin:lines:list", async () => {
    const [rows] = await db.query(`SELECT * FROM whatsapp_lines ORDER BY name`);
    socket.emit("admin:lines:list:result", { lines: rows });
  });

  socket.on("admin:line:save", async ({ id, name }) => {
    await db.query(
      `INSERT INTO whatsapp_lines (id, name, status)
       VALUES (?, ?, 'disconnected')
       ON DUPLICATE KEY UPDATE name = VALUES(name)`,
      [id, name]
    );

    const [rows] = await db.query("SELECT * FROM whatsapp_lines ORDER BY name");
    io.emit("admin:lines:list:result", { lines: rows });
  });

  socket.on("admin:line:detail", async ({ lineId }) => {
    const [rows] = await db.query(
      `SELECT * FROM whatsapp_lines WHERE id = ?`,
      [lineId]
    );
    socket.emit("admin:line:detail:result", rows[0] || {});
  });

  socket.on("admin:messages:list", async ({ lineId }) => {
    const [rows] = await db.query(
      `SELECT * FROM whatsapp_messages 
       WHERE line_id = ? 
       ORDER BY timestamp ASC
       LIMIT 200`,
      [lineId]
    );
    socket.emit("admin:messages:list:result", { lineId, messages: rows });
  });

  socket.on("admin:line:start", async ({ lineId }) => {
    await createWhatsappClient(lineId);
  });

  socket.on("admin:line:stop", async ({ lineId }) => {
    await destroyWhatsappClient(lineId);
  });

  socket.on("admin:message:send", async ({ lineId, to, body }) => {
    const client = await createWhatsappClient(lineId);
    const sent = await client.sendMessage(to, body);
    const timestamp = new Date();

    await db.query(
      `INSERT INTO whatsapp_messages
        (line_id, message_id, chat_id, from_number, to_number, body, timestamp, direction)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'OUT')`,
      [
        lineId,
        sent.id._serialized,
        sent.to,
        null,
        to,
        body,
        timestamp
      ]
    );

    socket.emit("admin:message:send:result", { ok: true });
  });
});

// ---------------------------------------------
//  INICIAR SERVIDOR
// ---------------------------------------------
server.listen(4000, () => {
  console.log("🌐 WhatsApp backend escuchando en http://localhost:4000");
});
