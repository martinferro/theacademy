// ===============================
// theacademy - Plataforma de chat multivista
// ===============================

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const axios = require("axios");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const mysql = require("mysql2/promise");
const crypto = require("crypto");

const authStore = require("./lib/authStore");
const sessionStore = require("./lib/sessionStore");
const smsService = require("./services/smsService");

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;

// ===============================
// Gestión de archivos auxiliares
// ===============================
const dataDir = path.join(__dirname, "data");
const platformLinksPath = path.join(dataDir, "platform-links.json");

const defaultPlatformLinks = [
  {
    id: 1,
    nombre: "Ganemos",
    url: "https://ganemos.example.com",
    activo: true,
    orden: 1,
  },
  {
    id: 2,
    nombre: "Fichas Plus",
    url: "https://fichasplus.example.com",
    activo: true,
    orden: 2,
  },
  {
    id: 3,
    nombre: "Recompensas 24/7",
    url: "https://recompensas.example.com",
    activo: true,
    orden: 3,
  },
  {
    id: 4,
    nombre: "Club Élite",
    url: "https://clubelite.example.com",
    activo: true,
    orden: 4,
  },
  {
    id: 5,
    nombre: "Banca Digital",
    url: "https://bancadigital.example.com",
    activo: false,
    orden: 5,
  },
];

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

if (!fs.existsSync(platformLinksPath)) {
  fs.writeFileSync(platformLinksPath, JSON.stringify(defaultPlatformLinks, null, 2), "utf8");
}

function readPlatformLinks({ onlyActive = true } = {}) {
  try {
    const raw = fs.readFileSync(platformLinksPath, "utf8");
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data
      .filter((item) => (onlyActive ? item.activo : true))
      .sort((a, b) => {
        const orderDiff = (a.orden ?? 0) - (b.orden ?? 0);
        return orderDiff !== 0 ? orderDiff : a.nombre.localeCompare(b.nombre);
      });
  } catch (error) {
    console.error("⚠️ No se pudieron leer los enlaces de plataformas:", error.message);
    return defaultPlatformLinks.filter((item) => (onlyActive ? item.activo : true));
  }
}

// ===============================
// Configuración MySQL
// ===============================
const dbConfig = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "bank_ops",
  port: parseInt(process.env.DB_PORT || "3306", 10),
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_POOL_LIMIT || "10", 10),
  charset: "utf8mb4",
};

let pool;

async function ensureDatabase() {
  const { database, ...configWithoutDb } = dbConfig;
  const connection = await mysql.createConnection(configWithoutDb);
  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );
  await connection.end();
}

