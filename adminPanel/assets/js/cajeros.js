document.addEventListener('DOMContentLoaded', () => {
    const tableBody = document.querySelector('#cajerosTable tbody');
    const filterForm = document.getElementById('cajerosFilter');
    const modalElement = document.getElementById('cajeroModal');
    const modalInstance = new bootstrap.Modal(modalElement);
    const form = document.getElementById('cajeroForm');
    let currentMode = 'create';

    async function loadCajeros() {
        try {
            const params = new URLSearchParams(new FormData(filterForm));
            const response = await apiRequest(`backend/abm_cajeros.php?${params.toString()}`);
            renderTable(response.data);
        } catch (error) {
            console.error('Error cargando cajeros', error);
        }
    }

    function renderTable(cajeros) {
        tableBody.innerHTML = '';
        cajeros.forEach((cajero) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${cajero.nombre}</td>
                <td>${cajero.usuario}</td>
                <td>${cajero.email ?? ''}</td>
                <td><span class="badge bg-secondary badge-turno">${cajero.turno}</span></td>
                <td>${cajero.apodo ?? ''}</td>
                <td>${cajero.estado === '1' || cajero.estado === 1 ? '<span class="badge bg-success">Activo</span>' : '<span class="badge bg-danger">Inactivo</span>'}</td>
                <td>${new Date(cajero.fecha_creacion).toLocaleDateString()}</td>
                <td class="text-end table-actions">
                    <button class="btn btn-sm btn-outline-secondary" data-action="edit" data-id="${cajero.id}">Editar</button>
                    <button class="btn btn-sm btn-outline-warning" data-action="toggle" data-id="${cajero.id}">${cajero.estado == 1 ? 'Desactivar' : 'Activar'}</button>
                    <button class="btn btn-sm btn-outline-danger" data-action="delete" data-id="${cajero.id}">Eliminar</button>
                </td>`;
            tr.dataset.cajero = JSON.stringify(cajero);
            tableBody.appendChild(tr);
        });
    }

    filterForm.addEventListener('submit', (event) => {
        event.preventDefault();
        loadCajeros();
    });

    tableBody.addEventListener('click', async (event) => {
        const button = event.target.closest('button[data-action]');
        if (!button) return;
        const tr = button.closest('tr');
        const cajero = JSON.parse(tr.dataset.cajero);
        const action = button.dataset.action;

        if (action === 'edit') {
            currentMode = 'update';
            form.reset();
            form.querySelector('.modal-title').textContent = 'Editar cajero';
            Object.entries(cajero).forEach(([key, value]) => {
                const input = form.querySelector(`[name="${key}"]`);
                if (input) {
                    input.value = value ?? '';
                }
            });
            form.querySelector('[name="usuario"]').setAttribute('readonly', 'readonly');
            form.querySelector('[name="contrasena"]').value = '';
            modalInstance.show();
        }

        if (action === 'toggle') {
            if (!confirm('¿Desea cambiar el estado del cajero?')) return;
            await apiRequest('backend/abm_cajeros.php', {
                method: 'POST',
                body: JSON.stringify({ action: 'toggle', id: cajero.id }),
            });
            loadCajeros();
        }

        if (action === 'delete') {
            if (!confirm('¿Desea eliminar este cajero?')) return;
            await apiRequest('backend/abm_cajeros.php', {
                method: 'POST',
                body: JSON.stringify({ action: 'delete', id: cajero.id }),
            });
            loadCajeros();
        }
    });

    modalElement.addEventListener('show.bs.modal', (event) => {
        const trigger = event.relatedTarget;
        if (!trigger) return;
        const mode = trigger.getAttribute('data-mode');
        currentMode = mode || 'create';
        form.reset();
        form.querySelector('[name="usuario"]').removeAttribute('readonly');
        form.querySelector('.modal-title').textContent = currentMode === 'create' ? 'Nuevo cajero' : 'Editar cajero';
        if (currentMode === 'create') {
            form.querySelector('[name="estado"]').value = '1';
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
        if (currentMode === 'update' && !payload.contrasena) {
            delete payload.contrasena;
        }
        try {
            await apiRequest('backend/abm_cajeros.php', {
                method: 'POST',
                body: JSON.stringify(payload),
            });
            modalInstance.hide();
            loadCajeros();
        } catch (error) {
            alert('Error guardando cajero: ' + error.message);
        }
    });

    loadCajeros();
});
