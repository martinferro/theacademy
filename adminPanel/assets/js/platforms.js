document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('platformForm');
    const inputId = document.getElementById('platformId');
    const inputName = document.getElementById('platformName');
    const inputUrl = document.getElementById('platformUrl');
    const inputActive = document.getElementById('platformActive');
    const cancelEditBtn = document.getElementById('cancelEdit');
    const reloadBtn = document.getElementById('reloadPlatforms');
    const alertBox = document.getElementById('platformFormAlert');
    const tableBody = document.getElementById('platformsTableBody');
    const counterBadge = document.getElementById('platformCounter');

    let platforms = [];

    const showFormAlert = (message, type = 'info') => {
        alertBox.textContent = message;
        alertBox.className = `alert alert-${type}`;
        alertBox.classList.remove('d-none');
        if (type === 'success') {
            setTimeout(() => {
                alertBox.classList.add('d-none');
            }, 2500);
        }
    };

    const clearFormAlert = () => {
        alertBox.classList.add('d-none');
        alertBox.textContent = '';
    };

    const resetForm = () => {
        inputId.value = '';
        inputName.value = '';
        inputUrl.value = '';
        inputActive.checked = true;
        cancelEditBtn.classList.add('d-none');
        form.dataset.mode = 'create';
    };

    const populateForm = (platform) => {
        inputId.value = platform.id;
        inputName.value = platform.nombre;
        inputUrl.value = platform.url;
        inputActive.checked = Boolean(platform.activo);
        cancelEditBtn.classList.remove('d-none');
        form.dataset.mode = 'edit';
        inputName.focus();
    };

    const renderTable = () => {
        tableBody.innerHTML = '';
        if (!platforms.length) {
            tableBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-4">No hay enlaces configurados.</td></tr>';
            counterBadge.textContent = '0 activos';
            return;
        }

        const activos = platforms.filter((platform) => Boolean(platform.activo)).length;
        counterBadge.textContent = `${activos} activos de ${platforms.length}`;

        platforms.forEach((platform) => {
            const row = document.createElement('tr');

            const nameCell = document.createElement('td');
            nameCell.textContent = platform.nombre;

            const urlCell = document.createElement('td');
            const urlLink = document.createElement('a');
            urlLink.href = platform.url;
            urlLink.target = '_blank';
            urlLink.rel = 'noopener';
            urlLink.textContent = platform.url;
            urlCell.appendChild(urlLink);

            const statusCell = document.createElement('td');
            const statusBadge = document.createElement('span');
            statusBadge.className = `badge ${platform.activo ? 'bg-success-subtle text-success' : 'bg-secondary-subtle text-muted'}`;
            statusBadge.textContent = platform.activo ? 'Visible' : 'Oculto';
            statusCell.appendChild(statusBadge);

            const actionsCell = document.createElement('td');
            actionsCell.className = 'text-end';

            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'btn btn-sm btn-outline-primary me-2';
            editBtn.textContent = 'Editar';
            editBtn.addEventListener('click', () => populateForm(platform));

            const toggleBtn = document.createElement('button');
            toggleBtn.type = 'button';
            toggleBtn.className = `btn btn-sm ${platform.activo ? 'btn-outline-warning' : 'btn-outline-success'} me-2`;
            toggleBtn.textContent = platform.activo ? 'Ocultar' : 'Mostrar';
            toggleBtn.addEventListener('click', async () => {
                try {
                    const response = await apiRequest('backend/platform_links.php', {
                        method: 'POST',
                        body: JSON.stringify({ action: 'toggle', id: platform.id }),
                    });
                    if (!response.success) {
                        throw new Error(response.message || 'No se pudo actualizar el estado.');
                    }
                    await loadPlatforms();
                    showFormAlert('Estado actualizado correctamente.', 'success');
                } catch (error) {
                    showFormAlert(error.message || 'No se pudo actualizar el estado.', 'danger');
                }
            });

            const deleteBtn = document.createElement('button');
            deleteBtn.type = 'button';
            deleteBtn.className = 'btn btn-sm btn-outline-danger';
            deleteBtn.textContent = 'Eliminar';
            deleteBtn.addEventListener('click', async () => {
                if (!confirm('¿Seguro que deseas eliminar este enlace?')) {
                    return;
                }
                try {
                    const response = await apiRequest('backend/platform_links.php', {
                        method: 'POST',
                        body: JSON.stringify({ action: 'delete', id: platform.id }),
                    });
                    if (!response.success) {
                        throw new Error(response.message || 'No se pudo eliminar el enlace.');
                    }
                    if (form.dataset.mode === 'edit' && Number(inputId.value) === Number(platform.id)) {
                        resetForm();
                    }
                    await loadPlatforms();
                    showFormAlert('Enlace eliminado.', 'success');
                } catch (error) {
                    showFormAlert(error.message || 'No se pudo eliminar el enlace.', 'danger');
                }
            });

            actionsCell.append(editBtn, toggleBtn, deleteBtn);
            row.append(nameCell, urlCell, statusCell, actionsCell);
            tableBody.appendChild(row);
        });
    };

    const loadPlatforms = async () => {
        try {
            const response = await apiRequest('backend/platform_links.php');
            if (!response.success) {
                throw new Error(response.message || 'No se pudieron cargar los enlaces.');
            }
            platforms = Array.isArray(response.data) ? response.data : [];
            renderTable();
        } catch (error) {
            platforms = [];
            renderTable();
            showFormAlert(error.message || 'No se pudieron cargar los enlaces.', 'danger');
        }
    };

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearFormAlert();

        const nombre = inputName.value.trim();
        const url = inputUrl.value.trim();
        const activo = inputActive.checked;

        if (!nombre || !url) {
            showFormAlert('Completa el nombre y la URL.', 'warning');
            return;
        }

        const action = form.dataset.mode === 'edit' ? 'update' : 'create';
        const payload = { action, nombre, url, activo };
        if (action === 'update') {
            payload.id = Number(inputId.value);
            if (!payload.id) {
                showFormAlert('ID inválido para la edición.', 'danger');
                return;
            }
        }

        try {
            const response = await apiRequest('backend/platform_links.php', {
                method: 'POST',
                body: JSON.stringify(payload),
            });
            if (!response.success) {
                throw new Error(response.message || 'Acción no completada.');
            }
            await loadPlatforms();
            resetForm();
            showFormAlert('Enlace guardado correctamente.', 'success');
        } catch (error) {
            showFormAlert(error.message || 'No se pudo guardar el enlace.', 'danger');
        }
    });

    cancelEditBtn.addEventListener('click', () => {
        resetForm();
        clearFormAlert();
    });

    reloadBtn.addEventListener('click', () => {
        clearFormAlert();
        loadPlatforms();
    });

    resetForm();
    loadPlatforms();
});
