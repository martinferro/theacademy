const TOKEN_KEY = 'theacademy.cajero.token';

const socket = io();

const loginOverlay = document.getElementById('cajeroLogin');
const loginForm = document.getElementById('cajeroLoginForm');
const loginError = document.getElementById('cajeroLoginError');
const appShell = document.querySelector('.app-shell');

const chatList = document.getElementById('chatList');
const chatTitle = document.getElementById('chatTitle');
const chatSubtitle = document.getElementById('chatSubtitle');
const chatForm = document.getElementById('chatForm');
const msgInput = document.getElementById('msgInput');
const actions = document.getElementById('actions');
const btnPago = document.getElementById('btnPago');
const btnAsignar = document.getElementById('btnAsignar');
const btnLogout = document.getElementById('btnLogout');
const messages = document.getElementById('messages');
const emptyState = document.getElementById('emptyState');
const chatSearch = document.getElementById('chatSearch');

let token = null;
let cajeroInfo = null;
let aliasDisponibles = [];
let chatActivo = null;
const chats = new Map();

function normalizeText(value) {
  if (!value) return '';
  return value
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function ensureChat(telefono) {
  if (!chats.has(telefono)) {
    chats.set(telefono, {
      telefono,
      displayName: null,
      messages: [],
      lastMessage: '',
      lastTimestamp: 0,
      unread: 0,
    });
  }
  return chats.get(telefono);
}

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function initialsFrom(text) {
  if (!text) return '??';
  const clean = text.replace(/[^\p{L}\p{N}\s+]/gu, ' ').trim();
  if (!clean) return text.slice(-2).toUpperCase();
  const parts = clean.split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function renderChatList(filter = '') {
  const normalized = normalizeText(filter);
  const items = Array.from(chats.values())
    .filter((chat) => {
      const name = chat.displayName || '';
      const matchableName = normalizeText(name);
      const matchablePhone = normalizeText(chat.telefono);
      return (
        !normalized ||
        matchableName.includes(normalized) ||
        matchablePhone.includes(normalized)
      );
    })
    .sort((a, b) => (b.lastTimestamp || 0) - (a.lastTimestamp || 0));

  chatList.innerHTML = '';

  if (!items.length) {
    const li = document.createElement('li');
    li.className = 'chat-item';
    li.style.cursor = 'default';
    const info = document.createElement('div');
    info.className = 'chat-info';

    const title = document.createElement('span');
    title.className = 'chat-name';
    title.textContent = normalized ? 'Sin resultados' : 'Sin chats activos por ahora';

    const preview = document.createElement('span');
    preview.className = 'chat-preview';
    preview.textContent = normalized
      ? 'No encontramos chats que coincidan con tu búsqueda.'
      : 'Cuando llegue un mensaje aparecerá automáticamente en este listado.';

    info.append(title, preview);
    li.append(info);
    chatList.append(li);
    return;
  }

  items.forEach((chat) => {
    const li = document.createElement('li');
    li.className = `chat-item${chat.telefono === chatActivo ? ' active' : ''}`;
    li.dataset.phone = chat.telefono;

    const avatar = document.createElement('div');
    avatar.className = 'chat-avatar';
    avatar.textContent = initialsFrom(chat.displayName || chat.telefono);

    const info = document.createElement('div');
    info.className = 'chat-info';

    const top = document.createElement('div');
    top.className = 'chat-info-top';

    const name = document.createElement('span');
    name.className = 'chat-name';
    name.textContent = chat.displayName || chat.telefono;

    const time = document.createElement('span');
    time.className = 'chat-time';
    time.textContent = chat.lastTimestamp ? formatTime(chat.lastTimestamp) : '';

    top.append(name, time);

    const preview = document.createElement('span');
    preview.className = 'chat-preview';
    preview.textContent = chat.lastMessage || 'Sin mensajes todavía';

    info.append(top, preview);
    li.append(avatar, info);

    if (chat.unread && chat.telefono !== chatActivo) {
      const badge = document.createElement('span');
      badge.className = 'chat-badge';
      badge.textContent = chat.unread;
      li.append(badge);
    }

    chatList.append(li);
  });
}

function renderMessages(chat) {
  if (!chat) return;
  messages.innerHTML = '';

  chat.messages.forEach((message) => {
    const bubble = document.createElement('div');
    bubble.classList.add('message', message.autor === 'cajero' ? 'cajero' : 'user');

    const text = document.createElement('p');
    text.textContent = message.mensaje;

    const meta = document.createElement('span');
    meta.className = 'message-time';
    meta.textContent = formatTime(message.timestamp);

    bubble.append(text, meta);
    messages.append(bubble);
  });

  messages.scrollTop = messages.scrollHeight;
}

function updateHeader() {
  if (!chatActivo) {
    chatTitle.textContent = 'Selecciona un chat';
    chatSubtitle.textContent = 'El historial aparecerá aquí cuando abras una conversación';
    actions.classList.add('hidden');
    chatForm.classList.add('hidden');
    messages.classList.add('hidden');
    emptyState.classList.remove('hidden');
    return;
  }

  const chat = ensureChat(chatActivo);
  chatTitle.textContent = chat.displayName || `Chat con ${chat.telefono}`;
  chatSubtitle.textContent = chat.displayName
    ? `Teléfono ${chat.telefono}`
    : 'Conversación activa en tiempo real';

  actions.classList.remove('hidden');
  chatForm.classList.remove('hidden');
  emptyState.classList.add('hidden');
  messages.classList.remove('hidden');
}

function pushMessage(telefono, autor, mensaje, timestamp = Date.now()) {
  const chat = ensureChat(telefono);
  chat.messages.push({ autor, mensaje, timestamp });
  chat.lastMessage = mensaje;
  chat.lastTimestamp = timestamp;

  if (autor === 'cliente' && telefono !== chatActivo) {
    chat.unread = (chat.unread || 0) + 1;
  }

  if (telefono === chatActivo) {
    chat.unread = 0;
    renderMessages(chat);
  }

  renderChatList(chatSearch.value);
  return chat;
}

function selectChat(telefono) {
  chatActivo = telefono;
  const chat = ensureChat(telefono);
  chat.unread = 0;

  updateHeader();
  renderChatList(chatSearch.value);
  renderMessages(chat);

  socket.emit('abrirChat', { telefono });
}

function setToken(newToken) {
  token = newToken;
  if (token) {
    sessionStorage.setItem(TOKEN_KEY, token);
    socket.emit('cajero:auth', { token });
  } else {
    sessionStorage.removeItem(TOKEN_KEY);
  }
}

function handleUnauthorized(reason) {
  const previousToken = token;
  token = null;
  cajeroInfo = null;
  aliasDisponibles = [];
  chatActivo = null;
  chats.clear();
  if (chatSearch) {
    chatSearch.value = '';
  }
  chatList.innerHTML = '';
  messages.innerHTML = '';
  updateHeader();

  if (previousToken) {
    socket.emit('cajero:logout', { token: previousToken });
  }

  sessionStorage.removeItem(TOKEN_KEY);
  appShell.dataset.authenticated = 'false';
  loginOverlay.classList.remove('hidden');
  loginOverlay.removeAttribute('aria-hidden');
  loginError.textContent = reason ? traducirError(reason) : '';
}

async function loginCajero(event) {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const payload = Object.fromEntries(formData.entries());

  try {
    const response = await fetch('/api/cajero/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      loginError.textContent = traducirError(data.error || 'invalid_credentials');
      return;
    }

    cajeroInfo = data.cajero;
    setToken(data.token);
    loginOverlay.classList.add('hidden');
    loginOverlay.setAttribute('aria-hidden', 'true');
    appShell.dataset.authenticated = 'true';
    await cargarInicial();
    loginError.textContent = '';
  } catch (error) {
    console.error(error);
    loginError.textContent = 'No pudimos iniciar sesión. Intenta nuevamente.';
  }
}

async function restaurarSesion() {
  const stored = sessionStorage.getItem(TOKEN_KEY);
  if (!stored) return;

  try {
    const response = await fetch('/api/auth/session', {
      headers: { Authorization: `Bearer ${stored}` },
    });
    const data = await response.json();
    if (response.status === 401 || response.status === 403) {
      sessionStorage.removeItem(TOKEN_KEY);
      if (response.status === 403) {
        loginError.textContent = traducirError(data.error || 'user_inactive');
      }
      return;
    }

    if (!response.ok || !data.ok || data.type !== 'cajero') {
      sessionStorage.removeItem(TOKEN_KEY);
      return;
    }

    token = stored;
    cajeroInfo = data.cajero;
    socket.emit('cajero:auth', { token });
    loginOverlay.classList.add('hidden');
    loginOverlay.setAttribute('aria-hidden', 'true');
    appShell.dataset.authenticated = 'true';
    await cargarInicial();
  } catch (error) {
    console.error(error);
    sessionStorage.removeItem(TOKEN_KEY);
  }
}

async function cargarInicial() {
  await Promise.all([cargarChats(), cargarAlias()]);
  renderChatList(chatSearch.value);
  updateHeader();
}

async function cargarChats() {
  if (!token) return;
  try {
    const response = await fetch('/api/cajero/chats', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    if (response.status === 401 || response.status === 403) {
      handleUnauthorized(data.error || (response.status === 403 ? 'user_inactive' : 'unauthorized'));
      return;
    }
    if (!response.ok || !data.ok) throw new Error('chats');

    data.chats.forEach((item) => {
      const chat = ensureChat(item.telefono);
      chat.displayName = item.nick || item.telefono;
      chat.lastMessage = item.ultimoMensaje || '';
      chat.lastTimestamp = item.fechaUltima ? new Date(item.fechaUltima).getTime() : 0;
    });
  } catch (error) {
    console.error('Error cargando chats', error);
  }
}

async function cargarAlias() {
  if (!token) return;
  try {
    const response = await fetch('/api/cajero/alias', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    if (response.status === 401 || response.status === 403) {
      handleUnauthorized(data.error || (response.status === 403 ? 'user_inactive' : 'unauthorized'));
      return;
    }
    if (!response.ok || !data.ok) throw new Error('alias');
    aliasDisponibles = data.alias.filter((item) => Number(item.activo));
  } catch (error) {
    console.error('Error cargando alias', error);
    aliasDisponibles = [];
  }
}

function traducirError(code) {
  const map = {
    invalid_credentials: 'Usuario o contraseña incorrectos.',
    user_not_found: 'No encontramos el usuario ingresado.',
    user_inactive: 'Tu usuario está inactivo.',
    unauthorized: 'Tu sesión expiró. Ingresá nuevamente.',
    server_error: 'Tuvimos un problema inesperado. Intenta de nuevo.',
    logged_out: 'Cerraste sesión correctamente.',
    nick_in_use: 'Ese NICK ya está asignado a otro cliente.',
    cliente_not_found: 'No encontramos el cliente.',
    alias_not_found: 'El alias seleccionado no existe.',
    invalid_request: 'Revisa los datos ingresados.',
  };
  return map[code] || 'Ocurrió un error inesperado.';
}

function seleccionarAlias() {
  if (!aliasDisponibles.length) {
    alert('No hay alias activos configurados. Contactá al administrador.');
    return null;
  }

  const opciones = aliasDisponibles
    .map((alias, index) => `${index + 1}. ${alias.alias} (máx $${Number(alias.montoMaximo).toFixed(2)})`)
    .join('\n');

  const seleccion = prompt(`Selecciona un alias ingresando el número correspondiente:\n${opciones}`);
  if (!seleccion) return null;
  const idx = Number.parseInt(seleccion, 10) - 1;
  if (!Number.isInteger(idx) || idx < 0 || idx >= aliasDisponibles.length) {
    alert('Selección inválida.');
    return null;
  }
  return aliasDisponibles[idx];
}

async function logoutCajero() {
  if (!token) {
    handleUnauthorized('logged_out');
    return;
  }

  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (error) {
    console.error('Error cerrando sesión', error);
  } finally {
    handleUnauthorized('logged_out');
  }
}

chatForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!chatActivo) return;
  const texto = msgInput.value.trim();
  if (!texto) return;

  pushMessage(chatActivo, 'cajero', texto);
  socket.emit('mensajeCajero', { telefono: chatActivo, mensaje: texto });
  msgInput.value = '';
  msgInput.focus();
});

chatList.addEventListener('click', (event) => {
  const item = event.target.closest('.chat-item[data-phone]');
  if (!item) return;
  if (item.dataset.phone === chatActivo) return;
  selectChat(item.dataset.phone);
});

chatSearch.addEventListener('input', (event) => {
  renderChatList(event.target.value);
});

btnPago.addEventListener('click', async () => {
  if (!chatActivo) {
    alert('Selecciona un chat primero.');
    return;
  }

  const alias = seleccionarAlias();
  if (!alias) return;

  const montoStr = prompt('Ingresa el monto a cobrar (en ARS):');
  if (!montoStr) return;
  const monto = Number(montoStr);
  if (!Number.isFinite(monto) || monto <= 0) {
    alert('Monto inválido.');
    return;
  }

  try {
    const response = await fetch('/api/cajero/solicitar-pago', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ telefono: chatActivo, monto, aliasId: alias.id }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      alert(traducirError(data.error || 'invalid_request'));
      return;
    }

    const texto = `🔔 Solicitud de pago: $${monto.toFixed(2)} - Alias ${alias.alias}`;
    pushMessage(chatActivo, 'cajero', texto);
    alert('Solicitud enviada correctamente.');
  } catch (error) {
    console.error(error);
    alert('No pudimos generar la solicitud de pago.');
  }
});

