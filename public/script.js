const STORAGE_KEY = 'theacademy.session.token';

const socket = io();
let sessionToken = null;
let clienteActual = null;
let chatThread = null;

const appShell = document.querySelector('.app-shell');
const accessCard = document.getElementById('accessCard');
const loginSection = document.getElementById('loginSection');
const loginForm = document.getElementById('loginForm');
const loginBackButton = document.getElementById('loginBackButton');
const chatSection = document.getElementById('chatSection');
const chatTitle = document.getElementById('chatTitle');
const chatSubtitle = document.getElementById('chatSubtitle');
const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const messagesList = document.getElementById('messages');
const logoutButton = document.getElementById('logoutButton');
const alertsContainer = document.getElementById('alerts');

const verificationOverlay = document.getElementById('verificationOverlay');
const closeOverlayButton = document.getElementById('closeOverlayButton');
const phoneForm = document.getElementById('phoneForm');
const codeForm = document.getElementById('codeForm');
const resendButton = document.getElementById('resendButton');
const phoneInput = document.getElementById('phoneInput');
const codeInput = document.getElementById('codeInput');

const platformLinksStatus = document.getElementById('platformLinksStatus');
const platformLinksList = document.getElementById('platformLinksList');

const quickActions = document.querySelectorAll('[data-message-template]');

function showAlert(message, type = 'info', { timeout = 5000 } = {}) {
  const alert = document.createElement('div');
  alert.className = `alert alert-${type}`;
  alert.textContent = message;
  alertsContainer.append(alert);
  if (timeout) {
    setTimeout(() => {
      alert.classList.add('fade-out');
      alert.addEventListener('transitionend', () => alert.remove(), { once: true });
    }, timeout);
  }
}

function setToken(token) {
  sessionToken = token;
  if (token) {
    localStorage.setItem(STORAGE_KEY, token);
    socket.emit('cliente:auth', { token });
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function resetAuthViews() {
  accessCard.hidden = false;
  loginSection.hidden = true;
  chatSection.hidden = true;
  appShell.classList.remove('authenticated');
  messagesList.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon">💡</div>
      <p>Selecciona una acción rápida o escribe tu consulta para comenzar.</p>
    </div>
  `;
  clienteActual = null;
  chatThread = null;
}

function openOverlay() {
  verificationOverlay.hidden = false;
  phoneForm.hidden = false;
  codeForm.hidden = true;
  phoneInput.value = '';
  codeInput.value = '';
  setTimeout(() => phoneInput.focus(), 100);
}

function closeOverlay() {
  verificationOverlay.hidden = true;
}

function renderMessage({ autor, mensaje, fecha }) {
  const row = document.createElement('div');
  const isUser = autor === 'cliente' || autor === 'Tú';
  row.className = `message-row ${isUser ? 'sent' : 'received'}`;

  const bubble = document.createElement('div');
  bubble.className = `bubble ${isUser ? 'bubble-user' : 'bubble-agent'}`;

  const authorLabel = document.createElement('span');
  authorLabel.className = 'bubble-author';
  authorLabel.textContent = isUser ? 'Tú' : 'Cajero';

  const text = document.createElement('p');
  text.className = 'bubble-text';
  text.textContent = mensaje;

  bubble.append(authorLabel, text);

  if (fecha) {
    const meta = document.createElement('span');
    meta.className = 'bubble-author';
    const date = new Date(fecha);
    if (!Number.isNaN(date.getTime())) {
      meta.textContent = date.toLocaleString('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
      });
      bubble.append(meta);
    }
  }

  row.append(bubble);
  messagesList.append(row);
  messagesList.scrollTop = messagesList.scrollHeight;
}

function renderHistory(messages = []) {
  messagesList.innerHTML = '';
  if (!messages.length) {
    messagesList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">💬</div>
        <p>No hay mensajes previos. ¡Empieza la conversación!</p>
      </div>
    `;
    return;
  }

  messages.forEach((msg) => {
    renderMessage({ autor: msg.autor, mensaje: msg.mensaje, fecha: msg.fecha });
  });
}

function applyAuthenticatedState(cliente, thread, messages = []) {
  clienteActual = cliente;
  chatThread = thread;
  accessCard.hidden = true;
  loginSection.hidden = true;
  chatSection.hidden = false;
  appShell.classList.add('authenticated');

  chatTitle.textContent = cliente.nick ? `Chat con ${cliente.nick}` : 'Cajero virtual';
  chatSubtitle.textContent = `Teléfono verificado: ${cliente.telefono}`;

  renderHistory(messages);
  messageInput.focus();
}

async function handleLogin(event) {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const payload = Object.fromEntries(formData.entries());

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok || !data.ok) {
      const error = data.error || 'No pudimos validar tus datos.';
      showAlert(traducirError(error), 'error');
      return;
    }

    setToken(data.token);
    applyAuthenticatedState(data.cliente, data.thread, data.messages);
    showAlert('¡Bienvenido de nuevo!', 'success');
  } catch (error) {
    console.error(error);
    showAlert('Error inesperado al iniciar sesión.', 'error');
  }
}

