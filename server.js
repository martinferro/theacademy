const path = require('path');
const express = require('express');
const axios = require('axios');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = parseInt(process.env.PORT, 10) || 3000;

function ensureTelegramConfig() {
  const { TELEGRAM_TOKEN, TELEGRAM_CHAT_ID } = process.env;
  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    throw new Error('Faltan TELEGRAM_TOKEN o TELEGRAM_CHAT_ID en las variables de entorno.');
  }
}

async function forwardToTelegram(message) {
  ensureTelegramConfig();

  const token = process.env.TELEGRAM_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  const response = await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
    chat_id: chatId,
    text: message,
  });

  return response.data;
}

const app = express();

app.use(express.json());
app.use(express.static(PUBLIC_DIR));

app.post('/api/mensaje', async (req, res) => {
  const mensaje = req.body?.mensaje?.toString().trim();

  if (!mensaje) {
    res.status(400).json({ error: 'El campo "mensaje" es requerido.' });
    return;
  }

  try {
    await forwardToTelegram(mensaje);
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
});

module.exports = server;
