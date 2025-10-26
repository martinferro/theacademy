const phoneForm = document.getElementById('phoneForm');
const codeForm = document.getElementById('codeForm');
const chatForm = document.getElementById('chatForm');
const resendButton = document.getElementById('resendButton');
const logoutButton = document.getElementById('logoutButton');
const phoneInput = document.getElementById('phoneInput');
const codeInput = document.getElementById('codeInput');
const messageInput = document.getElementById('messageInput');
const chatSection = document.getElementById('chatSection');
const verifiedPhone = document.getElementById('verifiedPhone');
const messagesContainer = document.getElementById('messages');
const alerts = document.getElementById('alerts');

let authToken = window.localStorage.getItem('authToken');
let storedPhone = window.localStorage.getItem('verifiedPhone');

function setAuthToken(token, phone) {
  authToken = token || null;

  if (authToken) {
    window.localStorage.setItem('authToken', authToken);
  } else {
    window.localStorage.removeItem('authToken');
  }

  if (phone) {
    storedPhone = phone;
    window.localStorage.setItem('verifiedPhone', phone);
  } else if (!authToken) {
    storedPhone = null;
    window.localStorage.removeItem('verifiedPhone');
  }

  updateUI();
}

function showAlert(message, type = 'info') {
  if (!alerts) return;
  const alert = document.createElement('div');
  alert.className = `alert alert-${type}`;
  alert.textContent = message;
  alerts.innerHTML = '';
  alerts.appendChild(alert);
}

function clearAlert() {
  if (alerts) {
    alerts.innerHTML = '';
  }
}

function addMessage(role, content) {
  if (!messagesContainer) return;
  const message = document.createElement('p');
  message.classList.add('message');
  message.innerHTML = `<strong>${role}:</strong> ${content}`;
  messagesContainer.appendChild(message);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function setFormDisabled(form, disabled) {
  if (!form) return;
  const elements = Array.from(form.elements);
  elements.forEach((element) => {
    element.disabled = disabled;
  });
}

function updateUI() {
  const hasToken = Boolean(authToken);
  const hasPhone = Boolean(storedPhone);

  if (phoneForm) {
    phoneForm.hidden = hasPhone;
  }
  if (codeForm) {
    codeForm.hidden = !hasPhone || hasToken;
  }
  if (chatSection) {
    chatSection.hidden = !hasToken;
  }
  if (verifiedPhone) {
    verifiedPhone.textContent = hasToken && storedPhone ? `Teléfono verificado: ${storedPhone}` : '';
  }

  if (!hasToken && hasPhone && codeInput) {
    codeInput.focus();
  } else if (!hasToken && !hasPhone && phoneInput) {
    phoneInput.focus();
  } else if (hasToken && messageInput) {
    messageInput.focus();
  }
}

async function requestStatus(token = authToken) {
  if (!token) {
    updateUI();
    return;
  }

  try {
    const response = await fetch('/api/auth/status', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      setAuthToken(null);
      return;
    }

    const data = await response.json();
    setAuthToken(token, data.phone);
  } catch (error) {
    console.error(error);
  }
}

async function requestCode(phone) {
  const response = await fetch('/api/auth/request-code', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ phone }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error || `Error ${response.status}`);
  }

  if (data?.phone) {
    storedPhone = data.phone;
    window.localStorage.setItem('verifiedPhone', data.phone);
  }

  if (data?.devCode) {
    showAlert(`Código de verificación (solo desarrollo): ${data.devCode}`, 'info');
  } else {
    showAlert('Código enviado. Revisa tu SMS.', 'success');
  }

  updateUI();
}

async function verifyCode(code) {
  if (!storedPhone) {
    throw new Error('Primero solicita un código con tu número de teléfono.');
  }

  const response = await fetch('/api/auth/verify-code', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ phone: storedPhone, code }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data?.error || `Error ${response.status}`);
  }

  setAuthToken(data.token, data.phone);
  showAlert('Teléfono verificado correctamente. Ya puedes chatear.', 'success');
  if (messagesContainer) {
    messagesContainer.innerHTML = '';
  }
  addMessage('Sistema', 'Autenticación completada. Envía tu mensaje para Telegram.');
}

async function sendMessage(text) {
  if (!authToken) {
    throw new Error('Debes verificar tu teléfono antes de enviar mensajes.');
  }

  const response = await fetch('/api/mensaje', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({ mensaje: text }),
  });

  const data = await response.json().catch(() => ({}));

  if (response.status === 401) {
    setAuthToken(null);
    throw new Error('Tu sesión expiró. Verifica nuevamente tu teléfono.');
  }

  if (!response.ok) {
    throw new Error(data?.error || `Error ${response.status}`);
  }

  return data;
}

phoneForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearAlert();
  const phone = phoneInput?.value.trim();
  if (!phone) return;

  setFormDisabled(phoneForm, true);
  try {
    await requestCode(phone);
  } catch (error) {
    console.error(error);
    showAlert(error.message || 'No se pudo enviar el código.', 'error');
  } finally {
    setFormDisabled(phoneForm, false);
  }
});

codeForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearAlert();
  const code = codeInput?.value.trim();
  if (!code) return;

  setFormDisabled(codeForm, true);
  try {
    await verifyCode(code);
    codeInput.value = '';
  } catch (error) {
    console.error(error);
    showAlert(error.message || 'No se pudo verificar el código.', 'error');
  } finally {
    setFormDisabled(codeForm, false);
  }
});

resendButton?.addEventListener('click', async () => {
  clearAlert();
  if (!storedPhone) {
    showAlert('Ingresa tu número de teléfono primero.', 'error');
    return;
  }

  setFormDisabled(codeForm, true);
  try {
    await requestCode(storedPhone);
  } catch (error) {
    console.error(error);
    showAlert(error.message || 'No se pudo reenviar el código.', 'error');
  } finally {
    setFormDisabled(codeForm, false);
  }
});

chatForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearAlert();

  const text = messageInput?.value.trim();
  if (!text) {
    return;
  }

  addMessage('Tú', text);
  messageInput.value = '';
  messageInput.focus();

  try {
    await sendMessage(text);
    addMessage('Sistema', 'Mensaje enviado correctamente.');
  } catch (error) {
    console.error(error);
    addMessage('Error', error.message || 'No se pudo enviar el mensaje.');
  }
});

logoutButton?.addEventListener('click', () => {
  setAuthToken(null);
  storedPhone = null;
  window.localStorage.removeItem('verifiedPhone');
  clearAlert();
  if (messagesContainer) {
    messagesContainer.innerHTML = '';
  }
  addMessage('Sistema', 'Sesión cerrada. Vuelve a verificar tu número para continuar.');
});

if (authToken) {
  requestStatus(authToken);
} else {
  updateUI();
}