async function requestCode(event) {
  event.preventDefault();
  const phone = phoneInput.value.trim();
  if (!phone) {
    showAlert('Debes ingresar un número válido.', 'error');
    return;
  }

  try {
    const response = await fetch('/api/auth/request-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      if (data.error === 'cooldown' && data.retryAfter) {
        showAlert(`Podés solicitar otro código en ${data.retryAfter} segundos.`, 'error');
        return;
      }
      showAlert('No pudimos enviar el código. Intenta nuevamente.', 'error');
      return;
    }

    phoneForm.hidden = true;
    codeForm.hidden = false;
    showAlert('Código enviado. Revisa tus SMS.', 'success');
    setTimeout(() => codeInput.focus(), 150);
  } catch (error) {
    console.error(error);
    showAlert('Error enviando el código.', 'error');
  }
}

async function verifyCode(event) {
  event.preventDefault();
  const phone = phoneInput.value.trim();
  const code = codeInput.value.trim();
  if (!phone || !code) {
    showAlert('Necesitamos el teléfono y el código.', 'error');
    return;
  }

  try {
    const response = await fetch('/api/auth/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, code }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      const error = data.error || 'Verificación inválida.';
      showAlert(traducirError(error), 'error');
      return;
    }

    closeOverlay();
    setToken(data.token);
    applyAuthenticatedState(data.cliente, data.thread, data.messages);
    showAlert('Celular verificado. ¡Ya podés chatear!', 'success');
  } catch (error) {
    console.error(error);
    showAlert('No pudimos validar el código.', 'error');
  }
}

function traducirError(errorCode) {
  const map = {
    invalid_credentials: 'Usuario o contraseña incorrectos.',
    password_not_set: 'Tu usuario aún no tiene contraseña asignada.',
    user_not_found: 'No encontramos un cliente con ese NICK.',
    user_inactive: 'Tu usuario está inactivo. Contactá a soporte.',
    invalid_phone: 'Número de teléfono inválido.',
    code_invalid: 'El código ingresado no es válido.',
    code_expired: 'El código expiró. Solicita uno nuevo.',
    code_not_found: 'Primero debes solicitar un código.',
    sms_failed: 'No pudimos enviar el SMS. Intenta nuevamente más tarde.',
    cooldown: 'Esperá unos segundos antes de solicitar otro código.',
  };
  return map[errorCode] || 'Ocurrió un error inesperado.';
}

