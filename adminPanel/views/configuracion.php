<section class="container">
    <div class="d-flex flex-column flex-lg-row justify-content-between align-items-start gap-3 mb-4">
        <div>
            <h1 class="h3 mb-1">Configuración</h1>
            <p class="text-muted mb-0">Herramientas críticas de limpieza y reinicio del sistema.</p>
        </div>
        <div class="alert alert-warning mb-0" role="alert">
            Las acciones son irreversibles. Confirma antes de continuar.
        </div>
    </div>

    <div id="configFeedback" class="alert d-none" role="alert"></div>

    <div class="row g-4">
        <div class="col-12 col-lg-6">
            <div class="card h-100 shadow-sm">
                <div class="card-body d-flex flex-column gap-2">
                    <h2 class="h5 mb-0">Borrar información de mensajes</h2>
                    <p class="text-muted small mb-2">Elimina el historial de chat y reinicia los hilos activos.</p>
                    <button id="actionClearMessages" class="btn btn-outline-danger mt-auto">
                        Vaciar historial de mensajes
                    </button>
                </div>
            </div>
        </div>

        <div class="col-12 col-lg-6">
            <div class="card h-100 shadow-sm">
                <div class="card-body d-flex flex-column gap-2">
                    <h2 class="h5 mb-0">Borrar configuración de líneas de WhatsApp</h2>
                    <p class="text-muted small mb-1">
                        Quita las líneas, sus credenciales y cualquier rastro de sesión. Puedes aplicarlo a todas o seleccionar las que necesites borrar.
                    </p>
                    <div class="form-check">
                        <input class="form-check-input" type="radio" name="whatsappLineScope" id="whatsappScopeAll" value="all" checked>
                        <label class="form-check-label" for="whatsappScopeAll">Todas las líneas</label>
                    </div>
                    <div class="form-check">
                        <input class="form-check-input" type="radio" name="whatsappLineScope" id="whatsappScopeSelected" value="selected">
                        <label class="form-check-label" for="whatsappScopeSelected">Seleccionar líneas</label>
                    </div>
                    <div id="whatsappLineList" class="border rounded p-2 bg-light small d-none" style="max-height: 220px; overflow-y: auto;">
                        <p class="text-muted mb-0" id="whatsappLineListEmpty">No hay líneas registradas.</p>
                    </div>
                    <button id="actionPurgeWhatsapp" class="btn btn-danger mt-auto">
                        Borrar configuración de WhatsApp
                    </button>
                </div>
            </div>
        </div>

        <div class="col-12 col-lg-4">
            <div class="card h-100 shadow-sm">
                <div class="card-body d-flex flex-column gap-2">
                    <h2 class="h6 mb-0">Eliminar todos los cajeros</h2>
                    <p class="text-muted small mb-2">Remueve cajeros, tokens y pagos asociados.</p>
                    <button id="actionDeleteCajeros" class="btn btn-outline-danger mt-auto">Eliminar cajeros</button>
                </div>
            </div>
        </div>

        <div class="col-12 col-lg-4">
            <div class="card h-100 shadow-sm">
                <div class="card-body d-flex flex-column gap-2">
                    <h2 class="h6 mb-0">Eliminar mensajes entrantes</h2>
                    <p class="text-muted small mb-2">Limpia los mensajes entrantes registrados en chats y en la central WhatsApp.</p>
                    <button id="actionDeleteIncoming" class="btn btn-outline-danger mt-auto">Eliminar mensajes entrantes</button>
                </div>
            </div>
        </div>

        <div class="col-12 col-lg-4">
            <div class="card h-100 shadow-sm">
                <div class="card-body d-flex flex-column gap-2">
                    <h2 class="h6 mb-0">Eliminar clientes</h2>
                    <p class="text-muted small mb-2">Elimina todos los clientes y sus relaciones asociadas.</p>
                    <button id="actionDeleteClients" class="btn btn-outline-danger mt-auto">Eliminar clientes</button>
                </div>
            </div>
        </div>
    </div>
</section>
