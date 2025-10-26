const path = require('path');
const express = require('express');
const axios = require('axios');

const {
  normalizePhone,
  canRequestCode,
  createVerificationCode,
  clearPendingCode,
  verifyCode,
  issueToken,
  validateToken,
  CODE_TTL_MS,
} = require('./lib/authStore');
const { sendVerificationCode, isConfigured: isSmsConfigured } = require('./services/smsService');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = parseInt(process.env.PORT, 10) || 3000;

function ensureTelegramConfig() {
  const { TELEGRAM_TOKEN, TELEGRAM_CHAT_ID } = process.env;
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    throw new Error('Faltan TELEGRAM_TOKEN o TELEGRAM_CHAT_ID en las variables de entorno.');
  }
}

async function forwardToTelegram({ phone, message }) {
  ensureTelegramConfig();

  const token = process.env.TELEGRAM_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  const payload = {
    chat_id: chatId,
    text: [`Mensaje verificado de ${phone}`, '', message].join('\n'),
  };

  const response = await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, payload);

  return response.data;
}

function getTokenFromRequest(req) {
  const authHeader = req.get('Authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  if (req.query?.token) {
    return String(req.query.token);
  }

  if (req.body?.token && typeof req.body.token === 'string') {
    return req.body.token;
  }

  return null;
}

function requireAuth(req, res, next) {
  const token = getTokenFromRequest(req);
  const session = validateToken(token);

  if (!session) {
    res.status(401).json({ error: 'Autenticación requerida.' });
    return;
  }

  req.session = session;
  req.token = token;
  next();
}

const app = express();

app.use(express.json());
app.use(express.static(PUBLIC_DIR));

app.post('/api/auth/request-code', async (req, res) => {
  const phone = normalizePhone(req.body?.phone ?? req.body?.telefono);

  if (!phone) {
    res.status(400).json({ error: 'Número de teléfono inválido.' });
    return;
  }

  const availability = canRequestCode(phone);
  if (!availability.allowed) {
    res.status(429).json({
      error: 'Debes esperar antes de solicitar un nuevo código.',
      retryAfter: availability.retryAfter,
    });
    return;
  }

  const { code, expiresAt } = createVerificationCode(phone);

  try {
    const delivery = await sendVerificationCode(phone, code, {
      expiresInMs: CODE_TTL_MS,
    });
    const response = {
      ok: true,
      phone,
      expiresIn: Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)),
      delivery: delivery.delivered ? 'sms' : 'mock',
    };

    if (!delivery.delivered && process.env.NODE_ENV !== 'production') {
      response.devCode = code;
    }

    res.json(response);
  } catch (error) {
    clearPendingCode(phone);
    const message =
      error?.response?.data?.message ||
      error?.message ||
      'No se pudo enviar el código de verificación.';
    res.status(502).json({ error: message });
  }
});

app.post('/api/auth/verify-code', (req, res) => {
  const phone = normalizePhone(req.body?.phone ?? req.body?.telefono);
  const rawCode = req.body?.code ?? req.body?.codigo;
  const code = typeof rawCode === 'string' || typeof rawCode === 'number' ? String(rawCode).trim() : '';

  if (!phone) {
    res.status(400).json({ error: 'Número de teléfono inválido.' });
    return;
  }

  if (!/^\d{6}$/.test(code)) {
    res.status(400).json({ error: 'El código debe tener 6 dígitos.' });
    return;
  }

  const result = verifyCode(phone, code);
  if (!result.ok) {
    const messages = {
      code_not_found: 'Solicita un nuevo código de verificación.',
      code_expired: 'El código ha expirado. Solicita uno nuevo.',
      code_invalid: 'Código incorrecto. Inténtalo nuevamente.',
    };

    res.status(400).json({
      error: messages[result.reason] || 'No se pudo validar el código.',
      attempts: result.attempts,
    });
    return;
  }

  const session = issueToken(phone);
  res.json({
    ok: true,
    token: session.token,
    phone,
    expiresIn: Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000)),
  });
});

app.get('/api/auth/status', (req, res) => {
  const token = getTokenFromRequest(req);
  const session = validateToken(token);

  if (!session) {
    res.status(401).json({ ok: false, error: 'Sesión no válida.' });
    return;
  }

  res.json({
    ok: true,
    phone: session.phone,
    expiresIn: Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000)),
  });
});

app.post('/api/mensaje', requireAuth, async (req, res) => {
  const mensaje = req.body?.mensaje?.toString().trim();

  if (!mensaje) {
    res.status(400).json({ error: 'El campo "mensaje" es requerido.' });
    return;
  }

  try {
    await forwardToTelegram({ phone: req.session.phone, message: mensaje });
  } catch (error) {
    const message =
      error?.response?.data?.description ||
      error?.message ||
      'No se pudo enviar el mensaje a Telegram.';
    res.status(502).json({ error: message });
    return;
  }

  res.json({
    ok: true,
    mensaje: 'Mensaje enviado correctamente.',
    respuesta: 'Mensaje enviado correctamente.',
  });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada.' });
});

const server = app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
  if (!isSmsConfigured()) {
    console.log('Servicio SMS no configurado. Los códigos se registrarán en la consola.');
  }
});

module.exports = server;
