(function () {
    const lineList = document.getElementById('whatsappAdminLineList');
    const lineListEmpty = document.getElementById('whatsappAdminLineListEmpty');
    const refreshButton = document.getElementById('whatsappAdminRefresh');
    const alertRealtime = document.getElementById('whatsappAdminAlert');

    const currentName = document.getElementById('whatsappAdminCurrentName');
    const currentMeta = document.getElementById('whatsappAdminCurrentMeta');
    const statusBadge = document.getElementById('whatsappAdminStatusBadge');
    const lastConnection = document.getElementById('whatsappAdminLastConnection');
    const chatTitle = document.getElementById('whatsappAdminChatTitle');
    const chatMeta = document.getElementById('whatsappAdminChatMeta');
    const messagesContainer = document.getElementById('whatsappAdminMessages');
    const feedback = document.getElementById('whatsappAdminFeedback');

    const sendForm = document.getElementById('whatsappAdminSendForm');
    const sendToInput = document.getElementById('whatsappAdminSendTo');
    const sendMessageInput = document.getElementById('whatsappAdminSendMessage');
    const sendButton = document.getElementById('whatsappAdminSendButton');

    const incomingForm = document.getElementById('whatsappAdminIncomingForm');
    const incomingFromInput = document.getElementById('whatsappAdminIncomingFrom');
    const incomingMessageInput = document.getElementById('whatsappAdminIncomingMessage');
    const incomingButton = document.getElementById('whatsappAdminIncomingButton');

    const connectButton = document.getElementById('whatsappAdminConnect');
    const disconnectButton = document.getElementById('whatsappAdminDisconnect');
    const openWebButton = document.getElementById('whatsappAdminOpenWeb');
    const openSplitButton = document.getElementById('whatsappAdminOpenSplit');

    const sessionGrid = document.getElementById('whatsappAdminSessionGrid');
    const sessionGridEmpty = document.getElementById('whatsappAdminSessionGridEmpty');
    const openAllWebButton = document.getElementById('whatsappAdminOpenAllWeb');

    const createForm = document.getElementById('whatsappAdminCreateForm');
    const createIdInput = document.getElementById('whatsappAdminLineId');
    const createNameInput = document.getElementById('whatsappAdminLineName');

    const dateTimeFormatter = new Intl.DateTimeFormat('es-AR', {
        dateStyle: 'short',
        timeStyle: 'short',
    });
    const timeFormatter = new Intl.DateTimeFormat('es-AR', {
        hour: '2-digit',
        minute: '2-digit',
    });

    const state = {
        lines: new Map(),
        messages: new Map(),
        selectedLine: null,
        socket: null,
        socketReady: false,
        pendingHistory: null,
    };

    const sessionWindows = new Map();

    function normalizeLine(line) {
        if (!line || !line.id) return null;
        const normalized = {
            id: String(line.id),
            nombre: line.nombre && String(line.nombre).trim() ? String(line.nombre).trim() : String(line.id),
            estado: line.estado === 'connected' || line.estado === 'connecting' ? line.estado : 'disconnected',
            ultimaConexion: line.ultimaConexion || null,
            ultimoMensaje: null,
        };
        if (line.ultimoMensaje) {
            normalized.ultimoMensaje = normalizeMessage(line.ultimoMensaje);
        }
        return normalized;
    }

    function normalizeMessage(message) {
        if (!message) return null;
        const direction = message.direction === 'outgoing' ? 'outgoing' : 'incoming';
        const timestamp = message.timestamp ? new Date(message.timestamp).toISOString() : new Date().toISOString();
        return {
            id: message.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            body: String(message.body ?? ''),
            direction,
            from: message.from ?? null,
            to: message.to ?? null,
            timestamp,
            status: message.status ?? null,
        };
    }

    function ensureMessages(lineId) {
        if (!state.messages.has(lineId)) {
            state.messages.set(lineId, []);
        }
        return state.messages.get(lineId);
    }

    function getStatusLabel(estado) {
        switch (estado) {
            case 'connected':
                return 'Conectado';
            case 'connecting':
                return 'Conectando';
            default:
                return 'Desconectado';
        }
    }

    function getStatusBadgeClass(estado) {
        switch (estado) {
            case 'connected':
                return 'status-badge--online';
            case 'connecting':
                return 'status-badge--connecting';
            default:
                return 'status-badge--offline';
        }
    }

    function getSortedLines() {
        return Array.from(state.lines.values()).sort((a, b) => {
            const timeA = a.ultimoMensaje ? new Date(a.ultimoMensaje.timestamp).getTime() : 0;
            const timeB = b.ultimoMensaje ? new Date(b.ultimoMensaje.timestamp).getTime() : 0;
            if (timeA === timeB) {
                return a.nombre.localeCompare(b.nombre, 'es');
            }
            return timeB - timeA;
        });
    }

    function showFeedback(message, type = 'info') {
        if (!feedback) return;
        feedback.textContent = message || '';
        feedback.classList.remove('d-none', 'alert-info', 'alert-success', 'alert-warning', 'alert-danger');
        const className = type === 'success' ? 'alert-success' : type === 'warning' ? 'alert-warning' : type === 'danger' ? 'alert-danger' : 'alert-info';
        feedback.classList.add(className);
        if (!message) {
            feedback.classList.add('d-none');
        }
    }

    function clearFeedback() {
        if (!feedback) return;
        feedback.classList.add('d-none');
        feedback.textContent = '';
    }

    function setControlsEnabled(enabled) {
        const disabled = !enabled;
        [sendToInput, sendMessageInput, sendButton, incomingFromInput, incomingMessageInput, incomingButton, connectButton, disconnectButton].forEach((element) => {
            if (element) {
                element.disabled = disabled;
            }
        });
        if (sendButton) {
            sendButton.disabled = disabled;
        }
        if (incomingButton) {
            incomingButton.disabled = disabled;
        }
    }

    function setSendControlsAvailability() {
        const enabled = Boolean(state.selectedLine) && state.socketReady;
        [sendButton, incomingButton].forEach((button) => {
            if (button) {
                button.disabled = !enabled;
            }
        });
    }

    function formatStatus(line) {
        if (!line) return { label: 'Sin seleccionar', variant: 'secondary' };
        switch (line.estado) {
            case 'connected':
                return { label: 'Conectado', variant: 'success' };
            case 'connecting':
                return { label: 'Conectando', variant: 'warning' };
            default:
                return { label: 'Desconectado', variant: 'secondary' };
        }
    }

    function formatLastConnection(line) {
        if (!line || !line.ultimaConexion) return '';
        try {
            return `Última conexión: ${dateTimeFormatter.format(new Date(line.ultimaConexion))}`;
        } catch (error) {
            return '';
        }
    }

    function formatMessageMeta(message) {
        if (!message) return '';
        try {
            return timeFormatter.format(new Date(message.timestamp));
        } catch (error) {
            return '';
        }
    }

    function describeLineMeta(line) {
        if (!line) {
            return 'Sin actividad registrada';
        }
        if (line.ultimoMensaje) {
            const metaTime = formatMessageMeta(line.ultimoMensaje);
            const body = String(line.ultimoMensaje.body || '');
            const truncatedBody = body.length > 80 ? `${body.slice(0, 77)}…` : body;
            return metaTime ? `${metaTime} · ${truncatedBody}` : truncatedBody || 'Sin actividad registrada.';
        }
        if (line.ultimaConexion) {
            return formatLastConnection(line) || 'Sin actividad reciente';
        }
        return 'Sin actividad registrada';
    }

    function updateCurrentLineInfo() {
        const line = state.selectedLine ? state.lines.get(state.selectedLine) : null;
        if (!line) {
            currentName.textContent = 'Selecciona una línea';
            currentMeta.textContent = 'Los detalles de la sesión aparecerán aquí cuando elijas una línea.';
            chatTitle.textContent = 'Historial de mensajes';
            chatMeta.textContent = 'Selecciona una línea para cargar el historial.';
            statusBadge.textContent = 'Sin seleccionar';
            statusBadge.className = 'badge bg-secondary';
            lastConnection.textContent = '';
            setControlsEnabled(false);
            setSendControlsAvailability();
            renderMessages();
            return;
        }

        currentName.textContent = line.nombre;
        if (line.ultimoMensaje) {
            const meta = formatMessageMeta(line.ultimoMensaje);
            const body = line.ultimoMensaje.body.length > 80 ? `${line.ultimoMensaje.body.slice(0, 77)}…` : line.ultimoMensaje.body;
            currentMeta.textContent = meta ? `Último mensaje a las ${meta}: ${body}` : body || 'Sin actividad registrada.';
        } else {
            currentMeta.textContent = 'Sin actividad registrada.';
        }
        chatTitle.textContent = `Historial de ${line.nombre}`;
        chatMeta.textContent = 'Los mensajes nuevos aparecerán automáticamente cuando lleguen.';

        const { label, variant } = formatStatus(line);
        statusBadge.textContent = label;
        statusBadge.className = `badge bg-${variant}`;
        lastConnection.textContent = formatLastConnection(line);

        setControlsEnabled(true);
        setSendControlsAvailability();
    }

    function renderMessages() {
        const lineId = state.selectedLine;
        const list = lineId ? state.messages.get(lineId) : null;
        if (!messagesContainer) return;

        messagesContainer.innerHTML = '';
        if (!lineId || !list || !list.length) {
            const empty = document.createElement('div');
            empty.className = 'whatsapp-empty';
            empty.textContent = lineId ? 'Todavía no hay mensajes registrados para esta línea.' : 'Aún no has seleccionado ninguna conversación.';
            messagesContainer.append(empty);
            return;
        }

        list.forEach((message) => {
            const bubble = document.createElement('div');
            bubble.className = `whatsapp-bubble whatsapp-bubble--${message.direction === 'outgoing' ? 'outgoing' : 'incoming'}`;

            const body = document.createElement('p');
            body.textContent = message.body;
            bubble.append(body);

            const meta = document.createElement('time');
            meta.dateTime = message.timestamp;
            meta.textContent = formatMessageMeta(message);
            bubble.append(meta);

            messagesContainer.append(bubble);
        });

        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    function renderLineList() {
        if (!lineList) return;
        const lines = getSortedLines();

        const existingItems = lineList.querySelectorAll('button[data-line-id]');
        existingItems.forEach((node) => node.remove());

        if (lineListEmpty && !lineList.contains(lineListEmpty)) {
            lineList.append(lineListEmpty);
        }

        if (!lines.length) {
            if (lineListEmpty) {
                lineListEmpty.classList.remove('d-none');
            }
            return;
        }

        if (lineListEmpty) {
            lineListEmpty.classList.add('d-none');
        }

        lines.forEach((line) => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = `line-item w-100 text-start ${line.id === state.selectedLine ? 'line-item--active' : ''}`;
            item.dataset.lineId = line.id;

            const header = document.createElement('div');
            header.className = 'line-item-header';

            const titleGroup = document.createElement('div');
            titleGroup.className = 'line-item-titlegroup';

            const title = document.createElement('span');
            title.className = 'line-title';
            title.textContent = line.nombre;

            const badge = document.createElement('span');
            const statusClass = getStatusBadgeClass(line.estado);
            badge.className = `status-badge ${statusClass}`;
            badge.textContent = getStatusLabel(line.estado);

            titleGroup.append(title);
            header.append(titleGroup, badge);
            item.append(header);

            const meta = document.createElement('span');
            meta.className = 'line-meta';
            meta.textContent = describeLineMeta(line);
            item.append(meta);

            lineList.append(item);
        });

        renderSessionGrid(lines);
    }

    function renderSessionGrid(sortedLines) {
        if (!sessionGrid) return;
        sessionGrid.innerHTML = '';

        const lines = Array.isArray(sortedLines) ? sortedLines.slice(0, 8) : getSortedLines().slice(0, 8);

        if (!lines.length) {
            if (sessionGridEmpty) {
                sessionGridEmpty.classList.remove('d-none');
            }
            return;
        }

        if (sessionGridEmpty) {
            sessionGridEmpty.classList.add('d-none');
        }

        lines.forEach((line) => {
            const card = document.createElement('article');
            card.className = `whatsapp-session-card${line.id === state.selectedLine ? ' whatsapp-session-card--active' : ''}`;
            card.dataset.lineId = line.id;

            const header = document.createElement('div');
            header.className = 'whatsapp-session-header';

            const title = document.createElement('h3');
            title.className = 'whatsapp-session-title';
            title.textContent = line.nombre;

            const badge = document.createElement('span');
            badge.className = `status-badge ${getStatusBadgeClass(line.estado)}`;
            badge.textContent = getStatusLabel(line.estado);

            header.append(title, badge);
            card.append(header);

            const meta = document.createElement('p');
            meta.className = 'whatsapp-session-meta';
            meta.textContent = describeLineMeta(line);
            card.append(meta);

            const preview = document.createElement('div');
            preview.className = 'whatsapp-session-preview';

            const qr = document.createElement('div');
            qr.className = 'whatsapp-session-qr';
            preview.append(qr);
            card.append(preview);

            const actions = document.createElement('div');
            actions.className = 'whatsapp-session-actions';

            const openButton = document.createElement('button');
            openButton.type = 'button';
            openButton.className = 'btn btn-success btn-sm';
            openButton.textContent = 'Abrir sesión';
            openButton.addEventListener('click', (event) => {
                event.stopPropagation();
                openWebForLine(line.id);
            });

            actions.append(openButton);
            card.append(actions);

            const identifier = document.createElement('p');
            identifier.className = 'whatsapp-session-id';
            identifier.textContent = `ID interno: ${line.id}`;
            card.append(identifier);

            sessionGrid.append(card);
        });
    }

    function openWebForLine(lineId, options = {}) {
        const targetId = lineId ? `whatsapp-${lineId}` : '_blank';
        if (lineId) {
            const existing = sessionWindows.get(lineId);
            if (existing && !existing.closed) {
                if (options.focus !== false && typeof existing.focus === 'function') {
                    existing.focus();
                }
                return existing;
            }
        }
        const win = window.open('https://web.whatsapp.com/', targetId);
        if (!win) {
            showFeedback('No se pudo abrir la ventana de WhatsApp. Revisa el bloqueo de ventanas emergentes.', 'danger');
            return null;
        }
        try {
            win.opener = null;
        } catch (error) {
            // Ignoramos errores al limpiar el opener
        }
        if (lineId) {
            sessionWindows.set(lineId, win);
        }
        if (options.focus !== false && typeof win.focus === 'function') {
            win.focus();
        }
        return win;
    }

    function mergeLine(line) {
        const normalized = normalizeLine(line);
        if (!normalized) return null;
        const stored = state.lines.get(normalized.id) || {};
        const merged = {
            ...stored,
            ...normalized,
        };
        state.lines.set(normalized.id, merged);
        return merged;
    }

    function appendMessage(lineId, message) {
        const normalized = normalizeMessage(message);
        if (!normalized) return;
        const list = ensureMessages(lineId);
        list.push(normalized);
        state.messages.set(lineId, list);
        const line = state.lines.get(lineId) || { id: lineId };
        line.ultimoMensaje = normalized;
        state.lines.set(lineId, line);
        if (state.selectedLine === lineId) {
            renderMessages();
            updateCurrentLineInfo();
        }
    }

    function replaceHistory(lineId, messages) {
        const normalized = Array.isArray(messages) ? messages.map(normalizeMessage).filter(Boolean) : [];
        state.messages.set(lineId, normalized);
        const line = state.lines.get(lineId);
        if (line && normalized.length) {
            line.ultimoMensaje = normalized[normalized.length - 1];
            state.lines.set(lineId, line);
        }
        if (state.selectedLine === lineId) {
            renderMessages();
            updateCurrentLineInfo();
        }
    }

    function requestHistory(lineId) {
        if (state.socket) {
            state.pendingHistory = lineId;
            state.socket.emit('whatsapp:solicitarHistorial', { linea: lineId, limit: 250 });
        } else {
            fetchHistoryFallback(lineId);
        }
    }

    async function fetchHistoryFallback(lineId) {
        try {
            const response = await fetch(`backend/whatsapp_messages.php?linea=${encodeURIComponent(lineId)}`);
            if (!response.ok) return;
            const data = await response.json();
            if (data && Array.isArray(data.mensajes)) {
                replaceHistory(lineId, data.mensajes);
            }
        } catch (error) {
            console.warn('No se pudo recuperar el historial desde PHP', error);
        }
    }

    async function refreshLinesFallback() {
        try {
            const response = await fetch('backend/whatsapp_messages.php');
            if (!response.ok) return;
            const data = await response.json();
            if (data && Array.isArray(data.lineas)) {
                data.lineas.forEach((line) => mergeLine(line));
                renderLineList();
                updateCurrentLineInfo();
            }
        } catch (error) {
            console.warn('No se pudo actualizar la lista de líneas', error);
        }
    }

    function handleLineClick(event) {
        const button = event.target.closest('button[data-line-id]');
        if (!button) return;
        const lineId = button.dataset.lineId;
        if (!lineId) return;
        if (state.selectedLine === lineId) return;
        state.selectedLine = lineId;
        renderLineList();
        updateCurrentLineInfo();
        renderMessages();
        requestHistory(lineId);
    }

    function handleRealtimeConnection(connected) {
        state.socketReady = connected;
        if (alertRealtime) {
            alertRealtime.classList.toggle('d-none', connected);
        }
        setSendControlsAvailability();
    }

    function getSocketBaseUrl() {
        const override =
            window.WHATSAPP_SOCKET_URL || (document.body && document.body.dataset.whatsappSocketUrl) || null;
        if (!override) return '';
        return override.replace(/\/$/, '');
    }

    async function canReachSocketServer(baseUrl) {
        const targetBase = baseUrl || window.location.origin;
        const probeUrl = `${targetBase}/socket.io/?EIO=4&transport=polling&t=${Date.now()}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2500);
        try {
            const response = await fetch(probeUrl, {
                method: 'GET',
                mode: 'cors',
                signal: controller.signal,
            });
            clearTimeout(timeout);
            return response.ok;
        } catch (error) {
            clearTimeout(timeout);
            return false;
        }
    }

    async function loadSocketLibrary() {
        if (typeof io === 'function') {
            return true;
        }

        const baseUrl = getSocketBaseUrl();
        const reachable = await canReachSocketServer(baseUrl);
        if (!reachable) {
            return false;
        }

        return new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = baseUrl ? `${baseUrl}/socket.io/socket.io.js` : '/socket.io/socket.io.js';
            script.async = true;
            script.onload = () => resolve(typeof io === 'function');
            script.onerror = () => resolve(false);
            document.head.appendChild(script);
        });
    }

    function initSocket() {
        if (typeof io !== 'function') {
            console.warn('Socket.io no está disponible para la vista de WhatsApp.');
            handleRealtimeConnection(false);
            return;
        }

        const socketBase = getSocketBaseUrl();
        const socket = socketBase ? io(socketBase) : io();
        state.socket = socket;

        socket.on('connect', () => {
            handleRealtimeConnection(true);
            clearFeedback();
            socket.emit('whatsapp:subscribe');
        });

        socket.on('disconnect', () => {
            handleRealtimeConnection(false);
            showFeedback('Se perdió la conexión en tiempo real. Puedes seguir operando en modo lectura.', 'warning');
        });

        socket.on('whatsapp:lineas', (payload) => {
            if (!payload || !Array.isArray(payload.lineas)) return;
            payload.lineas.forEach((line) => mergeLine(line));
            renderLineList();
            updateCurrentLineInfo();
            if (state.selectedLine && !state.messages.has(state.selectedLine)) {
                requestHistory(state.selectedLine);
            }
        });

        socket.on('whatsapp:lineaActualizada', ({ linea, lineaActualizada }) => {
            if (lineaActualizada) {
                mergeLine(lineaActualizada);
            } else if (linea) {
                mergeLine({ id: linea });
            }
            renderLineList();
            updateCurrentLineInfo();
        });

        socket.on('whatsapp:estadoLinea', ({ linea, estado, ultimaConexion }) => {
            if (!linea) return;
            const line = mergeLine({ id: linea, estado, ultimaConexion });
            if (line && linea === state.selectedLine) {
                updateCurrentLineInfo();
            }
            renderLineList();
        });

        socket.on('whatsapp:nuevoMensaje', ({ linea, mensaje }) => {
            if (!linea || !mensaje) return;
            appendMessage(linea, mensaje);
            renderLineList();
        });

        socket.on('whatsapp:historial', ({ linea, mensajes }) => {
            if (!linea || state.pendingHistory !== linea) return;
            state.pendingHistory = null;
            replaceHistory(linea, mensajes);
        });

        socket.on('whatsapp:error', ({ message }) => {
            if (message) {
                showFeedback(message, 'danger');
            }
        });
    }

    function setupEvents() {
        if (lineList) {
            lineList.addEventListener('click', handleLineClick);
        }

        if (sessionGrid) {
            sessionGrid.addEventListener('click', (event) => {
                const card = event.target.closest('.whatsapp-session-card[data-line-id]');
                if (!card) return;
                if (event.target.closest('button')) return;
                const lineId = card.dataset.lineId;
                if (!lineId || state.selectedLine === lineId) return;
                state.selectedLine = lineId;
                renderLineList();
                updateCurrentLineInfo();
                renderMessages();
                requestHistory(lineId);
            });
        }

        if (refreshButton) {
            refreshButton.addEventListener('click', () => {
                refreshLinesFallback();
                if (state.selectedLine) {
                    requestHistory(state.selectedLine);
                }
            });
        }

        if (openWebButton) {
            openWebButton.addEventListener('click', () => {
                if (!state.selectedLine) {
                    showFeedback('Selecciona una línea para abrir su sesión de WhatsApp Web.', 'danger');
                    return;
                }
                openWebForLine(state.selectedLine);
            });
        }

        if (openSplitButton) {
            openSplitButton.addEventListener('click', () => {
                window.open('/cajero.html', '_blank', 'noopener');
            });
        }

        if (openAllWebButton) {
            openAllWebButton.addEventListener('click', () => {
                const lines = getSortedLines().slice(0, 8);
                if (!lines.length) {
                    showFeedback('No hay líneas registradas para abrir.', 'warning');
                    return;
                }
                let opened = 0;
                for (let index = 0; index < lines.length; index += 1) {
                    const line = lines[index];
                    const win = openWebForLine(line.id, { focus: index === 0 });
                    if (win) {
                        opened += 1;
                    }
                }
                if (!opened) {
                    showFeedback('No se pudieron abrir las ventanas de WhatsApp. Permite las ventanas emergentes para continuar.', 'danger');
                }
            });
        }

        if (connectButton) {
            connectButton.addEventListener('click', () => {
                if (!state.socket || !state.selectedLine || !state.socketReady) {
                    showFeedback('Necesitamos la conexión en tiempo real para actualizar el estado.', 'danger');
                    return;
                }
                state.socket.emit('whatsapp:actualizarEstado', { linea: state.selectedLine, estado: 'connected' }, (response) => {
                    if (!response || !response.ok) {
                        showFeedback(response?.error || 'No se pudo actualizar el estado.', 'danger');
                        return;
                    }
                    showFeedback('La línea se marcó como conectada.', 'success');
                });
            });
        }

        if (disconnectButton) {
            disconnectButton.addEventListener('click', () => {
                if (!state.socket || !state.selectedLine || !state.socketReady) {
                    showFeedback('Necesitamos la conexión en tiempo real para actualizar el estado.', 'danger');
                    return;
                }
                state.socket.emit('whatsapp:actualizarEstado', { linea: state.selectedLine, estado: 'disconnected' }, (response) => {
                    if (!response || !response.ok) {
                        showFeedback(response?.error || 'No se pudo actualizar el estado.', 'danger');
                        return;
                    }
                    showFeedback('La línea se marcó como desconectada.', 'success');
                });
            });
        }

        if (sendForm) {
            sendForm.addEventListener('submit', (event) => {
                event.preventDefault();
                if (!state.selectedLine || !state.socketReady || !state.socket) {
                    showFeedback('Selecciona una línea conectada para enviar mensajes.', 'danger');
                    return;
                }
                const body = sendMessageInput.value.trim();
                const to = sendToInput.value.trim();
                if (!body) {
                    sendMessageInput.focus();
                    return;
                }
                state.socket.emit(
                    'whatsapp:enviarMensaje',
                    {
                        linea: state.selectedLine,
                        body,
                        to: to || undefined,
                    },
                    (response) => {
                        if (!response || !response.ok) {
                            showFeedback(response?.error || 'No se pudo enviar el mensaje.', 'danger');
                            return;
                        }
                        showFeedback('Mensaje enviado y replicado en la vista de cajeros.', 'success');
                        sendMessageInput.value = '';
                    }
                );
            });
        }

        if (incomingForm) {
            incomingForm.addEventListener('submit', (event) => {
                event.preventDefault();
                if (!state.selectedLine || !state.socketReady || !state.socket) {
                    showFeedback('Selecciona una línea conectada para registrar mensajes.', 'danger');
                    return;
                }
                const body = incomingMessageInput.value.trim();
                if (!body) {
                    incomingMessageInput.focus();
                    return;
                }
                const from = incomingFromInput.value.trim();
                state.socket.emit(
                    'whatsapp:registrarEntrante',
                    {
                        linea: state.selectedLine,
                        body,
                        from: from || undefined,
                    },
                    (response) => {
                        if (!response || !response.ok) {
                            showFeedback(response?.error || 'No se pudo registrar el mensaje.', 'danger');
                            return;
                        }
                        showFeedback('Mensaje entrante registrado para pruebas.', 'success');
                        incomingMessageInput.value = '';
                    }
                );
            });
        }

        if (createForm) {
            createForm.addEventListener('submit', (event) => {
                event.preventDefault();
                if (!createForm.checkValidity()) {
                    createForm.classList.add('was-validated');
                    return;
                }
                if (!state.socket || !state.socketReady) {
                    showFeedback('Se requiere la conexión en tiempo real para registrar la línea.', 'danger');
                    return;
                }
                const id = createIdInput.value.trim();
                const nombre = createNameInput.value.trim();
                if (!id || !nombre) {
                    createForm.classList.add('was-validated');
                    return;
                }
                state.socket.emit(
                    'whatsapp:upsertLinea',
                    {
                        id,
                        nombre,
                    },
                    (response) => {
                        if (!response || !response.ok) {
                            showFeedback(response?.error || 'No se pudo guardar la línea.', 'danger');
                            return;
                        }
                        showFeedback('Línea guardada correctamente.', 'success');
                        createForm.reset();
                        createForm.classList.remove('was-validated');
                        mergeLine(response.lineaActualizada || { id: response.linea, nombre });
                        renderLineList();
                    }
                );
            });
        }
    }

    async function init() {
        setControlsEnabled(false);
        const hasSocketLib = await loadSocketLibrary();
        if (!hasSocketLib) {
            showFeedback('No pudimos conectar en tiempo real. Verifica que el servidor de sockets esté activo.', 'warning');
            handleRealtimeConnection(false);
            refreshLinesFallback();
            setupEvents();
            return;
        }
        initSocket();
        refreshLinesFallback();
        setupEvents();
    }

    document.addEventListener('DOMContentLoaded', init);
})();
