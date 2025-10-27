# Panel de administración de cajeros y alias bancarios

Este módulo implementa un panel web para administrar cajeros, alias bancarios y consultar métricas de operación. Está desarrollado con PHP 8 (mysqli), MySQL y Bootstrap 5 con interacciones AJAX.

## Características principales

- **Autenticación de administrador** con sesión y protección de endpoints.
- **Gestión de cajeros**: alta, baja, modificación, asignación de turno/apodo, cambio de estado y filtros avanzados.
- **Gestión de alias**: control de cupos, activación/desactivación y rotación automática que descuenta cupos al confirmar pagos.
- **Dashboard de métricas** con KPIs y gráfico dinámico de montos solicitados filtrable por rango de fechas, cajero y turno.

## Estructura

```
/adminPanel/
  index.php
  dashboard.php
  setup.sql
  README.md
  /backend/
    db.php
    login.php
    logout.php
    abm_cajeros.php
    abm_alias.php
    metrics.php
  /views/
    login.php
    cajeros.php
    alias.php
  /assets/
    /css/custom.css
    /js/
      main.js
      login.js
      dashboard.js
      cajeros.js
      alias.js
```

## Configuración

1. Ejecutar `setup.sql` en MySQL para crear la base de datos `bank_ops` y las tablas necesarias. Se incluye un usuario administrador (`admin` / `admin123`).
2. Ajustar credenciales de conexión editando `backend/db.php` o configurando las variables de entorno `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` y `DB_PORT`.
3. Configurar el servidor web (Apache/Nginx) para apuntar el directorio `/adminPanel` como raíz del módulo PHP.

## Uso

1. Acceder a `views/login.php` e iniciar sesión.
2. Navegar por el menú superior para administrar cajeros, alias o revisar el dashboard.
3. Todas las operaciones CRUD utilizan AJAX, por lo que no se requiere recargar la página.

## Dependencias externas

- [Bootstrap 5](https://getbootstrap.com/) para estilos y componentes.
- [Chart.js](https://www.chartjs.org/) para el gráfico de métricas.

## Notas

- Las contraseñas de cajeros y administradores se almacenan con `SHA2` (SHA-256).
- El formulario de rotación automática permite simular una asignación y confirmación de pago para descontar cupos de alias.
- Ajuste los límites de alias y turnos según las necesidades del negocio.
