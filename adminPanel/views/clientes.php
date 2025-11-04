<div class="card shadow-sm">
    <div class="card-body">
        <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-3 gap-2">
            <h5 class="card-title mb-0">Panel de Clientes</h5>
            <div class="d-flex gap-2">
                <button class="btn btn-outline-secondary" id="refreshClientes">Refrescar</button>
                <button class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#clienteModal" data-mode="create">Nuevo cliente</button>
            </div>
        </div>
        <form id="clientesFilter" class="row g-2 mb-3">
            <div class="col-md-5">
                <input type="text" class="form-control" name="search" placeholder="Buscar por nombre, email o teléfono">
            </div>
            <div class="col-md-3">
                <select class="form-select" name="categoria">
                    <option value="">Todas las categorías</option>
                    <option value="VIP">VIP</option>
                    <option value="REGULAR">Regular</option>
                    <option value="ESPORADICO">Esporádico</option>
                </select>
            </div>
            <div class="col-md-2">
                <select class="form-select" name="alerta">
                    <option value="">Alertas</option>
                    <option value="1">Con alerta</option>
                    <option value="0">Sin alerta</option>
                </select>
            </div>
            <div class="col-md-2">
                <button class="btn btn-outline-primary w-100" type="submit">Aplicar filtros</button>
            </div>
        </form>
        <div class="table-responsive">
            <table class="table table-hover align-middle" id="clientesTable">
                <thead>
                    <tr>
                        <th>Cliente</th>
                        <th>Contacto</th>
                        <th>Categoría</th>
                        <th>Interacciones</th>
                        <th>Último contacto</th>
                        <th>Alerta</th>
                        <th class="text-end">Acciones</th>
                    </tr>
                </thead>
                <tbody></tbody>
            </table>
        </div>
    </div>
</div>

<div class="modal fade" id="clienteModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-lg">
        <div class="modal-content">
            <form id="clienteForm" novalidate>
                <div class="modal-header">
                    <h5 class="modal-title">Nuevo cliente</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
                </div>
                <div class="modal-body">
                    <input type="hidden" name="id">
                    <div class="row g-3">
                        <div class="col-md-6">
                            <label class="form-label">Nombre completo</label>
                            <input type="text" class="form-control" name="nombre" required>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label">Email</label>
                            <input type="email" class="form-control" name="email">
                        </div>
                        <div class="col-md-6">
                            <label class="form-label">Teléfono</label>
                            <input type="text" class="form-control" name="telefono">
                        </div>
                        <div class="col-md-6">
                            <label class="form-label">Contraseña</label>
                            <input type="password" class="form-control" name="password" required>
                            <div class="form-text">Se almacenará cifrada con SHA-256.</div>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label">Categoría</label>
                            <select class="form-select" name="categoria">
                                <option value="VIP">VIP</option>
                                <option value="REGULAR">Regular</option>
                                <option value="ESPORADICO">Esporádico</option>
                            </select>
                        </div>
                        <div class="col-md-6 d-flex align-items-center">
                            <div class="form-check form-switch">
                                <input class="form-check-input" type="checkbox" id="clienteAutoSwitch" name="usa_categoria_auto" value="1" checked>
                                <label class="form-check-label" for="clienteAutoSwitch">Usar clasificación automática</label>
                            </div>
                        </div>
                        <div class="col-md-6 d-flex align-items-center">
                            <div class="form-check form-switch">
                                <input class="form-check-input" type="checkbox" id="clienteAlertaSwitch" name="alerta" value="1">
                                <label class="form-check-label" for="clienteAlertaSwitch">Alerta para cajeros</label>
                            </div>
                        </div>
                        <div class="col-12">
                            <div class="alert alert-info d-none" id="clienteAutoHint"></div>
                        </div>
                        <div class="col-12">
                            <p class="small text-muted mb-0" id="clienteStats"></p>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                    <button type="submit" class="btn btn-primary">Guardar</button>
                </div>
            </form>
        </div>
    </div>
</div>
