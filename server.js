require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/', (_req, res) => {
  res.send('Servidor funcionando ✅');
});

app.post('/api/mensaje', async (req, res) => {
  const { mensaje } = req.body || {};
  const { TELEGRAM_TOKEN, TELEGRAM_CHAT_ID } = process.env;

  if (!mensaje) {
    return res.status(400).json({ error: 'El campo "mensaje" es requerido.' });
  }

  if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
    return res.status(500).json({ error: 'Configuración de Telegram faltante.' });
  }

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
    await axios.post(url, {
      chat_id: TELEGRAM_CHAT_ID,
      text: mensaje,
    });

    return res.status(200).json({ ok: true, mensaje: 'Mensaje enviado correctamente.' });
  } catch (error) {
    console.error('Error enviando mensaje a Telegram:', error.response?.data || error.message);
    return res.status(502).json({ error: 'No se pudo enviar el mensaje a Telegram.' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);
});

module.exports = app;