btnAsignar.addEventListener('click', () => {
  if (!chatActivo) {
    alert('Selecciona un chat primero.');
    return;
  }

  const nombre = prompt('Ingresa el nombre de usuario para este número:');
  if (!nombre) {
    alert('Debe ingresar un nombre.');
    return;
  }

  socket.emit('asignarUsuario', { telefono: chatActivo, nick: nombre.trim() }, (response) => {
    if (!response?.ok) {
      alert(traducirError(response?.error));
      return;
    }
    const chat = ensureChat(chatActivo);
    chat.displayName = response.cliente.nick;
    pushMessage(chatActivo, 'cajero', `📛 Se asignó el usuario "${response.cliente.nick}" a ${chatActivo}.`);
    updateHeader();
  });
});

if (btnLogout) {
  btnLogout.addEventListener('click', () => {
    logoutCajero();
  });
}

socket.on('cajero:auth-error', ({ error } = {}) => {
  handleUnauthorized(error || 'unauthorized');
});

socket.on('cajero:ready', () => {
  // Conexión autenticada
});

socket.on('cajero:nuevoMensaje', ({ telefono, nick, mensaje, fecha, autor }) => {
  const chat = ensureChat(telefono);
  chat.displayName = nick || chat.displayName || telefono;

  const timestamp = fecha ? new Date(fecha).getTime() : Date.now();
  const sender = autor === 'cajero' ? 'cajero' : 'cliente';

  const last = chat.messages[chat.messages.length - 1];
  if (
    sender === 'cajero' &&
    last &&
    last.autor === 'cajero' &&
    last.mensaje === mensaje &&
    Math.abs((last.timestamp || 0) - timestamp) < 1500
  ) {
    return;
  }

  pushMessage(telefono, sender, mensaje, timestamp);
  if (!chatActivo) {
    renderChatList(chatSearch.value);
  }
});

socket.on('cajero:cliente-actualizado', ({ telefono, nick }) => {
  const chat = ensureChat(telefono);
  chat.displayName = nick || telefono;
  if (telefono === chatActivo) {
    updateHeader();
  }
  renderChatList(chatSearch.value);
});

socket.on('historialChat', ({ telefono, nick, mensajes: historial }) => {
  if (!telefono) return;
  const chat = ensureChat(telefono);
  chat.displayName = nick || chat.displayName || telefono;
  chat.messages = (historial || []).map((msg) => ({
    autor: msg.autor === 'cajero' ? 'cajero' : 'cliente',
    mensaje: msg.mensaje,
    timestamp: msg.fecha ? new Date(msg.fecha).getTime() : Date.now(),
  }));
  if (chat.messages.length) {
    const last = chat.messages[chat.messages.length - 1];
    chat.lastMessage = last.mensaje;
    chat.lastTimestamp = last.timestamp;
  } else {
    chat.lastMessage = '';
    chat.lastTimestamp = 0;
  }

  if (telefono === chatActivo) {
    renderMessages(chat);
    updateHeader();
  }
  renderChatList(chatSearch.value);
});

loginForm.addEventListener('submit', loginCajero);

restaurarSesion();
renderChatList();
updateHeader();
