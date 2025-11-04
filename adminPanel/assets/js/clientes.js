document.addEventListener('DOMContentLoaded', () => {
    const tableBody = document.querySelector('#clientesTable tbody');
    if (!tableBody) {
        return;
    }

    const filterForm = document.getElementById('clientesFilter');
    const refreshButton = document.getElementById('refreshClientes');
    const modalElement = document.getElementById('clienteModal');
    const modalInstance = new bootstrap.Modal(modalElement);
    const form = document.getElementById('clienteForm');
    const autoSwitch = document.getElementById('clienteAutoSwitch');
    const autoHint = document.getElementById('clienteAutoHint');
    const statsContainer = document.getElementById('clienteStats');
    const passwordInput = form.querySelector('[name="password"]');
    const categoriaSelect = form.querySelector('[name="categoria"]');
    let currentMode = 'create';
    let currentCliente = null;

    const categoriaBadges = {
        VIP: 'bg-warning text-dark',
        REGULAR: 'bg-success',
        ESPORADICO: 'bg-secondary',
    };

    async function loadClientes() {
        try {
            const params = filterForm ? new URLSearchParams(new FormData(filterForm)) : new URLSearchParams();
            const response = await apiRequest(`backend/abm_clientes.php?${params.toString()}`);
            renderTable(response.data);
        } catch (error) {
            console.error('Error cargando clientes', error);
        }
    }

    function renderTable(clientes) {
        tableBody.innerHTML = '';
        if (!Array.isArray(clientes) || clientes.length === 0) {
            const emptyRow = document.createElement('tr');
            emptyRow.innerHTML = '<td colspan="7" class="text-center text-muted py-4">No hay clientes para mostrar.</td>';
            tableBody.appendChild(emptyRow);
            return;
        }
        clientes.forEach((cliente) => {
            const tr = document.createElement('tr');
            if (parseInt(cliente.alerta, 10) === 1) {
                tr.classList.add('table-warning');
            }
            tr.dataset.cliente = JSON.stringify(cliente);
            const categoriaBadge = categoriaBadges[cliente.categoria] || 'bg-secondary';
            const autoBadge = parseInt(cliente.usa_categoria_auto, 10) === 1
                ? '<span class="badge bg-info ms-1">Automática</span>'
                : '<span class="badge bg-dark ms-1">Manual</span>';
            const totalInteracciones = cliente.total_contactos ?? 0;
            const ultimoContacto = cliente.ultima_interaccion
                ? new Date(cliente.ultima_interaccion).toLocaleString()
                : 'Sin registros';
            const contactoDetalle = [cliente.email || 'Sin email', cliente.telefono || 'Sin teléfono']
                .filter(Boolean)
                .join('<br>');
            const alertaBadge = parseInt(cliente.alerta, 10) === 1
                ? '<span class="badge bg-danger">Alerta activa</span>'
                : '<span class="badge bg-success">Sin alerta</span>';
            tr.innerHTML = `
                <td>
                    <strong>${cliente.nombre}</strong>
                    <div class="small text-muted">Creado: ${new Date(cliente.creado_en).toLocaleDateString()}</div>
                </td>
                <td>${contactoDetalle}</td>
                <td>
                    <span class="badge ${categoriaBadge}">${cliente.categoria}</span>
                    ${autoBadge}
                    ${cliente.categoria_recomendada && cliente.categoria !== cliente.categoria_recomendada
                        ? `<div class="small text-muted">Sugerida: ${cliente.categoria_recomendada}</div>`
                        : ''}
                </td>
                <td>
                    ${totalInteracciones}
                    <div class="small text-muted">Últimos 7 días: ${cliente.contactos_7d ?? 0}</div>
                </td>
                <td>${ultimoContacto}</td>
                <td>${alertaBadge}</td>
                <td class="text-end table-actions">
                    <button class="btn btn-sm btn-outline-secondary" data-action="edit">Editar</button>
                    <button class="btn btn-sm btn-outline-primary" data-action="register-contact">Registrar contacto</button>
                    <button class="btn btn-sm btn-outline-warning" data-action="toggle-alert">
                        ${parseInt(cliente.alerta, 10) === 1 ? 'Quitar alerta' : 'Marcar alerta'}
                    </button>
                </td>
            `;
            tableBody.appendChild(tr);
        });
    }

    function updateAutoSection(cliente) {
        const isAuto = autoSwitch.checked;
        categoriaSelect.disabled = isAuto;
        if (isAuto) {
            const recomendada = cliente?.categoria_recomendada || 'ESPORADICO';
            autoHint.textContent = `Se asignará automáticamente como ${recomendada}. Puedes cambiarlo desde el panel si es necesario.`;
            autoHint.classList.remove('d-none');
        } else if (cliente?.categoria_recomendada) {
            autoHint.textContent = `Clasificación sugerida por actividad: ${cliente.categoria_recomendada}.`;
            autoHint.classList.remove('d-none');
        } else {
            autoHint.classList.add('d-none');
            autoHint.textContent = '';
        }
    }

    function updateStats(cliente) {
        if (!cliente) {
            statsContainer.textContent = '';
            return;
        }
        const total = cliente.total_contactos ?? 0;
        const last = cliente.ultima_interaccion
            ? new Date(cliente.ultima_interaccion).toLocaleString()
            : 'Sin registros';
        statsContainer.textContent = `Interacciones registradas: ${total} · Último contacto: ${last} · Últimos 7 días: ${cliente.contactos_7d ?? 0}`;
    }

    filterForm?.addEventListener('submit', (event) => {
        event.preventDefault();
        loadClientes();
    });

    refreshButton?.addEventListener('click', () => {
        loadClientes();
    });

    tableBody.addEventListener('click', async (event) => {
        const button = event.target.closest('button[data-action]');
        if (!button) {
            return;
        }
        const tr = button.closest('tr');
        if (!tr || !tr.dataset.cliente) {
            return;
        }
        const cliente = JSON.parse(tr.dataset.cliente);
        const action = button.dataset.action;

        if (action === 'edit') {
            currentMode = 'update';
            currentCliente = cliente;
            form.reset();
            form.classList.remove('was-validated');
            modalElement.querySelector('.modal-title').textContent = `Editar cliente`;
            Object.entries(cliente).forEach(([key, value]) => {
                const input = form.querySelector(`[name="${key}"]`);
                if (input) {
                    input.value = value ?? '';
                }
            });
            if (cliente.email === null) {
                form.querySelector('[name="email"]').value = '';
            }
            if (cliente.telefono === null) {
                form.querySelector('[name="telefono"]').value = '';
            }
            autoSwitch.checked = parseInt(cliente.usa_categoria_auto, 10) === 1;
            form.querySelector('[name="alerta"]').checked = parseInt(cliente.alerta, 10) === 1;
            passwordInput.value = '';
            passwordInput.required = false;
            updateAutoSection(cliente);
            updateStats(cliente);
            modalInstance.show();
            return;
        }

        if (action === 'register-contact') {
            try {
                await apiRequest('backend/abm_clientes.php', {
                    method: 'POST',
                    body: JSON.stringify({ action: 'register_contact', cliente_id: cliente.id }),
                });
                loadClientes();
            } catch (error) {
                alert('No se pudo registrar el contacto: ' + error.message);
            }
            return;
        }

        if (action === 'toggle-alert') {
            try {
                await apiRequest('backend/abm_clientes.php', {
                    method: 'POST',
                    body: JSON.stringify({ action: 'toggle_alerta', cliente_id: cliente.id }),
                });
                loadClientes();
            } catch (error) {
                alert('No se pudo actualizar la alerta: ' + error.message);
            }
            return;
        }
    });

    modalElement.addEventListener('show.bs.modal', (event) => {
        const trigger = event.relatedTarget;
        if (!trigger) {
            return;
        }
        currentMode = trigger.getAttribute('data-mode') || 'create';
        currentCliente = null;
        form.reset();
        form.classList.remove('was-validated');
        passwordInput.value = '';
        autoSwitch.checked = true;
        passwordInput.required = currentMode === 'create';
        modalElement.querySelector('.modal-title').textContent = currentMode === 'create' ? 'Nuevo cliente' : 'Editar cliente';
        autoHint.classList.add('d-none');
        autoHint.textContent = '';
        statsContainer.textContent = '';
        updateAutoSection(currentCliente);
    });

    modalElement.addEventListener('hidden.bs.modal', () => {
        form.reset();
        form.classList.remove('was-validated');
        currentCliente = null;
        autoHint.classList.add('d-none');
        autoHint.textContent = '';
        statsContainer.textContent = '';
        passwordInput.required = true;
    });

    autoSwitch.addEventListener('change', () => {
        updateAutoSection(currentCliente);
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!form.checkValidity()) {
            form.classList.add('was-validated');
            return;
        }
        const formData = new FormData(form);
        const payload = Object.fromEntries(formData.entries());
        payload.usa_categoria_auto = formData.has('usa_categoria_auto') ? 1 : 0;
        payload.alerta = formData.has('alerta') ? 1 : 0;
        payload.action = currentMode === 'create' ? 'create' : 'update';
        if (currentMode === 'update') {
            payload.id = formData.get('id');
            if (!payload.id) {
                alert('No se pudo identificar al cliente.');
                return;
            }
        }
        if (!payload.password) {
            delete payload.password;
        }
        if (payload.usa_categoria_auto === 1) {
            delete payload.categoria;
        }
        try {
            await apiRequest('backend/abm_clientes.php', {
                method: 'POST',
                body: JSON.stringify(payload),
            });
            modalInstance.hide();
            loadClientes();
        } catch (error) {
            alert('No se pudo guardar el cliente: ' + error.message);
        }
    });

    loadClientes();
});
