(function () {
  const TOKEN_KEY = 'theacademy.cajero.token';
  const linesList = document.getElementById('listaLineas');
  const chatContainer = document.getElementById('chatWhatsApp');
  const sendForm = document.getElementById('whatsappSendForm');
  const toInput = document.getElementById('numeroDestino');
  const bodyInput = document.getElementById('mensajeEnviar');
  const sendButton = document.getElementById('btnEnviar');
  const titleElement = document.getElementById('whatsappLineaTitulo');
  const metaElement = document.getElementById('whatsappLineaMeta');
  const statusElement = document.getElementById('whatsappLineaEstado');
  const feedbackElement = document.getElementById('whatsappFeedback');

  function getStoredToken() {
    try {
      return sessionStorage.getItem(TOKEN_KEY);
    } catch (error) {
      return null;
    }
  }

  async function fetchWhatsappResource(kind, lineId) {
    const token = getStoredToken();
    const endpoints = [];

    if (kind === 'messages') {
      const query = lineId ? `?linea=${encodeURIComponent(lineId)}` : '';
      endpoints.push({
        url: `/api/whatsapp/messages${query}`,
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } else if (kind === 'lines') {
      endpoints.push({
        url: '/api/whatsapp/lines',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    }

    const fallbackBases = ['/adminPanel/backend/whatsapp_messages.php', '/adminpanel/backend/whatsapp_messages.php'];
    fallbackBases.forEach((base) => {
      const url = kind === 'messages' && lineId ? `${base}?linea=${encodeURIComponent(lineId)}` : base;
      endpoints.push({ url, headers: {} });
    });

    let lastError = null;

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint.url, { headers: endpoint.headers });
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            lastError = Object.assign(new Error('unauthorized'), { status: response.status });
            continue;
          }
          let payload = null;
          try {
            payload = await response.json();
          } catch (parseError) {
            // ignored
          }
          const error = new Error(`http_${response.status}`);
          error.status = response.status;
          error.payload = payload;
          lastError = error;
          continue;
        }

        const data = await response.json();
        if (data && data.ok === false) {
          const error = new Error(data.error || 'server_error');
          error.payload = data;
          if (data.error === 'line_not_found' || data.error === 'store_not_found') {
            lastError = error;
            continue;
          }
          lastError = error;
          continue;
        }

        return data;
      } catch (error) {
        lastError = error;
      }
    }

    if (lastError) {
      throw lastError;
    }
    throw new Error('request_failed');
  }

  if (!linesList || !chatContainer || !sendForm) {
    return;
  }

  if (typeof socket === 'undefined') {
    console.warn('Socket.io no disponible para la central de WhatsApp');
    return;
  }

  const lineMap = new Map();
  let selectedLine = null;
  let currentMessages = [];
  let loadingHistory = false;

  const formatter = new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  function createMessageId() {
    try {
      if (typeof window !== 'undefined' && window.crypto && typeof window.crypto.randomUUID === 'function') {
        return window.crypto.randomUUID();
      }
    } catch (error) {
      // ignore and fallback
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function formatTime(value) {
    if (!value) return '';
    try {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return '';
      }
      return formatter.format(date);
    } catch (error) {
      return '';
    }
  }

  function normalizeMessage(message) {
    if (!message) {
      return null;
    }
    const direction = message.direction === 'outgoing' ? 'outgoing' : 'incoming';
    return {
      id: message.id || createMessageId(),
      body: String(message.body ?? ''),
      direction,
      from: message.from ?? null,
      to: message.to ?? null,
      timestamp: message.timestamp || new Date().toISOString(),
      status: message.status ?? null,
    };
  }

  function renderFeedback(message, type = 'error') {
    if (!feedbackElement) return;
    feedbackElement.textContent = message || '';
    feedbackElement.classList.toggle('success', type === 'success');
  }

  function clearFeedback() {
    renderFeedback('', 'success');
  }

  function setFormDisabled(disabled) {
    sendForm.classList.toggle('is-disabled', disabled);
    [toInput, bodyInput, sendButton].forEach((element) => {
      if (element) {
        element.disabled = !!disabled;
      }
    });
  }

  function updateStatus(line) {
    if (!statusElement) return;
    const state = line?.estado === 'connected' ? 'online' : line?.estado === 'connecting' ? 'connecting' : 'offline';
    statusElement.textContent =
      state === 'online' ? 'Conectado' : state === 'connecting' ? 'Conectando' : 'Desconectado';
    statusElement.classList.toggle('status-badge--online', state === 'online');
    statusElement.classList.toggle('status-badge--offline', state === 'offline');
    statusElement.classList.toggle('status-badge--connecting', state === 'connecting');
  }

  function renderEmptyConversation(text) {
    chatContainer.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'whatsapp-empty';
    empty.textContent = text;
    chatContainer.append(empty);
  }

  function renderMessages() {
    chatContainer.innerHTML = '';
    if (!currentMessages.length) {
      renderEmptyConversation(
        selectedLine
          ? 'Todavía no hay mensajes en esta línea. ¡Envía el primero!'
          : 'Selecciona una línea para ver su conversación.'
      );
      return;
    }

    currentMessages.forEach((message) => {
      const bubble = document.createElement('div');
      bubble.className = `whatsapp-bubble whatsapp-bubble--${
        message.direction === 'outgoing' ? 'outgoing' : 'incoming'
      }`;

      const text = document.createElement('p');
      text.textContent = message.body;

      const time = document.createElement('time');
      time.dateTime = message.timestamp;
      time.textContent = formatTime(message.timestamp);

      bubble.append(text, time);
      chatContainer.append(bubble);
    });

    chatContainer.scrollTop = chatContainer.scrollHeight;
  }

  function renderLines() {
    linesList.innerHTML = '';
    if (!lineMap.size) {
      const empty = document.createElement('div');
      empty.className = 'whatsapp-empty';
      empty.textContent = 'Aún no hay líneas configuradas. Solicita al administrador que conecte una sesión.';
      linesList.append(empty);
      return;
    }

    const entries = Array.from(lineMap.values()).sort((a, b) => {
      const aTime = a.ultimoMensaje?.timestamp ? new Date(a.ultimoMensaje.timestamp).getTime() : 0;
      const bTime = b.ultimoMensaje?.timestamp ? new Date(b.ultimoMensaje.timestamp).getTime() : 0;
      return bTime - aTime;
    });

    entries.forEach((line) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `line-item${line.id === selectedLine ? ' line-item--active' : ''}`;
      item.dataset.linea = line.id;

      const header = document.createElement('div');
      header.className = 'line-item-header';

      const titleGroup = document.createElement('div');
      titleGroup.className = 'line-item-titlegroup';

      const statusDot = document.createElement('span');
      statusDot.className = `status-dot${line.estado === 'connected' ? ' status-dot--online' : ''}`;

      const title = document.createElement('span');
      title.className = 'line-title';
      title.textContent = line.nombre || line.id;

      titleGroup.append(statusDot, title);
      header.append(titleGroup);

      const meta = document.createElement('span');
      meta.className = 'line-meta';
      meta.textContent = line.ultimoMensaje?.timestamp ? formatTime(line.ultimoMensaje.timestamp) : 'Sin actividad';
      header.append(meta);

      const preview = document.createElement('div');
      preview.className = 'line-preview';
      preview.textContent = line.ultimoMensaje?.body
        ? line.ultimoMensaje.body.slice(0, 80)
        : 'A la espera de mensajes...';

      if (line.unread && line.id !== selectedLine) {
        const unread = document.createElement('span');
        unread.className = 'line-unread';
        unread.textContent = line.unread > 9 ? '+9' : String(line.unread);
        preview.append(' ', unread);
      }

      item.append(header, preview);
      item.addEventListener('click', () => selectLine(line.id));
      linesList.append(item);
    });
  }

  function selectLine(lineId) {
    if (!lineId) {
      selectedLine = null;
      currentMessages = [];
      renderLines();
      renderMessages();
      setFormDisabled(true);
      titleElement.textContent = 'Selecciona una línea';
      metaElement.textContent = 'El historial aparecerá aquí al elegir una línea activa.';
      updateStatus(null);
      return;
    }

    selectedLine = lineId;
    if (toInput) toInput.value = '';
    if (bodyInput) bodyInput.value = '';
    const line = lineMap.get(lineId);
    if (line) {
      line.unread = 0;
      titleElement.textContent = line.nombre || line.id;
      metaElement.textContent = line.ultimoMensaje?.timestamp
        ? `Último mensaje ${formatTime(line.ultimoMensaje.timestamp)}`
        : 'Sin mensajes registrados.';
      updateStatus(line);
    } else {
      titleElement.textContent = lineId;
      metaElement.textContent = 'Sin datos de la línea seleccionada.';
      updateStatus(null);
    }

    renderLines();
    setFormDisabled(false);
    loadHistory(lineId);
  }

  async function loadHistory(lineId) {
    if (!lineId) return;
    loadingHistory = true;
    renderEmptyConversation('Cargando historial...');
    clearFeedback();

    try {
      const data = await fetchWhatsappResource('messages', lineId);
      const mensajes = Array.isArray(data?.mensajes) ? data.mensajes : [];
      currentMessages = mensajes.map(normalizeMessage);
      renderMessages();
    } catch (error) {
      if (error && (error.status === 401 || error.status === 403)) {
        renderFeedback('Tu sesión de cajero expiró. Inicia sesión nuevamente.');
        setFormDisabled(true);
        return;
      }
      console.error('No se pudo obtener el historial de WhatsApp', error);
      renderEmptyConversation('No pudimos cargar el historial. Intenta nuevamente.');
      renderFeedback('No pudimos cargar el historial de la línea seleccionada.');
    } finally {
      loadingHistory = false;
    }
  }

  function handleIncomingMessage(lineId, mensaje) {
    const normalized = normalizeMessage(mensaje);
    if (!normalized) return;

    const line = lineMap.get(lineId) || { id: lineId, estado: 'disconnected', nombre: lineId, unread: 0 };
    line.ultimoMensaje = normalized;
    if (lineId !== selectedLine) {
      line.unread = (line.unread || 0) + 1;
    } else {
      currentMessages.push(normalized);
      renderMessages();
    }

    lineMap.set(lineId, line);
    renderLines();

    if (lineId === selectedLine) {
      metaElement.textContent = `Último mensaje ${formatTime(normalized.timestamp)}`;
    }
  }

  function handleStatusUpdate(lineId, estado, ultimaConexion) {
    const line = lineMap.get(lineId);
    if (!line) return;
    line.estado = estado;
    if (ultimaConexion) {
      line.ultimaConexion = ultimaConexion;
    }
    lineMap.set(lineId, line);
    if (lineId === selectedLine) {
      updateStatus(line);
    }
    renderLines();
  }

  async function initializeLines() {
    try {
      const data = await fetchWhatsappResource('lines');
      const lineas = Array.isArray(data?.lineas) ? data.lineas : Array.isArray(data?.lines) ? data.lines : [];
      lineas.forEach((line) => {
        if (!line?.id) return;
        const current = lineMap.get(line.id) || { id: line.id, unread: 0 };
        const merged = {
          ...current,
          ...line,
          unread: current.unread ?? 0,
        };
        lineMap.set(line.id, merged);
      });
      renderLines();
      if (!selectedLine && lineas.length) {
        selectLine(lineas[0].id);
      }
    } catch (error) {
      console.warn('No se pudieron obtener las líneas iniciales de WhatsApp', error);
      renderLines();
    }
  }

  sendForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!selectedLine || loadingHistory) {
      renderFeedback('Selecciona una línea antes de enviar mensajes.');
      return;
    }
    const to = toInput.value.trim();
    const body = bodyInput.value.trim();
    if (!to || !body) {
      renderFeedback('Necesitamos el número de destino y el mensaje.');
      return;
    }

    clearFeedback();
    const payload = { linea: selectedLine, to, body };

    const acknowledge = (response) => {
      if (!response || response.ok === false) {
        const error = response?.error || 'No pudimos enviar el mensaje.';
        renderFeedback(error);
        return;
      }
      renderFeedback('Mensaje enviado correctamente.', 'success');
      bodyInput.value = '';
      const outgoing = normalizeMessage({
        direction: 'outgoing',
        body,
        to,
        timestamp: new Date().toISOString(),
      });
      currentMessages.push(outgoing);
      const line = lineMap.get(selectedLine);
      if (line) {
        line.ultimoMensaje = outgoing;
        lineMap.set(selectedLine, line);
      }
      renderLines();
      renderMessages();
    };

    try {
      socket.emit('enviarMensaje', payload, acknowledge);
    } catch (error) {
      console.error('Error emitiendo mensaje de WhatsApp', error);
      renderFeedback('No pudimos emitir el mensaje por socket.');
    }
  });

  initializeLines();

  socket.on('connect', () => {
    socket.emit('whatsapp:subscribe');
  });

  socket.on('whatsapp:lineas', (payload) => {
    if (!payload || !Array.isArray(payload.lineas)) return;
    const received = new Set();
    payload.lineas.forEach((line) => {
      if (!line?.id) return;
      const current = lineMap.get(line.id) || { id: line.id, unread: 0 };
      const merged = {
        ...current,
        ...line,
        unread: current.unread ?? 0,
      };
      lineMap.set(line.id, merged);
      received.add(line.id);
    });
    Array.from(lineMap.keys()).forEach((lineId) => {
      if (!received.has(lineId)) {
        lineMap.delete(lineId);
      }
    });
    renderLines();
    if (!selectedLine && payload.lineas.length) {
      selectLine(payload.lineas[0].id);
    }
  });

  socket.on('whatsapp:estadoLinea', ({ linea, estado, ultimaConexion }) => {
    if (!linea) return;
    const line = lineMap.get(linea) || { id: linea, unread: 0 };
    line.estado = estado;
    line.ultimaConexion = ultimaConexion || line.ultimaConexion || null;
    lineMap.set(linea, line);
    handleStatusUpdate(linea, estado, ultimaConexion);
  });

  socket.on('whatsapp:nuevoMensaje', ({ linea, mensaje }) => {
    if (!linea || !mensaje) return;
    handleIncomingMessage(linea, mensaje);
  });

  socket.on('whatsapp:historial', ({ linea, mensajes }) => {
    if (!linea || linea !== selectedLine) return;
    currentMessages = Array.isArray(mensajes) ? mensajes.map(normalizeMessage) : [];
    renderMessages();
  });

  socket.on('whatsapp:error', ({ message }) => {
    if (message) {
      renderFeedback(message);
    }
  });

  setFormDisabled(true);
  renderMessages();
})();