async function ensureTables() {
  const connection = await pool.getConnection();
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS clientes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nick VARCHAR(100) NOT NULL UNIQUE,
        telefono VARCHAR(20) NOT NULL UNIQUE,
        password_hash VARCHAR(255),
        estado ENUM('activo', 'suspendido') DEFAULT 'activo',
        telefono_validado TINYINT(1) DEFAULT 0,
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS chat_threads (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cliente_id INT NOT NULL UNIQUE,
        activo TINYINT(1) DEFAULT 1,
        ultimo_mensaje TEXT,
        fecha_ultima DATETIME DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_threads_cliente FOREIGN KEY (cliente_id)
          REFERENCES clientes(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS chat_mensajes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        thread_id INT NOT NULL,
        autor ENUM('cliente', 'cajero') NOT NULL,
        mensaje TEXT NOT NULL,
        fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_mensajes_thread FOREIGN KEY (thread_id)
          REFERENCES chat_threads(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS cajero_tokens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cajero_id INT NOT NULL,
        token VARCHAR(191) NOT NULL UNIQUE,
        creado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  } finally {
    connection.release();
  }
}

async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

async function getClienteById(id) {
  return queryOne("SELECT * FROM clientes WHERE id = ?", [id]);
}

async function getClienteByTelefono(telefono) {
  return queryOne("SELECT * FROM clientes WHERE telefono = ?", [telefono]);
}

async function getClienteByNick(nick) {
  return queryOne("SELECT * FROM clientes WHERE nick = ?", [nick]);
}

async function ensureClienteForPhone(telefono) {
  let cliente = await getClienteByTelefono(telefono);
  if (!cliente) {
    const [result] = await pool.query(
      "INSERT INTO clientes (nick, telefono, telefono_validado) VALUES (?, ?, 1)",
      [telefono, telefono]
    );
    cliente = await getClienteById(result.insertId);
  } else if (!cliente.telefono_validado) {
    await pool.query("UPDATE clientes SET telefono_validado = 1 WHERE id = ?", [cliente.id]);
    cliente = await getClienteById(cliente.id);
  }
  return cliente;
}

async function ensureThreadForCliente(clienteId) {
  let thread = await queryOne("SELECT * FROM chat_threads WHERE cliente_id = ?", [clienteId]);
  if (!thread) {
    const [result] = await pool.query(
      "INSERT INTO chat_threads (cliente_id, activo, fecha_ultima) VALUES (?, 1, NOW())",
      [clienteId]
    );
    thread = await queryOne("SELECT * FROM chat_threads WHERE id = ?", [result.insertId]);
  }
  return thread;
}

async function appendMessage(clienteId, autor, mensaje) {
  const thread = await ensureThreadForCliente(clienteId);
  await pool.query(
    "INSERT INTO chat_mensajes (thread_id, autor, mensaje) VALUES (?, ?, ?)",
    [thread.id, autor, mensaje]
  );
  await pool.query(
    "UPDATE chat_threads SET ultimo_mensaje = ?, fecha_ultima = NOW() WHERE id = ?",
    [mensaje, thread.id]
  );
  return thread;
}

async function fetchMessagesByThread(threadId, { limit = 200 } = {}) {
  return query(
    "SELECT autor, mensaje, fecha FROM chat_mensajes WHERE thread_id = ? ORDER BY fecha ASC LIMIT ?",
    [threadId, limit]
  );
}

async function fetchThreadByTelefono(telefono) {
  return queryOne(
    `SELECT ct.*, c.nick, c.telefono, c.id AS cliente_id
     FROM chat_threads ct
     INNER JOIN clientes c ON c.id = ct.cliente_id
     WHERE c.telefono = ?`,
    [telefono]
  );
}

function parseAuthToken(req) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) return null;
  return authHeader.slice(7);
}

async function requireClienteAuth(req, res, next) {
  const token = parseAuthToken(req);
  const session = sessionStore.getSession(token);
  if (!session || session.type !== "cliente") {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  const cliente = await getClienteById(session.clienteId);
  if (!cliente) {
    sessionStore.revokeSession(token);
    return res.status(401).json({ ok: false, error: "cliente_not_found" });
  }

  req.sessionToken = token;
  req.clienteSession = session;
  req.cliente = cliente;
  next();
}

async function requireCajeroAuth(req, res, next) {
  const token = parseAuthToken(req);
  const session = sessionStore.getSession(token);
  if (!session || session.type !== "cajero") {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  req.sessionToken = token;
  req.cajeroSession = session;
  next();
}

function safeNumber(value) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// ===============================
// Rutas básicas
// ===============================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/cajero", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "cajero.html"));
});

app.get("/chat-integrado", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "chat-embed.html"));
});

app.get("/api/platform-links", (req, res) => {
  const links = readPlatformLinks();
  res.json({ ok: true, links });
});

// ===============================
// Autenticación de clientes
// ===============================
app.post("/api/auth/request-code", async (req, res) => {
  const phone = authStore.normalizePhone(req.body.phone);
  if (!phone) {
    return res.status(400).json({ ok: false, error: "invalid_phone" });
  }

  const allowance = authStore.canRequestCode(phone);
  if (!allowance.allowed) {
    return res.status(429).json({ ok: false, error: "cooldown", retryAfter: allowance.retryAfter });
  }

  const { code, expiresAt } = authStore.createVerificationCode(phone);

  try {
    await smsService.sendVerificationCode(phone, code, { expiresInMs: authStore.CODE_TTL_MS });
  } catch (error) {
    console.error("❌ Error al enviar código SMS:", error.message);
    return res.status(502).json({ ok: false, error: "sms_failed" });
  }

  res.json({ ok: true, expiresAt });
});

