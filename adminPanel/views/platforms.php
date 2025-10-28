<section class="container">
    <div class="d-flex justify-content-between align-items-center mb-4">
        <div>
            <h1 class="h3 mb-1">Links a plataformas</h1>
            <p class="text-muted mb-0">Administra los accesos rápidos visibles para los usuarios en el portal principal.</p>
        </div>
        <button id="reloadPlatforms" class="btn btn-outline-primary btn-sm">Actualizar</button>
    </div>

    <div class="row g-4">
        <div class="col-12 col-lg-5">
            <div class="card shadow-sm h-100">
                <div class="card-body">
                    <h2 class="h5">Crear o editar enlace</h2>
                    <p class="text-muted">Define el nombre público y la URL que se mostrará en la vista de clientes.</p>
                    <div id="platformFormAlert" class="alert d-none" role="alert"></div>
                    <form id="platformForm" novalidate>
                        <input type="hidden" id="platformId" />
                        <div class="mb-3">
                            <label for="platformName" class="form-label">Nombre de la plataforma</label>
                            <input type="text" class="form-control" id="platformName" required placeholder="Ej. Ganemos" />
                        </div>
                        <div class="mb-3">
                            <label for="platformUrl" class="form-label">URL</label>
                            <input type="url" class="form-control" id="platformUrl" required placeholder="https://..." />
                        </div>
                        <div class="form-check form-switch mb-3">
                            <input class="form-check-input" type="checkbox" id="platformActive" checked />
                            <label class="form-check-label" for="platformActive">Visible para los usuarios</label>
                        </div>
                        <div class="d-flex gap-2">
                            <button type="submit" class="btn btn-primary">Guardar</button>
                            <button type="button" id="cancelEdit" class="btn btn-outline-secondary d-none">Cancelar edición</button>
                        </div>
                    </form>
                </div>
            </div>
        </div>

        <div class="col-12 col-lg-7">
            <div class="card shadow-sm">
                <div class="card-body">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <h2 class="h5 mb-0">Listado de enlaces</h2>
                        <span class="badge bg-light text-dark" id="platformCounter">0 activos</span>
                    </div>
                    <div class="table-responsive">
                        <table class="table align-middle" id="platformsTable">
                            <thead>
                                <tr>
                                    <th>Nombre</th>
                                    <th>URL</th>
                                    <th>Estado</th>
                                    <th class="text-end">Acciones</th>
                                </tr>
                            </thead>
                            <tbody id="platformsTableBody">
                                <tr>
                                    <td colspan="4" class="text-center text-muted py-4">No hay enlaces configurados.</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    </div>
</section>
