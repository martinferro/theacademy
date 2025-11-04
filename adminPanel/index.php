<?php
session_start();
if (!isset($_SESSION['admin_id'])) {
    header('Location: views/login.php');
    exit;
}

$page = $_GET['page'] ?? 'dashboard';
$allowedPages = ['dashboard', 'cajeros', 'alias', 'platforms', 'clientes'];
if (!in_array($page, $allowedPages, true)) {
    $page = 'dashboard';
}
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Panel de Administración</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="assets/css/custom.css">
</head>
<body>
    <nav class="navbar navbar-expand-lg navbar-dark bg-primary">
        <div class="container-fluid">
            <a class="navbar-brand" href="index.php">Banco - Admin</a>
            <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav" aria-controls="navbarNav" aria-expanded="false" aria-label="Toggle navigation">
                <span class="navbar-toggler-icon"></span>
            </button>
            <div class="collapse navbar-collapse" id="navbarNav">
                <ul class="navbar-nav me-auto mb-2 mb-lg-0">
                    <li class="nav-item"><a class="nav-link <?php echo $page === 'dashboard' ? 'active' : ''; ?>" href="?page=dashboard">Dashboard</a></li>
                    <li class="nav-item"><a class="nav-link <?php echo $page === 'cajeros' ? 'active' : ''; ?>" href="?page=cajeros">Cajeros</a></li>
                    <li class="nav-item"><a class="nav-link <?php echo $page === 'alias' ? 'active' : ''; ?>" href="?page=alias">Alias Bancarios</a></li>
                    <li class="nav-item"><a class="nav-link <?php echo $page === 'platforms' ? 'active' : ''; ?>" href="?page=platforms">Links a plataformas</a></li>
                    <li class="nav-item">
                        <a class="nav-link <?php echo $page === 'clientes' ? 'active' : ''; ?>" href="?page=clientes">
                            Clientes <span class="badge text-bg-info ms-1">Nuevo</span>
                        </a>
                    </li>
                </ul>
                <div class="d-flex align-items-center text-white">
                    <span class="me-3">Hola, <?php echo htmlspecialchars($_SESSION['admin_name']); ?></span>
                    <button id="logoutBtn" class="btn btn-sm btn-outline-light">Salir</button>
                </div>
            </div>
        </div>
    </nav>

    <main class="container-fluid py-4">
        <?php
            switch ($page) {
                case 'cajeros':
                    include __DIR__ . '/views/cajeros.php';
                    break;
                case 'alias':
                    include __DIR__ . '/views/alias.php';
                    break;
                case 'platforms':
                    include __DIR__ . '/views/platforms.php';
                    break;
                case 'clientes':
                    include __DIR__ . '/views/clientes.php';
                    break;
                default:
                    include __DIR__ . '/dashboard.php';
                    break;
            }
        ?>
    </main>

    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <script src="assets/js/main.js"></script>
    <?php if ($page === 'dashboard'): ?>
    <script src="assets/js/dashboard.js"></script>
    <?php elseif ($page === 'cajeros'): ?>
    <script src="assets/js/cajeros.js"></script>
    <?php elseif ($page === 'alias'): ?>
    <script src="assets/js/alias.js"></script>
    <?php elseif ($page === 'platforms'): ?>
    <script src="assets/js/platforms.js"></script>
    <?php elseif ($page === 'clientes'): ?>
    <script src="assets/js/clientes.js"></script>
    <?php endif; ?>
</body>
</html>
