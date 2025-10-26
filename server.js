const path = require('path');
const express = require('express');
const fetch = require('node-fetch');
const twilio = require('twilio');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3000;

const verificationCodes = {};
const verifiedPhones = new Set();

function getTwilioClient() {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    throw new Error('Faltan las credenciales de Twilio en las variables de entorno.');
  }

  return twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
}

function ensureTelegramConfig() {
  const { TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID } = process.env;

  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    throw new Error('Faltan TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID en las variables de entorno.');
  }
}

function createVerificationCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/enviar-codigo', async (req, res) => {
  try {
    const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';

    if (!phone) {
      res.status(400).json({ ok: false, error: 'Número de teléfono inválido.' });
      return;
    }

    const code = createVerificationCode();
    verificationCodes[phone] = code;

    const client = getTwilioClient();
    const from = process.env.TWILIO_PHONE_NUMBER;

    if (!from) {
      throw new Error('Falta TWILIO_PHONE_NUMBER en las variables de entorno.');
    }

    await client.messages.create({
      body: `Tu código de verificación es: ${code}`,
      from,
      to: phone,
    });

    res.json({ ok: true });
  } catch (error) {
    console.error('Error al enviar el código de verificación:', error.message);
    res.status(500).json({ ok: false, error: 'No se pudo enviar el código de verificación.' });
  }
});

app.post('/api/verificar-codigo', (req, res) => {
  const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
  const code = req.body?.code != null ? String(req.body.code).trim() : '';

  if (!phone || !/^\d{6}$/.test(code)) {
    res.status(400).json({ ok: false });
    return;
  }

  const storedCode = verificationCodes[phone];
  const isValid = storedCode && storedCode === code;

  if (isValid) {
    verifiedPhones.add(phone);
    delete verificationCodes[phone];
  }

  res.json({ ok: Boolean(isValid) });
});

app.post('/api/mensaje', async (req, res) => {
  const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
  const mensaje = typeof req.body?.mensaje === 'string' ? req.body.mensaje.trim() : '';

  if (!phone || !mensaje) {
    res.status(400).json({ ok: false, error: 'Solicitud inválida.' });
    return;
  }

  if (!verifiedPhones.has(phone)) {
    res.status(403).json({ ok: false, error: 'El número no ha sido verificado.' });
    return;
  }

  try {
    ensureTelegramConfig();

    const response = await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: process.env.TELEGRAM_CHAT_ID,
          text: `📱 Nuevo mensaje de ${phone}:\n${mensaje}`,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Telegram API respondió con estado ${response.status}`);
    }

    res.json({ ok: true, result: 'Mensaje enviado correctamente ✅' });
  } catch (error) {
    console.error('Error al enviar mensaje a Telegram:', error.message);
    res.status(500).json({ ok: false, error: 'No se pudo enviar el mensaje.' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
