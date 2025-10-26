const axios = require('axios');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_FROM_NUMBER;
const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;

function isConfigured() {
  if (!accountSid || !authToken) {
    return false;
  }

  if (!fromNumber && !messagingServiceSid) {
    return false;
  }

  return true;
}

async function sendWithTwilio(to, body) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const params = new URLSearchParams();
  params.append('To', to);
  params.append('Body', body);

  if (messagingServiceSid) {
    params.append('MessagingServiceSid', messagingServiceSid);
  } else if (fromNumber) {
    params.append('From', fromNumber);
  }

  const auth = {
    username: accountSid,
    password: authToken,
  };

  await axios.post(url, params, {
    auth,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });
}

async function sendVerificationCode(phone, code, { expiresInMs } = {}) {
  const minutes = Math.max(1, Math.round((expiresInMs || 5 * 60 * 1000) / 60000));
  const message = `Tu código de verificación de theacademy es: ${code}. Expira en ${minutes} minuto${
    minutes === 1 ? '' : 's'
  }.`;

  if (isConfigured()) {
    await sendWithTwilio(phone, message);
    return { delivered: true };
  }

  console.log(`[SMS MOCK] ${phone} -> ${message}`);
  return { delivered: false, mocked: true };
}

module.exports = {
  sendVerificationCode,
  isConfigured,
};
