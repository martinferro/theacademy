(function () {
    const feedback = document.getElementById('configFeedback');
    const lineList = document.getElementById('whatsappLineList');
    const lineListEmpty = document.getElementById('whatsappLineListEmpty');
    const scopeAll = document.getElementById('whatsappScopeAll');
    const scopeSelected = document.getElementById('whatsappScopeSelected');

    const buttons = {
        clearMessages: document.getElementById('actionClearMessages'),
        purgeWhatsapp: document.getElementById('actionPurgeWhatsapp'),
        deleteCajeros: document.getElementById('actionDeleteCajeros'),
        deleteIncoming: document.getElementById('actionDeleteIncoming'),
        deleteClients: document.getElementById('actionDeleteClients'),
    };

    function setFeedback(type, message) {
        if (!feedback) return;
        feedback.classList.remove('d-none', 'alert-success', 'alert-danger', 'alert-info');
        feedback.textContent = message;
        const className = type === 'success' ? 'alert-success' : type === 'danger' ? 'alert-danger' : 'alert-info';
        feedback.classList.add(className);
    }

    function clearFeedback() {
        if (!feedback) return;
        feedback.classList.add('d-none');
        feedback.textContent = '';
    }

    function toggleButtons(disabled) {
        Object.values(buttons).forEach((btn) => {
            if (btn) btn.disabled = disabled;
        });
    }

    async function callAction(payload) {
        const response = await fetch('backend/configuracion.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        return response.json();
    }

    async function loadWhatsappLines() {
        try {
            const response = await fetch('backend/configuracion.php?action=list_lines');
            const data = await response.json();
            if (!data.success || !Array.isArray(data.lines)) {
                throw new Error('No se pudieron obtener las líneas.');
            }

            const hasLines = data.lines.length > 0;
            lineList.classList.toggle('d-none', !hasLines || !scopeSelected.checked);
            lineListEmpty.classList.toggle('d-none', hasLines);

            lineList.querySelectorAll('.form-check').forEach((el) => el.remove());

            if (hasLines) {
                data.lines.forEach((line) => {
                    const wrapper = document.createElement('div');
                    wrapper.className = 'form-check';

                    const input = document.createElement('input');
                    input.type = 'checkbox';
                    input.className = 'form-check-input';
                    input.name = 'configLine';
                    input.id = `line-${line.id}`;
                    input.value = line.id;

                    const label = document.createElement('label');
                    label.className = 'form-check-label';
                    label.setAttribute('for', input.id);
                    label.textContent = `${line.nombre} (${line.id})`;

                    wrapper.appendChild(input);
                    wrapper.appendChild(label);
                    lineList.appendChild(wrapper);
                });
            }
        } catch (error) {
            setFeedback('danger', error.message);
        }
    }

    function getSelectedLines() {
        return Array.from(document.querySelectorAll('input[name="configLine"]:checked')).map((input) => input.value);
    }

    async function handleClearMessages() {
        if (!confirm('Se eliminará todo el historial de mensajes de chat. ¿Continuar?')) return;
        clearFeedback();
        toggleButtons(true);
        try {
            const data = await callAction({ action: 'clear_messages' });
            if (!data.success) throw new Error(data.message || 'No se pudo borrar el historial.');
            setFeedback('success', 'Historial de mensajes eliminado correctamente.');
        } catch (error) {
            setFeedback('danger', error.message);
        } finally {
            toggleButtons(false);
        }
    }

    async function handlePurgeWhatsapp() {
        const mode = scopeSelected.checked ? 'selected' : 'all';
        const selectedLines = getSelectedLines();

        if (mode === 'selected' && selectedLines.length === 0) {
            setFeedback('danger', 'Selecciona al menos una línea para borrar.');
            return;
        }

        const confirmationText =
            mode === 'all'
                ? 'Se eliminarán todas las líneas de WhatsApp, credenciales y sesiones asociadas. ¿Confirmas?'
                : `Se eliminarán ${selectedLines.length} línea(s) seleccionada(s). ¿Confirmas?`;

        if (!confirm(confirmationText)) return;

        clearFeedback();
        toggleButtons(true);
        try {
            const data = await callAction({ action: 'purge_whatsapp_lines', mode, lines: selectedLines });
            if (!data.success) throw new Error(data.message || 'No se pudo borrar la configuración de WhatsApp.');
            setFeedback('success', 'Configuración de WhatsApp borrada correctamente.');
            await loadWhatsappLines();
        } catch (error) {
            setFeedback('danger', error.message);
        } finally {
            toggleButtons(false);
        }
    }

    async function handleDeleteCajeros() {
        if (!confirm('Esta acción eliminará todos los cajeros, pagos y tokens. ¿Deseas continuar?')) return;
        clearFeedback();
        toggleButtons(true);
        try {
            const data = await callAction({ action: 'delete_cajeros' });
            if (!data.success) throw new Error(data.message || 'No se pudieron eliminar los cajeros.');
            setFeedback('success', 'Cajeros eliminados correctamente.');
        } catch (error) {
            setFeedback('danger', error.message);
        } finally {
            toggleButtons(false);
        }
    }

    async function handleDeleteIncoming() {
        if (!confirm('Se eliminarán todos los mensajes entrantes registrados. ¿Continuar?')) return;
        clearFeedback();
        toggleButtons(true);
        try {
            const data = await callAction({ action: 'delete_incoming_messages' });
            if (!data.success) throw new Error(data.message || 'No se pudieron eliminar los mensajes entrantes.');
            setFeedback('success', 'Mensajes entrantes eliminados correctamente.');
        } catch (error) {
            setFeedback('danger', error.message);
        } finally {
            toggleButtons(false);
        }
    }

    async function handleDeleteClients() {
        if (!confirm('Eliminarás todos los clientes y sus datos relacionados. Esta acción es irreversible. ¿Confirmas?')) return;
        clearFeedback();
        toggleButtons(true);
        try {
            const data = await callAction({ action: 'delete_clients' });
            if (!data.success) throw new Error(data.message || 'No se pudieron eliminar los clientes.');
            setFeedback('success', 'Clientes eliminados correctamente.');
        } catch (error) {
            setFeedback('danger', error.message);
        } finally {
            toggleButtons(false);
        }
    }

    function handleScopeChange() {
        const showList = scopeSelected.checked;
        lineList.classList.toggle('d-none', !showList || lineList.dataset.loading === '1');
    }

    if (scopeAll && scopeSelected) {
        [scopeAll, scopeSelected].forEach((radio) => radio.addEventListener('change', handleScopeChange));
    }

    if (buttons.clearMessages) buttons.clearMessages.addEventListener('click', handleClearMessages);
    if (buttons.purgeWhatsapp) buttons.purgeWhatsapp.addEventListener('click', handlePurgeWhatsapp);
    if (buttons.deleteCajeros) buttons.deleteCajeros.addEventListener('click', handleDeleteCajeros);
    if (buttons.deleteIncoming) buttons.deleteIncoming.addEventListener('click', handleDeleteIncoming);
    if (buttons.deleteClients) buttons.deleteClients.addEventListener('click', handleDeleteClients);

    loadWhatsappLines();
})();
