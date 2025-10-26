const buyButton = document.getElementById('buyButton');
const chatSection = document.getElementById('chat');
const chatForm = document.getElementById('chatForm');
const messageInput = document.getElementById('messageInput');
const messagesContainer = document.getElementById('messages');

function formatTime(date) {
  return date
    .toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit',
    })
    .replace(':', '.');
}

function addMessage(type, author, content) {
  const wrapper = document.createElement('article');
  wrapper.classList.add('message', `message--${type}`);

  const bubble = document.createElement('div');
  bubble.classList.add('message-bubble');

  if (author) {
    const authorEl = document.createElement('span');
    authorEl.classList.add('message-author');
    authorEl.textContent = author;
    bubble.appendChild(authorEl);
  }

  const textEl = document.createElement('span');
  textEl.textContent = content;
  bubble.appendChild(textEl);

  const timeEl = document.createElement('span');
  timeEl.classList.add('message-time');
  timeEl.textContent = formatTime(new Date());
  bubble.appendChild(timeEl);

  wrapper.appendChild(bubble);
  messagesContainer.appendChild(wrapper);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

buyButton?.addEventListener('click', () => {
  chatSection?.removeAttribute('hidden');
  buyButton.setAttribute('disabled', 'true');
  buyButton.textContent = 'Chat abierto';
  if (!messagesContainer.dataset.greeting) {
    addMessage('agent', 'Agente', 'Hola, ¿en qué puedo ayudarte hoy?');
    messagesContainer.dataset.greeting = 'true';
  }
  messageInput?.focus();
});

chatForm?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const text = messageInput?.value.trim();
  if (!text) {
    return;
  }

  addMessage('user', 'Tú', text);
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
    addMessage('agent', 'Agente', reply);
  } catch (error) {
    console.error(error);
    addMessage('error', 'Error', error.message || 'No se pudo enviar el mensaje.');
  }
});
