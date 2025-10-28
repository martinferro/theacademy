// ===============================
// theacademy - Chat Bidireccional (Web ↔ Telegram)
// ===============================

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const axios = require("axios");
const twilio = require("twilio");
const http = require("http");
const { Server } = require("socket.io");

dotenv.config();
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Variables en memoria
const codes = {};              // Para códigos SMS
const connectedClients = {};   // Para sockets activos

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;

// ===============================
// BASE DE DATOS SQLITE (auto-setup)
// ===============================
const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");


// Ruta de la carpeta y archivo
const dataDir = path.join(__dirname, "data");
const dbPath = path.join(dataDir, "theacademy.db");
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

// Crear carpeta si no existe
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log("📁 Carpeta 'data' creada automáticamente");
}

if (!fs.existsSync(platformLinksPath)) {
  fs.writeFileSync(
    platformLinksPath,
    JSON.stringify(defaultPlatformLinks, null, 2),
    "utf8"
  );
  console.log("🆕 Archivo 'platform-links.json' creado con enlaces por defecto");
}

// Crear conexión
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("❌ Error al abrir la base de datos:", err.message);
  } else {
    console.log("✅ Base de datos abierta correctamente en:", dbPath);

    // Crear estructura inicial si la DB está vacía
    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS mensajes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          origen TEXT,
          destino TEXT,
          mensaje TEXT,
          fecha DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) console.error("⚠️ Error creando tabla 'mensajes':", err.message);
        else console.log("🗂️ Tabla 'mensajes' verificada o creada correctamente");
      });
    });
  }
});

module.exports = db;



// Crear tablas si no existen
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telefono TEXT UNIQUE,
      nombre TEXT,
      fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS chats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telefono TEXT,
      activo INTEGER DEFAULT 1,
      ultimo_mensaje TEXT,
      fecha_ultima DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS mensajes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telefono TEXT,
      autor TEXT,
      mensaje TEXT,
      fecha DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS pagos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      telefono TEXT,
      monto REAL,
      link TEXT,
      estado TEXT DEFAULT 'pendiente',
      fecha DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});


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
// RUTAS BASE
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
// AUTH - Verificación por SMS (Twilio)
// ===============================
app.post("/api/auth/request-code", async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ ok: false, error: "Teléfono requerido" });

  const code = Math.floor(100000 + Math.random() * 900000);
  codes[phone] = code;
  console.log(`Código para ${phone}: ${code}`);

  try {
    const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({
      body: `Tu código de verificación de theacademy es: ${code}`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phone,
    });
    res.json({ ok: true });
  } catch (err) {
    console.error("❌ Error al enviar SMS:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post("/api/auth/verify-code", (req, res) => {
  const { phone, code } = req.body;
  if (codes[phone] && codes[phone].toString() === code.toString()) {
    delete codes[phone];

    db.run("INSERT OR IGNORE INTO usuarios (telefono) VALUES (?)", [phone]);
    db.run("INSERT OR REPLACE INTO chats (telefono, activo) VALUES (?, 1)", [phone]);

    res.json({ ok: true });
  } else {
    res.status(401).json({ ok: false, error: "Código incorrecto" });
  }
});

// ===============================
// MENSAJES WEB → TELEGRAM + CAJERO
// ===============================
app.post("/api/mensaje", async (req, res) => {
  const { telefono, mensaje } = req.body;
  if (!telefono || !mensaje) return res.status(400).json({ ok: false, error: "Faltan datos" });

  db.run("INSERT INTO mensajes (telefono, autor, mensaje) VALUES (?, ?, ?)", [telefono, "usuario", mensaje]);
  db.run("UPDATE chats SET ultimo_mensaje = ?, fecha_ultima = CURRENT_TIMESTAMP WHERE telefono = ?", [mensaje, telefono]);

  try {
    const telegramToken = process.env.TELEGRAM_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    const texto = `💬 Nuevo mensaje:\n📱 ${telefono}\n📝 ${mensaje}`;

    await axios.post(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
      chat_id: chatId,
      text: texto,
    });
  } catch (error) {
    console.error("❌ Error reenviando mensaje del usuario a Telegram:", error.message);
    return res.status(502).json({ ok: false, error: "No se pudo reenviar el mensaje a Telegram" });
  }

  io.emit("nuevoMensajeUsuario", { telefono, mensaje });
  res.json({ ok: true });
});

