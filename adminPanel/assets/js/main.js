async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options,
    });
    if (!response.ok) {
        const message = await response.text();
        throw new Error(message || 'Error en la solicitud');
    }
    return response.json();
}

document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await apiRequest('backend/logout.php');
                window.location.href = 'views/login.php';
            } catch (error) {
                alert('No se pudo cerrar sesión: ' + error.message);
            }
        });
    }
});
