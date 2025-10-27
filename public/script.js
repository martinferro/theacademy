// script.js

async function requestCode() {
  const phone = document.getElementById("phone").value;
  const res = await fetch("/api/auth/request-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone }),
  });
  const data = await res.json();
  if (data.ok) {
    alert("Código enviado. Revisá tu SMS 📱");
  } else {
    alert("Error: " + data.error);
  }
}

async function verifyCode() {
  const phone = document.getElementById("phone").value;
  const code = document.getElementById("code").value;
  const res = await fetch("/api/auth/verify-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, code }),
  });
  const data = await res.json();
  if (data.ok) {
    alert("✅ Verificación correcta");
  } else {
    alert("❌ Código incorrecto o expirado");
  }
}
const socket = io();

let telefonoVerificado = null;

// Cuando el usuario termina la verificación:
function onVerificacionExitosa(telefono) {
  telefonoVerificado = telefono;
  socket.emit("registrarTelefono", telefono);
  document.getElementById("verifiedPhone").textContent = `Teléfono verificado: ${telefono}`;
  document.getElementById("chatSection").hidden = false;
}

// Enviar mensaje
document.getElementById("chatForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("messageInput");
  const mensaje = input.value.trim();
  if (!mensaje) return;

  agregarMensaje("Tú", mensaje);

  await fetch("/api/mensaje", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mensaje, telefono: telefonoVerificado }),
  });

  input.value = "";
});

// Mostrar mensaje entrante (desde Telegram)
socket.on("mensaje", ({ autor, texto }) => {
  agregarMensaje(autor, texto);
});

// Render del chat
function agregarMensaje(autor, texto) {
  const chat = document.getElementById("messages");
  const msg = document.createElement("div");
  msg.className = autor === "Tú" ? "msg-user" : "msg-bot";
  msg.textContent = `${autor}: ${texto}`;
  chat.appendChild(msg);
  chat.scrollTop = chat.scrollHeight;
}