async function enviarMensaje(event) {
  event.preventDefault();
  if (!sessionToken) {
    showAlert('Necesitas iniciar sesión para enviar mensajes.', 'error');
    return;
  }

  const texto = messageInput.value.trim();
  if (!texto) return;

  renderMessage({ autor: 'Tú', mensaje: texto, fecha: new Date().toISOString() });
  messageInput.value = '';

  try {
    const response = await fetch('/api/mensaje', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({ mensaje: texto }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      showAlert(data.error ? traducirError(data.error) : 'No pudimos enviar tu mensaje.', 'error');
    }
  } catch (error) {
    console.error(error);
    showAlert('No pudimos enviar tu mensaje.', 'error');
  }
}

async function cerrarSesion() {
  if (sessionToken) {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });
    } catch (error) {
      console.error(error);
    }
  }

  setToken(null);
  resetAuthViews();
  showAlert('Sesión finalizada.', 'info');
}

async function restaurarSesion() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return;

  try {
    const response = await fetch('/api/auth/session', {
      headers: { Authorization: `Bearer ${stored}` },
    });
    const data = await response.json();
    if (!response.ok || !data.ok || data.type !== 'cliente') {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }

    sessionToken = stored;
    socket.emit('cliente:auth', { token: stored });
    applyAuthenticatedState(data.cliente, data.thread, data.messages);
  } catch (error) {
    console.error(error);
    localStorage.removeItem(STORAGE_KEY);
  }
}

async function cargarLinks() {
  try {
    const response = await fetch('/api/platform-links');
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error('invalid');

    platformLinksList.innerHTML = '';
    if (!data.links.length) {
      platformLinksStatus.textContent = 'No hay enlaces disponibles por el momento.';
      return;
    }

    platformLinksStatus.textContent = '';
    data.links.forEach((link) => {
      const item = document.createElement('li');
      const anchor = document.createElement('a');
      anchor.href = link.url;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.textContent = link.nombre;
      item.append(anchor);
      platformLinksList.append(item);
    });
  } catch (error) {
    console.error(error);
    platformLinksStatus.textContent = 'No se pudieron cargar los enlaces.';
  }
}

// ===============================
// Listeners de UI
// ===============================
accessCard.addEventListener('click', (event) => {
  const choice = event.target.closest('[data-choice]');
  if (!choice) return;

  if (choice.dataset.choice === 'login') {
    accessCard.hidden = true;
    loginSection.hidden = false;
    setTimeout(() => loginForm.querySelector('input').focus(), 100);
  } else {
    openOverlay();
  }
});

loginBackButton.addEventListener('click', () => {
  loginSection.hidden = true;
  accessCard.hidden = false;
});

loginForm.addEventListener('submit', handleLogin);
chatForm.addEventListener('submit', enviarMensaje);
logoutButton.addEventListener('click', cerrarSesion);
phoneForm.addEventListener('submit', requestCode);
codeForm.addEventListener('submit', verifyCode);
resendButton.addEventListener('click', requestCode);
closeOverlayButton.addEventListener('click', () => {
  closeOverlay();
  resetAuthViews();
});

quickActions.forEach((button) => {
  button.addEventListener('click', () => {
    const template = button.dataset.messageTemplate;
    if (!chatSection.hidden) {
      messageInput.value = template;
      messageInput.focus();
    } else {
      openOverlay();
    }
  });
});

// ===============================
// Eventos de socket
// ===============================
socket.on('mensaje', ({ autor, texto, telefono }) => {
  if (!clienteActual || telefono !== clienteActual.telefono) return;

  const isMine = autor === 'Tú';
  const lastBubble = messagesList.lastElementChild;
  if (
    isMine &&
    lastBubble &&
    lastBubble.querySelector('.bubble-text')?.textContent === texto
  ) {
    return;
  }

  renderMessage({ autor, mensaje: texto, fecha: new Date().toISOString() });
});

socket.on('cliente:auth-error', () => {
  setToken(null);
  resetAuthViews();
});

socket.on('cajero:cliente-actualizado', ({ telefono, nick }) => {
  if (!clienteActual || telefono !== clienteActual.telefono) return;
  clienteActual.nick = nick;
  chatTitle.textContent = `Chat con ${nick}`;
  chatSubtitle.textContent = `Teléfono verificado: ${clienteActual.telefono}`;
});

// ===============================
// Inicio
// ===============================
restaurarSesion();
cargarLinks();
