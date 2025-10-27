// ===============================
// cajero.js — Panel con funciones extendidas
// ===============================

const socket = io();
const chatList = document.getElementById('chatList');
const messages = document.getElementById('messages');
const chatTitle = document.getElementById('chatTitle');
const chatForm = document.getElementById('chatForm');
const msgInput = document.getElementById('msgInput');
const actions = document.getElementById('actions');
const btnPago = document.getElementById('btnPago');
const btnAsignar = document.getElementById('btnAsignar');

let chatActivo = null;

// 📩 Recibe nuevos mensajes desde el backend
socket.on('nuevoMensajeUsuario', ({ telefono, mensaje }) => {
  let li = document.querySelector(`li[data-phone="${telefono}"]`);
  if (!li) {
    li = document.createElement('li');
    li.dataset.phone = telefono;
    li.textContent = `${telefono} (${mensaje.slice(0, 25)}...)`;
    chatList.appendChild(li);
  }
  if (chatActivo === telefono) agregarMensaje('usuario', mensaje);
});

// 🧾 Abrir un chat
chatList.addEventListener('click', (e) => {
  if (e.target.tagName === 'LI') {
    chatActivo = e.target.dataset.phone;
    chatTitle.textContent = `Chat con ${chatActivo}`;
    messages.innerHTML = '';
    chatForm.hidden = false;
    actions.hidden = false;

    socket.emit('abrirChat', chatActivo);
  }
});

// 📜 Cargar historial
socket.on('historialChat', (historial) => {
  messages.innerHTML = '';
  historial.forEach(msg => agregarMensaje(msg.autor, msg.mensaje));
});

// 📤 Enviar respuesta
chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const texto = msgInput.value.trim();
  if (!texto) return;
  agregarMensaje('cajero', texto);
  socket.emit('mensajeCajero', { telefono: chatActivo, mensaje: texto });
  msgInput.value = '';
});

// 💬 Mostrar mensaje
function agregarMensaje(autor, texto) {
  const div = document.createElement('div');
  div.classList.add('msg', autor === 'cajero' ? 'cajero' : 'user');
  div.textContent = texto;
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

// ===============================
// 💰 Función: Solicitar Pago
// ===============================
btnPago.addEventListener('click', async () => {
  if (!chatActivo) return alert('Selecciona un chat primero.');
  const monto = prompt('Ingresa el monto a cobrar (en ARS):');
  if (!monto || isNaN(monto)) return alert('Monto inválido.');

  const linkPago = `https://ejemplo-pago.com/pagar?monto=${monto}&cliente=${encodeURIComponent(chatActivo)}`;
  const texto = `🔗 Solicitud de pago: ${monto} ARS\nHacé clic para pagar:\n${linkPago}`;

  agregarMensaje('cajero', texto);
  socket.emit('mensajeCajero', { telefono: chatActivo, mensaje: texto });
});

// ===============================
// 👤 Función: Asignar Usuario
// ===============================
btnAsignar.addEventListener('click', async () => {
  if (!chatActivo) return alert('Selecciona un chat primero.');
  const nombre = prompt('Ingresa el nombre de usuario para este número:');
  if (!nombre) return alert('Debe ingresar un nombre.');

  agregarMensaje('cajero', `📛 Se asignó el usuario "${nombre}" a ${chatActivo}.`);
  socket.emit('asignarUsuario', { telefono: chatActivo, nombre });
});
