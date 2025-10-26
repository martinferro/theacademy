const buyButton = document.getElementById('buyButton');
const chatSection = document.getElementById('chat');
const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const messagesContainer = document.getElementById('messages');

function addMessage(role, content) {
  const message = document.createElement('p');
  message.classList.add('message');
  message.innerHTML = `<strong>${role}:</strong> ${content}`;
  messagesContainer.appendChild(message);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

buyButton?.addEventListener('click', () => {
  chatSection?.removeAttribute('hidden');
  buyButton.setAttribute('disabled', 'true');
  buyButton.textContent = 'Chat abierto';
  messageInput?.focus();
});

chatForm?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const text = messageInput?.value.trim();
  if (!text) {
    return;
  }

  addMessage('Tú', text);
  messageInput.value = '';
  messageInput.focus();

  try {
    const response = await fetch('/api/mensaje', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mensaje: text }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `Error ${response.status}`);
    }

    const data = await response.json();
    const reply = data?.respuesta ?? 'Sin respuesta del servidor.';
    addMessage('Agente', reply);
  } catch (error) {
    console.error(error);
    addMessage('Error', error.message || 'No se pudo enviar el mensaje.');
  }
});
