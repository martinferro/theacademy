<div class="row g-4">
    <div class="col-md-3">
        <div class="card shadow-sm">
            <div class="card-body">
                <p class="text-muted mb-2">Mensajes respondidos</p>
                <h3 id="kpi1" class="fw-bold">0</h3>
            </div>
        </div>
    </div>
    <div class="col-md-3">
        <div class="card shadow-sm">
            <div class="card-body">
                <p class="text-muted mb-2">Promedio de ticket</p>
                <h3 id="kpi2" class="fw-bold">$0</h3>
            </div>
        </div>
    </div>
    <div class="col-md-6">
        <div class="card shadow-sm h-100">
            <div class="card-body">
                <h5 class="card-title">Filtros</h5>
                <form id="metricsFilter" class="row g-2">
                    <div class="col-md-4">
                        <label class="form-label">Desde</label>
                        <input type="date" name="from" class="form-control">
                    </div>
                    <div class="col-md-4">
                        <label class="form-label">Hasta</label>
                        <input type="date" name="to" class="form-control">
                    </div>
                    <div class="col-md-4">
                        <label class="form-label">Turno</label>
                        <select name="turno" class="form-select">
                            <option value="">Todos</option>
                            <option value="manana">Mañana</option>
                            <option value="tarde">Tarde</option>
                            <option value="noche">Noche</option>
                        </select>
                    </div>
                    <div class="col-md-6">
                        <label class="form-label">Cajero</label>
                        <select name="cajero_id" class="form-select" id="filterCajero"></select>
                    </div>
                    <div class="col-md-6 d-flex align-items-end">
                        <button type="submit" class="btn btn-primary w-100">Actualizar</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
</div>

<div class="row mt-4">
    <div class="col-12">
        <div class="card shadow-sm">
            <div class="card-body">
                <h5 class="card-title">Montos solicitados</h5>
                <canvas id="paymentsChart" height="120"></canvas>
            </div>
        </div>
    </div>
</div>
