// ===============================
// cajero.js — Panel estilo WhatsApp
// ===============================

const socket = io();

const chatList = document.getElementById('chatList');
const chatTitle = document.getElementById('chatTitle');
const chatSubtitle = document.getElementById('chatSubtitle');
const chatForm = document.getElementById('chatForm');
const msgInput = document.getElementById('msgInput');
const actions = document.getElementById('actions');
const btnPago = document.getElementById('btnPago');
const btnAsignar = document.getElementById('btnAsignar');
const messages = document.getElementById('messages');
const emptyState = document.getElementById('emptyState');
const chatSearch = document.getElementById('chatSearch');

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

  if (autor === 'usuario' && telefono !== chatActivo) {
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

  socket.emit('abrirChat', telefono);
}

// 📩 Recibe nuevos mensajes desde el backend
socket.on('nuevoMensajeUsuario', ({ telefono, mensaje }) => {
  pushMessage(telefono, 'usuario', mensaje);
});

// 📜 Cargar historial completo del chat activo
socket.on('historialChat', (historial) => {
  if (!chatActivo) return;
  const chat = ensureChat(chatActivo);
  const base = Date.now();
  chat.messages = historial.map((msg, index) => ({
    autor: msg.autor === 'cajero' ? 'cajero' : 'usuario',
    mensaje: msg.mensaje,
    timestamp: base + index,
  }));

  if (chat.messages.length) {
    const last = chat.messages[chat.messages.length - 1];
    chat.lastMessage = last.mensaje;
    chat.lastTimestamp = last.timestamp;
  } else {
    chat.lastMessage = '';
    chat.lastTimestamp = 0;
  }
  chat.unread = 0;

  updateHeader();
  renderChatList(chatSearch.value);
  renderMessages(chat);
});

// 📤 Enviar respuesta del cajero
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

// 🧭 Seleccionar chat desde la lista
chatList.addEventListener('click', (event) => {
  const item = event.target.closest('.chat-item[data-phone]');
  if (!item) return;
  if (item.dataset.phone === chatActivo) return;
  selectChat(item.dataset.phone);
});

// 🔍 Buscador en la lista de conversaciones
chatSearch.addEventListener('input', (event) => {
  renderChatList(event.target.value);
});

// ===============================
// 💰 Función: Solicitar Pago
// ===============================
btnPago.addEventListener('click', () => {
  if (!chatActivo) {
    alert('Selecciona un chat primero.');
    return;
  }

  const monto = prompt('Ingresa el monto a cobrar (en ARS):');
  if (!monto || Number.isNaN(Number(monto))) {
    alert('Monto inválido.');
    return;
  }

  const linkPago = `https://ejemplo-pago.com/pagar?monto=${monto}&cliente=${encodeURIComponent(chatActivo)}`;
  const texto = `🔗 Solicitud de pago: ${monto} ARS\nHacé clic para pagar:\n${linkPago}`;

  pushMessage(chatActivo, 'cajero', texto);
  socket.emit('mensajeCajero', { telefono: chatActivo, mensaje: texto });
});

// ===============================
// 👤 Función: Asignar Usuario
// ===============================
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

  const chat = ensureChat(chatActivo);
  chat.displayName = nombre.trim();
  pushMessage(chatActivo, 'cajero', `📛 Se asignó el usuario "${chat.displayName}" a ${chatActivo}.`);
  updateHeader();
  socket.emit('asignarUsuario', { telefono: chatActivo, nombre: chat.displayName });
});

// ===============================
// Estado inicial
// ===============================
updateHeader();
renderChatList();
