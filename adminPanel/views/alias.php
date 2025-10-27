<div class="card shadow-sm mb-4">
    <div class="card-body">
        <div class="d-flex justify-content-between align-items-center mb-3">
            <h5 class="card-title mb-0">Alias Bancarios</h5>
            <button class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#aliasModal" data-mode="create">Nuevo Alias</button>
        </div>
        <div class="table-responsive">
            <table class="table table-striped align-middle" id="aliasTable">
                <thead>
                    <tr>
                        <th>Alias</th>
                        <th>Monto máximo</th>
                        <th>Monto usado</th>
                        <th>Saldo restante</th>
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

<div class="card shadow-sm">
    <div class="card-body">
        <h5 class="card-title">Rotación automática</h5>
        <form id="aliasAssignForm" class="row g-2 align-items-end">
            <div class="col-md-3">
                <label class="form-label">Monto solicitado</label>
                <input type="number" min="1" step="0.01" class="form-control" name="monto" required>
            </div>
            <div class="col-md-3">
                <button class="btn btn-outline-primary w-100" type="submit">Asignar alias disponible</button>
            </div>
        </form>
        <div id="aliasAssignResult" class="mt-3"></div>
    </div>
</div>

<div class="modal fade" id="aliasModal" tabindex="-1" aria-hidden="true">
    <div class="modal-dialog">
        <div class="modal-content">
            <form id="aliasForm" novalidate>
                <div class="modal-header">
                    <h5 class="modal-title">Nuevo alias</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Cerrar"></button>
                </div>
                <div class="modal-body row g-3">
                    <input type="hidden" name="id">
                    <div class="col-12">
                        <label class="form-label">Alias / CBU / CVU</label>
                        <input type="text" class="form-control" name="alias" required>
                    </div>
                    <div class="col-12">
                        <label class="form-label">Monto máximo</label>
                        <input type="number" min="0" step="0.01" class="form-control" name="monto_maximo" required>
                    </div>
                    <div class="col-12">
                        <label class="form-label">Monto usado</label>
                        <input type="number" min="0" step="0.01" class="form-control" name="monto_usado" value="0">
                    </div>
                    <div class="col-12">
                        <label class="form-label">Estado</label>
                        <select class="form-select" name="activo">
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
