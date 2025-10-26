const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const PUBLIC_DIR = path.join(__dirname, 'public');
const DEFAULT_FILE = path.join(PUBLIC_DIR, 'index.html');

function loadEnv() {
  if (process.env.TELEGRAM_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    return;
  }

  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    return;
  }

  const contents = fs.readFileSync(envPath, 'utf8');
  contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .forEach((line) => {
      const [key, ...rest] = line.split('=');
      const value = rest.join('=').trim();
      if (key && !(key in process.env)) {
        process.env[key.trim()] = value;
      }
    });
}

loadEnv();

const PORT = parseInt(process.env.PORT, 10) || 3000;

function sendJson(res, status, payload) {
  const data = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
  });
  res.end(data);
}

function serveStatic(req, res) {
  const requestedPath = req.url === '/' ? DEFAULT_FILE : path.join(PUBLIC_DIR, decodeURIComponent(req.url));

  if (!requestedPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Acceso denegado');
    return;
  }

  fs.readFile(requestedPath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Recurso no encontrado');
      return;
    }

    const ext = path.extname(requestedPath).toLowerCase();
    const contentType = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.svg': 'image/svg+xml',
    }[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

function forwardToTelegram(message, callback) {
  const token = process.env.TELEGRAM_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    callback(new Error('Configuración de Telegram faltante.'));
    return;
  }

  const postData = JSON.stringify({
    chat_id: chatId,
    text: message,
  });

  const requestOptions = {
    hostname: 'api.telegram.org',
    path: `/bot${token}/sendMessage`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
    },
  };

  const req = https.request(requestOptions, (telegramRes) => {
    let body = '';
    telegramRes.on('data', (chunk) => {
      body += chunk;
    });

    telegramRes.on('end', () => {
      if (telegramRes.statusCode && telegramRes.statusCode >= 200 && telegramRes.statusCode < 300) {
        callback(null, body);
      } else {
        const errorMessage = `Telegram respondió con estado ${telegramRes.statusCode}: ${body}`;
        callback(new Error(errorMessage));
      }
    });
  });

  req.on('error', (error) => {
    callback(error);
  });

  req.write(postData);
  req.end();
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET') {
    serveStatic(req, res);
    return;
  }

  if (req.method === 'POST' && req.url === '/api/mensaje') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', () => {
      let payload;
      try {
        payload = JSON.parse(body || '{}');
      } catch (error) {
        sendJson(res, 400, { error: 'JSON inválido.' });
        return;
      }

      const mensaje = payload?.mensaje?.toString().trim();
      if (!mensaje) {
        sendJson(res, 400, { error: 'El campo "mensaje" es requerido.' });
        return;
      }

      forwardToTelegram(mensaje, (error) => {
        if (error) {
          sendJson(res, 502, { error: error.message || 'No se pudo enviar el mensaje a Telegram.' });
          return;
        }

        sendJson(res, 200, {
          ok: true,
          mensaje: 'Mensaje enviado correctamente.',
          respuesta: 'Mensaje enviado correctamente.',
        });
      });
    });

    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: 'Ruta no encontrada.' }));
});

server.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});

module.exports = server;
