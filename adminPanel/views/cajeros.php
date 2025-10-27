<div class="card shadow-sm">
    <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-3">
            <h5 class="card-title mb-0">Gestión de Cajeros</h5>
            <button class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#cajeroModal" data-mode="create">Nuevo Cajero</button>
        </div>
        <form id="cajerosFilter" class="row g-2 mb-3">
            <div class="col-md-3">
                <input type="text" class="form-control" name="search" placeholder="Buscar por nombre o usuario">
            </div>
            <div class="col-md-2">
                <select class="form-select" name="turno">
                    <option value="">Turno</option>
                    <option value="manana">Mañana</option>
                    <option value="tarde">Tarde</option>
                    <option value="noche">Noche</option>
                </select>
            </div>
            <div class="col-md-2">
                <select class="form-select" name="estado">
                    <option value="">Estado</option>
                    <option value="1">Activo</option>
                    <option value="0">Inactivo</option>
                </select>
            </div>
            <div class="col-md-2">
                <input type="text" class="form-control" name="apodo" placeholder="Apodo">
            </div>
            <div class="col-md-3">
                <button class="btn btn-outline-primary w-100" type="submit">Filtrar</button>
            </div>
        </form>
        <div class="table-responsive">
            <table class="table table-striped align-middle" id="cajerosTable">
                <thead>
                    <tr>
                        <th>Nombre</th>
                        <th>Usuario</th>
                        <th>Email</th>
                        <th>Turno</th>
                        <th>Apodo</th>
                        <th>Estado</th>
                        <th>Creado</th>
                        <th class="text-end">Acciones</th>
                    </tr>
                </thead>
                <tbody></tbody>
            </table>
        </div>
    </div>
</div>

<div class="modal fade" id="cajeroModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog modal-lg">
        <div class="modal-content">
            <form id="cajeroForm" novalidate>
                <div class="modal-header">
                    <h5 class="modal-title">Nuevo Cajero</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
                </div>
                <div class="modal-body row g-3">
                    <input type="hidden" name="id">
                    <div class="col-md-6">
                        <label class="form-label">Nombre</label>
                        <input type="text" class="form-control" name="nombre" required>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label">Usuario</label>
                        <input type="text" class="form-control" name="usuario" required>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label">Email</label>
                        <input type="email" class="form-control" name="email">
                    </div>
                    <div class="col-md-6">
                        <label class="form-label">Contraseña</label>
                        <input type="password" class="form-control" name="contrasena">
                    </div>
                    <div class="col-md-6">
                        <label class="form-label">Turno</label>
                        <select class="form-select" name="turno">
                            <option value="manana">Mañana</option>
                            <option value="tarde">Tarde</option>
                            <option value="noche">Noche</option>
                            <option value="personalizado">Personalizado</option>
                        </select>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label">Apodo</label>
                        <input type="text" class="form-control" name="apodo">
                    </div>
                    <div class="col-md-4">
                        <label class="form-label">Estado</label>
                        <select class="form-select" name="estado">
                            <option value="1">Activo</option>
                            <option value="0">Inactivo</option>
                        </select>
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