app.post("/api/auth/verify-code", async (req, res) => {
  const phone = authStore.normalizePhone(req.body.phone);
  const submittedCode = (req.body.code || "").trim();

  if (!phone || !submittedCode) {
    return res.status(400).json({ ok: false, error: "invalid_request" });
  }

  const verification = authStore.verifyCode(phone, submittedCode);
  if (!verification.ok) {
    return res.status(401).json({ ok: false, error: verification.reason });
  }

  try {
    const cliente = await ensureClienteForPhone(phone);
    const thread = await ensureThreadForCliente(cliente.id);
    const messages = await fetchMessagesByThread(thread.id);

    const session = sessionStore.createSession("cliente", {
      clienteId: cliente.id,
      telefono: cliente.telefono,
    });

    res.json({
      ok: true,
      token: session.token,
      cliente: {
        id: cliente.id,
        nick: cliente.nick,
        telefono: cliente.telefono,
        telefonoValidado: Boolean(cliente.telefono_validado),
      },
      thread: {
        id: thread.id,
        ultimoMensaje: thread.ultimo_mensaje,
        fechaUltima: thread.fecha_ultima,
      },
      messages,
    });
  } catch (error) {
    console.error("❌ Error verificando código:", error.message);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  const nick = (req.body.nick || "").trim();
  const password = req.body.password || "";

  if (!nick || !password) {
    return res.status(400).json({ ok: false, error: "invalid_credentials" });
  }

  try {
    const cliente = await getClienteByNick(nick);
    if (!cliente) {
      return res.status(404).json({ ok: false, error: "user_not_found" });
    }

    if (cliente.estado !== "activo") {
      return res.status(403).json({ ok: false, error: "user_inactive" });
    }

    if (!cliente.password_hash) {
      return res.status(409).json({ ok: false, error: "password_not_set" });
    }

    const hash = crypto.createHash("sha256").update(password).digest("hex");
    if (hash !== cliente.password_hash) {
      return res.status(401).json({ ok: false, error: "invalid_credentials" });
    }

    const thread = await ensureThreadForCliente(cliente.id);
    const messages = await fetchMessagesByThread(thread.id);

    const session = sessionStore.createSession("cliente", {
      clienteId: cliente.id,
      telefono: cliente.telefono,
    });

    res.json({
      ok: true,
      token: session.token,
      cliente: {
        id: cliente.id,
        nick: cliente.nick,
        telefono: cliente.telefono,
        telefonoValidado: Boolean(cliente.telefono_validado),
      },
      thread: {
        id: thread.id,
        ultimoMensaje: thread.ultimo_mensaje,
        fechaUltima: thread.fecha_ultima,
      },
      messages,
    });
  } catch (error) {
    console.error("❌ Error en login de cliente:", error.message);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

app.post("/api/auth/logout", (req, res) => {
  const token = parseAuthToken(req);
  if (token) {
    sessionStore.revokeSession(token);
  }
  res.json({ ok: true });
});

app.get("/api/auth/session", async (req, res) => {
  const token = parseAuthToken(req);
  if (!token) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  const session = sessionStore.getSession(token);
  if (!session) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }

  if (session.type === "cliente") {
    const cliente = await getClienteById(session.clienteId);
    if (!cliente) {
      sessionStore.revokeSession(token);
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }
    const thread = await ensureThreadForCliente(cliente.id);
    const messages = await fetchMessagesByThread(thread.id);
    return res.json({
      ok: true,
      type: "cliente",
      cliente: {
        id: cliente.id,
        nick: cliente.nick,
        telefono: cliente.telefono,
        telefonoValidado: Boolean(cliente.telefono_validado),
      },
      thread,
      messages,
    });
  }

  if (session.type === "cajero") {
    return res.json({
      ok: true,
      type: "cajero",
      cajero: {
        id: session.cajeroId,
        nombre: session.nombre,
        usuario: session.usuario,
      },
    });
  }

  res.status(400).json({ ok: false, error: "unknown_session" });
});

// ===============================
// Chat del cliente
// ===============================
app.get("/api/client/chat", requireClienteAuth, async (req, res) => {
  try {
    const thread = await ensureThreadForCliente(req.cliente.id);
    const messages = await fetchMessagesByThread(thread.id);
    res.json({
      ok: true,
      cliente: {
        id: req.cliente.id,
        nick: req.cliente.nick,
        telefono: req.cliente.telefono,
      },
      thread,
      messages,
    });
  } catch (error) {
    console.error("❌ Error obteniendo chat del cliente:", error.message);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

app.post("/api/mensaje", requireClienteAuth, async (req, res) => {
  const mensaje = (req.body.mensaje || "").trim();
  if (!mensaje) {
    return res.status(400).json({ ok: false, error: "mensaje_requerido" });
  }

  try {
    const thread = await appendMessage(req.cliente.id, "cliente", mensaje);

    try {
      const telegramToken = process.env.TELEGRAM_TOKEN;
      const chatId = process.env.TELEGRAM_CHAT_ID;
      if (telegramToken && chatId) {
        const texto = `💬 Nuevo mensaje:\n👤 ${req.cliente.nick}\n📱 ${req.cliente.telefono}\n📝 ${mensaje}`;
        await axios.post(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
          chat_id: chatId,
          text: texto,
        });
      }
    } catch (error) {
      console.error("❌ Error reenviando mensaje del cliente a Telegram:", error.message);
    }

    io.emit("cajero:nuevoMensaje", {
      telefono: req.cliente.telefono,
      nick: req.cliente.nick,
      mensaje,
      fecha: new Date().toISOString(),
      autor: "cliente",
    });

    const targetSocket = connectedClients.get(req.cliente.telefono);
    if (targetSocket) {
      io.to(targetSocket).emit("mensaje", {
        autor: "Tú",
        texto: mensaje,
        telefono: req.cliente.telefono,
      });
    }

    res.json({ ok: true, threadId: thread.id });
  } catch (error) {
    console.error("❌ Error guardando mensaje de cliente:", error.message);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// ===============================
// Autenticación de cajeros
// ===============================
app.post("/api/cajero/login", async (req, res) => {
  const usuario = (req.body.usuario || "").trim();
  const password = req.body.password || "";

  if (!usuario || !password) {
    return res.status(400).json({ ok: false, error: "invalid_credentials" });
  }

  try {
    const cajero = await queryOne(
      "SELECT id, nombre, usuario, contrasena, estado FROM cajeros WHERE usuario = ?",
      [usuario]
    );

    if (!cajero) {
      return res.status(404).json({ ok: false, error: "user_not_found" });
    }

    if (safeNumber(cajero.estado) === 0) {
      return res.status(403).json({ ok: false, error: "user_inactive" });
    }

    const hash = crypto.createHash("sha256").update(password).digest("hex");
    if (hash !== cajero.contrasena) {
      return res.status(401).json({ ok: false, error: "invalid_credentials" });
    }

    const session = sessionStore.createSession("cajero", {
      cajeroId: cajero.id,
      nombre: cajero.nombre,
      usuario: cajero.usuario,
    });

    res.json({
      ok: true,
      token: session.token,
      cajero: {
        id: cajero.id,
        nombre: cajero.nombre,
        usuario: cajero.usuario,
      },
    });
  } catch (error) {
    console.error("❌ Error en login de cajero:", error.message);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

app.get("/api/cajero/chats", requireCajeroAuth, async (req, res) => {
  try {
    const chats = await query(
      `SELECT ct.id, ct.ultimo_mensaje AS ultimoMensaje, ct.fecha_ultima AS fechaUltima,
              c.nick, c.telefono
       FROM chat_threads ct
       INNER JOIN clientes c ON c.id = ct.cliente_id
       WHERE ct.activo = 1
       ORDER BY ct.fecha_ultima DESC`
    );

    res.json({ ok: true, chats });
  } catch (error) {
    console.error("❌ Error obteniendo chats activos:", error.message);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

app.get("/api/cajero/alias", requireCajeroAuth, async (req, res) => {
  try {
    const alias = await query(
      `SELECT id, alias, monto_maximo AS montoMaximo, monto_usado AS montoUsado, activo
       FROM alias
       ORDER BY activo DESC, alias ASC`
    );
    res.json({ ok: true, alias });
  } catch (error) {
    console.error("❌ Error obteniendo alias:", error.message);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

app.post("/api/cajero/asignar-usuario", requireCajeroAuth, async (req, res) => {
  const telefono = authStore.normalizePhone(req.body.telefono);
  const nick = (req.body.nick || "").trim();

  if (!telefono || !nick) {
    return res.status(400).json({ ok: false, error: "invalid_request" });
  }

  try {
    const cliente = await getClienteByTelefono(telefono);
    if (!cliente) {
      return res.status(404).json({ ok: false, error: "cliente_not_found" });
    }

    await pool.query("UPDATE clientes SET nick = ?, actualizado_en = NOW() WHERE id = ?", [nick, cliente.id]);
    const updated = await getClienteById(cliente.id);

    io.emit("cajero:cliente-actualizado", {
      telefono: updated.telefono,
      nick: updated.nick,
    });

    res.json({ ok: true, cliente: { id: updated.id, nick: updated.nick, telefono: updated.telefono } });
  } catch (error) {
    if (error && error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ ok: false, error: "nick_in_use" });
    }
    console.error("❌ Error asignando usuario:", error.message);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

app.post("/api/cajero/solicitar-pago", requireCajeroAuth, async (req, res) => {
  const telefono = authStore.normalizePhone(req.body.telefono);
  const monto = safeNumber(req.body.monto);
  const aliasId = safeNumber(req.body.aliasId);

  if (!telefono || !monto || monto <= 0 || !aliasId) {
    return res.status(400).json({ ok: false, error: "invalid_request" });
  }

  try {
    const cliente = await getClienteByTelefono(telefono);
    if (!cliente) {
      return res.status(404).json({ ok: false, error: "cliente_not_found" });
    }

    const alias = await queryOne("SELECT id, alias FROM alias WHERE id = ?", [aliasId]);
    if (!alias) {
      return res.status(404).json({ ok: false, error: "alias_not_found" });
    }

    await pool.query(
      `INSERT INTO pagos (cajero_id, fecha, monto, estado, alias_id)
       VALUES (?, CURDATE(), ?, 'pendiente', ?)`
      , [req.cajeroSession.cajeroId, monto, alias.id]
    );

    const thread = await appendMessage(cliente.id, "cajero", `Solicitud de pago por $${monto.toFixed(2)} - Alias ${alias.alias}`);

    const mensaje = `🔔 Solicitud de pago:\n💳 Alias: ${alias.alias}\n💰 Monto: $${monto.toFixed(2)}`;

    const targetSocket = connectedClients.get(cliente.telefono);
    if (targetSocket) {
      io.to(targetSocket).emit("mensaje", {
        autor: "Cajero",
        texto: mensaje,
        telefono: cliente.telefono,
      });
    }

    io.emit("cajero:nuevoMensaje", {
      telefono: cliente.telefono,
      nick: cliente.nick,
      mensaje,
      fecha: new Date().toISOString(),
      autor: "cajero",
    });

    res.json({ ok: true, threadId: thread.id, mensaje });
  } catch (error) {
    console.error("❌ Error solicitando pago:", error.message);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

// ===============================
// Integración con Socket.IO
// ===============================
const connectedClients = new Map(); // telefono -> socketId

io.on("connection", (socket) => {
  socket.on("cliente:auth", async ({ token }) => {
    const session = sessionStore.getSession(token);
    if (!session || session.type !== "cliente") {
      socket.emit("cliente:auth-error", { error: "unauthorized" });
      return;
    }

    const cliente = await getClienteById(session.clienteId);
    if (!cliente) {
      socket.emit("cliente:auth-error", { error: "cliente_not_found" });
      return;
    }

    socket.data.sessionType = "cliente";
    socket.data.clienteId = cliente.id;
    socket.data.telefono = cliente.telefono;
    connectedClients.set(cliente.telefono, socket.id);
    socket.emit("cliente:ready", {
      telefono: cliente.telefono,
      nick: cliente.nick,
    });
  });

  socket.on("cajero:auth", async ({ token }) => {
    const session = sessionStore.getSession(token);
    if (!session || session.type !== "cajero") {
      socket.emit("cajero:auth-error", { error: "unauthorized" });
      return;
    }

    socket.data.sessionType = "cajero";
    socket.data.cajeroId = session.cajeroId;
    socket.data.cajeroNombre = session.nombre;
    socket.emit("cajero:ready", {
      id: session.cajeroId,
      nombre: session.nombre,
    });
  });

  socket.on("abrirChat", async ({ telefono }) => {
    if (socket.data.sessionType !== "cajero") return;
    if (!telefono) return;

    const thread = await fetchThreadByTelefono(telefono);
    if (!thread) {
      socket.emit("historialChat", { telefono, nick: null, mensajes: [] });
      return;
    }

    const mensajes = await fetchMessagesByThread(thread.id);
    socket.emit("historialChat", {
      telefono: thread.telefono,
      nick: thread.nick,
      mensajes,
    });
  });

  socket.on("mensajeCajero", async ({ telefono, mensaje }) => {
    if (socket.data.sessionType !== "cajero") return;
    const text = (mensaje || "").trim();
    if (!telefono || !text) return;

    try {
      const cliente = await getClienteByTelefono(telefono);
      if (!cliente) return;

      await appendMessage(cliente.id, "cajero", text);

      try {
        const telegramToken = process.env.TELEGRAM_TOKEN;
        const chatId = process.env.TELEGRAM_CHAT_ID;
        if (telegramToken && chatId) {
          const cuerpo = `📨 Respuesta del cajero:\n👤 ${cliente.nick}\n📱 ${cliente.telefono}\n💬 ${text}`;
          await axios.post(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
            chat_id: chatId,
            text: cuerpo,
          });
        }
      } catch (error) {
        console.error("❌ Error reenviando respuesta del cajero a Telegram:", error.message);
      }

      const targetSocket = connectedClients.get(cliente.telefono);
      if (targetSocket) {
        io.to(targetSocket).emit("mensaje", {
          autor: "Cajero",
          texto: text,
          telefono: cliente.telefono,
        });
      }

      io.emit("cajero:nuevoMensaje", {
        telefono: cliente.telefono,
        nick: cliente.nick,
        mensaje: text,
        fecha: new Date().toISOString(),
        autor: "cajero",
      });
    } catch (error) {
      console.error("❌ Error enviando mensaje del cajero:", error.message);
    }
  });

  socket.on("asignarUsuario", async ({ telefono, nick }, ack) => {
    if (socket.data.sessionType !== "cajero") return;
    const normalizedPhone = authStore.normalizePhone(telefono);
    const desiredNick = (nick || "").trim();
    if (!normalizedPhone || !desiredNick) {
      if (ack) ack({ ok: false, error: "invalid_request" });
      return;
    }

    try {
      const cliente = await getClienteByTelefono(normalizedPhone);
      if (!cliente) {
        if (ack) ack({ ok: false, error: "cliente_not_found" });
        return;
      }

      await pool.query("UPDATE clientes SET nick = ?, actualizado_en = NOW() WHERE id = ?", [
        desiredNick,
        cliente.id,
      ]);

      const updated = await getClienteById(cliente.id);
      io.emit("cajero:cliente-actualizado", {
        telefono: updated.telefono,
        nick: updated.nick,
      });
      if (ack) ack({ ok: true, cliente: updated });
    } catch (error) {
      if (error && error.code === "ER_DUP_ENTRY") {
        if (ack) ack({ ok: false, error: "nick_in_use" });
        return;
      }
      console.error("❌ Error asignando usuario via socket:", error.message);
      if (ack) ack({ ok: false, error: "server_error" });
    }
  });

  socket.on("disconnect", () => {
    if (socket.data && socket.data.telefono) {
      connectedClients.delete(socket.data.telefono);
    }
  });
});

// ===============================
// Proxy para embeber sitios externos
// ===============================
const fetch = require("node-fetch");

app.get("/embed/:sitio", async (req, res) => {
  const siteMap = {
    ganamos: "https://ganamos-ar.net/",
  };

  const target = siteMap[req.params.sitio];
  if (!target) return res.status(404).send("Sitio no autorizado");

  try {
    const upstream = await fetch(target, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    let html = await upstream.text();

    const baseTag = `<base href="${target}">`;
    html = html.replace(/<head[^>]*>/i, (m) => `${m}\n${baseTag}`);

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (err) {
    console.error("❌ Error al obtener página externa:", err.message);
    res.status(500).send("No se pudo cargar el sitio remoto.");
  }
});

// ===============================
// Inicialización del servidor
// ===============================
async function bootstrap() {
  try {
    await ensureDatabase();
    pool = mysql.createPool(dbConfig);
    await ensureTables();

    server.listen(PORT, () => {
      console.log(`✅ Servidor funcionando en http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("❌ No se pudo inicializar el servidor:", error);
    process.exit(1);
  }
}

bootstrap();
