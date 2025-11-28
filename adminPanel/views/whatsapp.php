<section class="container">
    <div class="d-flex flex-column flex-lg-row justify-content-between align-items-start gap-3 mb-4">
        <div>
            <h1 class="h3 mb-1">Centralizador de WhatsApp Web</h1>
            <p class="text-muted mb-0">
                Conecta las sesiones de WhatsApp Web y distribuye los mensajes en tiempo real hacia la ventana partida del cajero.
            </p>
        </div>
        <div class="d-flex flex-wrap gap-2">
            <a href="/cajero.html" target="_blank" rel="noopener" class="btn btn-outline-primary btn-sm">
                Abrir vista de cajero
            </a>
            <button type="button" id="whatsappAdminRefresh" class="btn btn-outline-secondary btn-sm">
                Actualizar estado
            </button>
        </div>
    </div>

    <div id="whatsappAdminAlert" class="alert alert-warning d-none" role="alert">
        No pudimos establecer una conexión en tiempo real. Se mostrará la información disponible pero será necesario actualizar manualmente.
    </div>

    <div class="row g-4">
        <div class="col-12 col-lg-4">
            <div class="card shadow-sm h-100">
                <div class="card-body">
                    <h2 class="h5">Líneas disponibles</h2>
                    <p class="text-muted small">
                        Selecciona una línea para ver sus mensajes, estado y acciones de conexión.
                    </p>
                    <div id="whatsappAdminLineList" class="whatsapp-admin-line-list whatsapp-lines">
                        <p class="text-center text-muted py-4 mb-0" id="whatsappAdminLineListEmpty">
                            No hay líneas registradas todavía.
                        </p>
                    </div>
                </div>
            </div>

            <div class="card shadow-sm mt-4">
                <div class="card-body">
                    <h3 class="h6 mb-2">Registrar o renombrar línea</h3>
                    <p class="text-muted small">
                        Define un identificador interno y el nombre visible que se mostrará en los paneles.
                    </p>
                    <form id="whatsappAdminCreateForm" class="needs-validation" novalidate>
                        <div class="mb-2">
                            <label for="whatsappAdminLineId" class="form-label">Identificador interno</label>
                            <input type="text" id="whatsappAdminLineId" class="form-control" placeholder="Ej. caja-centro" required />
                            <div class="invalid-feedback">Ingresa un identificador válido (letras y números).</div>
                        </div>
                        <div class="mb-3">
                            <label for="whatsappAdminLineName" class="form-label">Nombre visible</label>
                            <input type="text" id="whatsappAdminLineName" class="form-control" placeholder="Ej. Caja Centro" required />
                            <div class="invalid-feedback">Ingresa el nombre que verán los cajeros.</div>
                        </div>
                        <button type="submit" class="btn btn-primary btn-sm w-100">Guardar línea</button>
                    </form>
                </div>
            </div>
        </div>

        <div class="col-12 col-lg-8 d-flex flex-column gap-4">
            <div class="card shadow-sm">
                <div class="card-body">
                    <div class="d-flex flex-column flex-md-row justify-content-between align-items-start gap-3">
                        <div>
                            <h2 class="h5 mb-1">Sesiones de WhatsApp Web</h2>
                            <p class="text-muted small mb-0">
                                Abre hasta ocho ventanas de WhatsApp Web para vincular cada línea y recibir los mensajes en tiempo real.
                            </p>
                        </div>
                        <div class="d-flex flex-wrap gap-2">
                            <button type="button" id="whatsappAdminOpenAllWeb" class="btn btn-outline-primary btn-sm">
                                Abrir todas las ventanas
                            </button>
                        </div>
                    </div>
                    <div id="whatsappAdminSessionGrid" class="whatsapp-session-grid mt-3"></div>
                    <p id="whatsappAdminSessionGridEmpty" class="text-center text-muted small py-4 mb-0">
                        No hay líneas registradas todavía. Utiliza el formulario para crearlas y comenzar a vincularlas.
                    </p>
                </div>
            </div>

            <div class="card shadow-sm flex-grow-1">
                <div class="card-body d-flex flex-column gap-3">
                    <div class="d-flex flex-column flex-md-row justify-content-between align-items-start gap-3">
                        <div>
                            <h2 id="whatsappAdminCurrentName" class="h4 mb-1">Selecciona una línea</h2>
                            <p id="whatsappAdminCurrentMeta" class="text-muted small mb-0">
                                Los detalles de la sesión aparecerán aquí cuando elijas una línea.
                            </p>
                        </div>
                        <div class="text-md-end">
                            <span id="whatsappAdminStatusBadge" class="badge bg-secondary">Sin seleccionar</span>
                            <div id="whatsappAdminLastConnection" class="small text-muted mt-1"></div>
                        </div>
                    </div>

                    <div id="whatsappAdminFeedback" class="alert d-none" role="alert"></div>

                    <div class="whatsapp-central-card whatsapp-admin-card">
                        <div class="whatsapp-central-body whatsapp-admin-body">
                            <aside id="whatsappAdminMiniList" class="whatsapp-lines d-none"></aside>
                            <div class="whatsapp-chat" aria-live="polite">
                                <header class="whatsapp-chat-header">
                                    <div class="whatsapp-chat-header-text">
                                        <h3 id="whatsappAdminChatTitle">Historial de mensajes</h3>
                                        <p id="whatsappAdminChatMeta">Selecciona una línea para cargar el historial.</p>
                                    </div>
                                </header>
                                <div id="whatsappAdminMessages" class="whatsapp-chat-messages">
                                    <div class="whatsapp-empty">Aún no has seleccionado ninguna conversación.</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <form id="whatsappAdminSendForm" class="row g-2">
                        <div class="col-12 col-md-4">
                            <label for="whatsappAdminSendTo" class="form-label small">Número destino (opcional)</label>
                            <input type="text" id="whatsappAdminSendTo" class="form-control" placeholder="Ej. +5491112345678" />
                        </div>
                        <div class="col-12 col-md-8">
                            <label for="whatsappAdminSendMessage" class="form-label small">Mensaje a enviar</label>
                            <div class="input-group">
                                <input type="text" id="whatsappAdminSendMessage" class="form-control" placeholder="Escribe un mensaje para el cliente" required />
                                <button class="btn btn-success" type="submit" id="whatsappAdminSendButton" disabled>Enviar</button>
                            </div>
                        </div>
                    </form>

                    <form id="whatsappAdminIncomingForm" class="row g-2">
                        <div class="col-12 col-md-4">
                            <label for="whatsappAdminIncomingFrom" class="form-label small">Remitente simulado</label>
                            <input type="text" id="whatsappAdminIncomingFrom" class="form-control" placeholder="Número o alias" />
                        </div>
                        <div class="col-12 col-md-8">
                            <label for="whatsappAdminIncomingMessage" class="form-label small">Mensaje entrante (simulación)</label>
                            <div class="input-group">
                                <input type="text" id="whatsappAdminIncomingMessage" class="form-control" placeholder="Úsalo para testear la integración" />
                                <button class="btn btn-outline-primary" type="submit" id="whatsappAdminIncomingButton" disabled>Registrar</button>
                            </div>
                        </div>
                    </form>

                    <div class="d-flex flex-wrap gap-2">
                        <button type="button" id="whatsappAdminConnect" class="btn btn-success btn-sm" disabled>Marcar como conectado</button>
                        <button type="button" id="whatsappAdminDisconnect" class="btn btn-outline-danger btn-sm" disabled>Marcar como desconectado</button>
                        <button type="button" id="whatsappAdminOpenWeb" class="btn btn-outline-secondary btn-sm">Abrir WhatsApp Web</button>
                        <button type="button" id="whatsappAdminOpenSplit" class="btn btn-outline-primary btn-sm">Abrir ventana partida</button>
                    </div>
                </div>
            </div>
        </div>
    </div>
</section>

<link rel="stylesheet" href="/css/whatsapp_central.css">
<script src="/socket.io/socket.io.js"></script>
