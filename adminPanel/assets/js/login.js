document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('loginForm');
    const messageBox = document.getElementById('loginMessage');

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!form.checkValidity()) {
            form.classList.add('was-validated');
            return;
        }

        const formData = new FormData(form);
        const payload = Object.fromEntries(formData.entries());

        try {
            const response = await fetch('../backend/login.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await response.json();
            messageBox.classList.remove('d-none', 'alert-danger', 'alert-success');
            if (data.success) {
                messageBox.classList.add('alert-success');
                messageBox.textContent = 'Acceso concedido. Redirigiendo...';
                setTimeout(() => window.location.href = '../index.php', 800);
            } else {
                messageBox.classList.add('alert-danger');
                messageBox.textContent = data.message || 'Error de autenticación.';
            }
        } catch (error) {
            messageBox.classList.remove('d-none');
            messageBox.classList.add('alert-danger');
            messageBox.textContent = 'Error de red: ' + error.message;
        }
    });
});