// ===============================
// API PAGOS
// ===============================
app.post("/api/solicitar-pago", (req, res) => {
  const { telefono, monto } = req.body;
  if (!telefono || !monto) return res.status(400).json({ ok: false, error: "Faltan datos" });

  const link = `https://pago-demo.com/pagar?tel=${telefono}&monto=${monto}`;
  db.run("INSERT INTO pagos (telefono, monto, link) VALUES (?, ?, ?)", [telefono, monto, link]);
  res.json({ ok: true, link });
});

// ===============================
// API ASIGNAR NOMBRE
// ===============================
app.post("/api/asignar-nombre", (req, res) => {
  const { telefono, nombre } = req.body;
  if (!telefono || !nombre) return res.status(400).json({ ok: false, error: "Faltan datos" });

  db.run("UPDATE usuarios SET nombre = ? WHERE telefono = ?", [nombre, telefono]);
  res.json({ ok: true });
});

// ===============================
// SOCKET.IO
// ===============================
io.on("connection", (socket) => {
  console.log("🟢 Conectado:", socket.id);

  socket.on("registrarTelefono", (telefono) => {
    connectedClients[telefono] = socket.id;
    console.log(`Teléfono ${telefono} asociado a socket ${socket.id}`);
  });

  socket.on("abrirChat", (telefono) => {
    db.all("SELECT autor, mensaje FROM mensajes WHERE telefono = ? ORDER BY fecha ASC", [telefono], (err, rows) => {
      socket.emit("historialChat", rows);
    });
  });

  socket.on("mensajeCajero", async ({ telefono, mensaje }) => {
    if (!telefono || !mensaje) return;

    db.run("INSERT INTO mensajes (telefono, autor, mensaje) VALUES (?, ?, ?)", [telefono, "cajero", mensaje]);

    let telegramDelivered = true;
    try {
      const telegramToken = process.env.TELEGRAM_TOKEN;
      const chatId = process.env.TELEGRAM_CHAT_ID;
      const texto = `📨 Respuesta del cajero:\n📱 ${telefono}\n💬 ${mensaje}`;

      await axios.post(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
        chat_id: chatId,
        text: texto,
      });
    } catch (error) {
      console.error("❌ Error enviando respuesta del cajero a Telegram:", error.message);
      telegramDelivered = false;
    }

    if (!telegramDelivered) return;

    const socketId = connectedClients[telefono];
    if (socketId) {
      io.to(socketId).emit("mensaje", { autor: "Cajero", texto: mensaje, telefono });
    }
  });

  socket.on("disconnect", () => {
    for (const tel in connectedClients) {
      if (connectedClients[tel] === socket.id) {
        delete connectedClients[tel];
        break;
      }
    }
  });
});
// ===============================
// PROXY PARA EMBEBER SITIOS EXTERNOS BLOQUEADOS
// ===============================
const fetch = require("node-fetch");

app.get("/embed/:sitio", async (req, res) => {
  const siteMap = {
    ganamos: "https://ganamos-ar.net/",
    // Podés agregar más: ejemplo.com: "https://ejemplo.com/"
  };

  const target = siteMap[req.params.sitio];
  if (!target) return res.status(404).send("Sitio no autorizado");

  try {
    const upstream = await fetch(target, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    let html = await upstream.text();

    // Inserta <base> para que funcionen los recursos relativos (CSS, JS, imágenes)
    const baseTag = `<base href="${target}">`;
    html = html.replace(/<head[^>]*>/i, (m) => `${m}\n${baseTag}`);

    // Elimina cabeceras que bloquean iframe (no se agregan al reenviar)
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (err) {
    console.error("❌ Error al obtener página externa:", err.message);
    res.status(500).send("No se pudo cargar el sitio remoto.");
  }
});

// ===============================
server.listen(PORT, () => {
  console.log(`✅ Servidor funcionando en http://localhost:${PORT}`);
});
