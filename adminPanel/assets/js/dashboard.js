document.addEventListener('DOMContentLoaded', () => {
    const filterForm = document.getElementById('metricsFilter');
    const cajeroSelect = document.getElementById('filterCajero');
    const kpi1Element = document.getElementById('kpi1');
    const kpi2Element = document.getElementById('kpi2');
    let chartInstance = null;

    async function loadCajeros() {
        try {
            const response = await apiRequest('backend/abm_cajeros.php');
            cajeroSelect.innerHTML = '<option value="">Todos</option>';
            response.data.forEach((cajero) => {
                const option = document.createElement('option');
                option.value = cajero.id;
                option.textContent = `${cajero.nombre} (${cajero.apodo || cajero.usuario})`;
                cajeroSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Error cargando cajeros', error);
        }
    }

    function getFilterParams() {
        const formData = new FormData(filterForm);
        const params = new URLSearchParams();
        for (const [key, value] of formData.entries()) {
            if (value) {
                params.append(key, value);
            }
        }
        return params.toString();
    }

    async function loadMetrics() {
        try {
            const params = getFilterParams();
            const data = await apiRequest(`backend/metrics.php${params ? `?${params}` : ''}`);
            kpi1Element.textContent = data.kpi1;
            kpi2Element.textContent = `$${Number(data.kpi2).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;

            const labels = data.chart.map((item) => item.fecha);
            const values = data.chart.map((item) => item.total_monto);

            const ctx = document.getElementById('paymentsChart').getContext('2d');
            if (chartInstance) {
                chartInstance.destroy();
            }
            chartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels,
                    datasets: [{
                        label: 'Monto solicitado',
                        data: values,
                        borderColor: '#0d6efd',
                        backgroundColor: 'rgba(13, 110, 253, 0.1)',
                        tension: 0.3,
                        fill: true,
                    }],
                },
                options: {
                    responsive: true,
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: (value) => `$${value}`,
                            },
                        },
                    },
                },
            });
        } catch (error) {
            console.error('Error obteniendo métricas', error);
        }
    }

    filterForm.addEventListener('submit', (event) => {
        event.preventDefault();
        loadMetrics();
    });

    loadCajeros().then(loadMetrics);
});
