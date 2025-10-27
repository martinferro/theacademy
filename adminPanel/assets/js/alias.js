document.addEventListener('DOMContentLoaded', () => {
    const tableBody = document.querySelector('#aliasTable tbody');
    const modalElement = document.getElementById('aliasModal');
    const modalInstance = new bootstrap.Modal(modalElement);
    const form = document.getElementById('aliasForm');
    const assignForm = document.getElementById('aliasAssignForm');
    const assignResult = document.getElementById('aliasAssignResult');
    let currentMode = 'create';

    async function loadAlias() {
        try {
            const response = await apiRequest('backend/abm_alias.php');
            renderTable(response.data);
        } catch (error) {
            console.error('Error cargando alias', error);
        }
    }

    function renderTable(aliasList) {
        tableBody.innerHTML = '';
        aliasList.forEach((item) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${item.alias}</td>
                <td>$${Number(item.monto_maximo).toLocaleString('es-AR')}</td>
                <td>$${Number(item.monto_usado).toLocaleString('es-AR')}</td>
                <td>$${Number(item.saldo_restante).toLocaleString('es-AR')}</td>
                <td>${item.activo == 1 ? '<span class="badge bg-success">Activo</span>' : '<span class="badge bg-danger">Inactivo</span>'}</td>
                <td>${new Date(item.fecha_creacion).toLocaleDateString()}</td>
                <td class="text-end table-actions">
                    <button class="btn btn-sm btn-outline-secondary" data-action="edit">Editar</button>
                    <button class="btn btn-sm btn-outline-warning" data-action="toggle">${item.activo == 1 ? 'Desactivar' : 'Activar'}</button>
                    <button class="btn btn-sm btn-outline-danger" data-action="delete">Eliminar</button>
                </td>`;
            tr.dataset.alias = JSON.stringify(item);
            tableBody.appendChild(tr);
        });
    }

    tableBody.addEventListener('click', async (event) => {
        const button = event.target.closest('button[data-action]');
        if (!button) return;
        const tr = button.closest('tr');
        const alias = JSON.parse(tr.dataset.alias);
        const action = button.dataset.action;

        if (action === 'edit') {
            currentMode = 'update';
            form.reset();
            form.querySelector('.modal-title').textContent = 'Editar alias';
            Object.entries(alias).forEach(([key, value]) => {
                const input = form.querySelector(`[name="${key}"]`);
                if (input) {
                    input.value = value ?? '';
                }
            });
            modalInstance.show();
        }

        if (action === 'toggle') {
            if (!confirm('¿Desea cambiar el estado del alias?')) return;
            await apiRequest('backend/abm_alias.php', {
                method: 'POST',
                body: JSON.stringify({ action: 'toggle', id: alias.id }),
            });
            loadAlias();
        }

        if (action === 'delete') {
            if (!confirm('¿Desea eliminar este alias?')) return;
            await apiRequest('backend/abm_alias.php', {
                method: 'POST',
                body: JSON.stringify({ action: 'delete', id: alias.id }),
            });
            loadAlias();
        }
    });

    modalElement.addEventListener('show.bs.modal', (event) => {
        const trigger = event.relatedTarget;
        if (!trigger) return;
        const mode = trigger.getAttribute('data-mode');
        currentMode = mode || 'create';
        form.reset();
        form.querySelector('.modal-title').textContent = currentMode === 'create' ? 'Nuevo alias' : 'Editar alias';
        if (currentMode === 'create') {
            form.querySelector('[name="activo"]').value = '1';
            form.querySelector('[name="monto_usado"]').value = '0';
        }
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!form.checkValidity()) {
            form.classList.add('was-validated');
            return;
        }
        const formData = new FormData(form);
        const payload = Object.fromEntries(formData.entries());
        payload.action = currentMode === 'create' ? 'create' : 'update';
        try {
            await apiRequest('backend/abm_alias.php', {
                method: 'POST',
                body: JSON.stringify(payload),
            });
            modalInstance.hide();
            loadAlias();
        } catch (error) {
            alert('Error guardando alias: ' + error.message);
        }
    });

    assignForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!assignForm.checkValidity()) {
            assignForm.classList.add('was-validated');
            return;
        }
        const formData = new FormData(assignForm);
        const monto = parseFloat(formData.get('monto'));
        try {
            const assignResponse = await apiRequest('backend/abm_alias.php', {
                method: 'POST',
                body: JSON.stringify({ action: 'assign', monto }),
            });
            if (!assignResponse.success) {
                assignResult.innerHTML = `<div class="alert alert-warning">${assignResponse.message}</div>`;
                return;
            }
            const alias = assignResponse.data;
            assignResult.innerHTML = `<div class="alert alert-success">Alias sugerido: <strong>${alias.alias}</strong> (saldo restante: $${Number(alias.saldo_restante).toLocaleString('es-AR')})</div>`;

            // Simulate confirmation to update rotation automatically
            await apiRequest('backend/abm_alias.php', {
                method: 'POST',
                body: JSON.stringify({ action: 'register_payment', alias_id: alias.id, monto }),
            });
            loadAlias();
        } catch (error) {
            assignResult.innerHTML = `<div class="alert alert-danger">Error: ${error.message}</div>`;
        }
    });

    loadAlias();
});
