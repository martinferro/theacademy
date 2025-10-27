<?php
session_start();
header('Content-Type: application/json');

if (!isset($_SESSION['admin_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'No autorizado']);
    exit;
}

require_once __DIR__ . '/db.php';

$filters = [
    'from' => $_GET['from'] ?? null,
    'to' => $_GET['to'] ?? null,
    'cajero_id' => isset($_GET['cajero_id']) ? (int)$_GET['cajero_id'] : null,
    'turno' => $_GET['turno'] ?? null,
];

$conditions = [];
$params = [];
$types = '';

if (!empty($filters['from'])) {
    $conditions[] = 'p.fecha >= ?';
    $params[] = $filters['from'];
    $types .= 's';
}
if (!empty($filters['to'])) {
    $conditions[] = 'p.fecha <= ?';
    $params[] = $filters['to'];
    $types .= 's';
}
if (!empty($filters['cajero_id'])) {
    $conditions[] = 'p.cajero_id = ?';
    $params[] = $filters['cajero_id'];
    $types .= 'i';
}
if (!empty($filters['turno'])) {
    $conditions[] = 'c.turno = ?';
    $params[] = $filters['turno'];
    $types .= 's';
}

$baseWhere = '';
if ($conditions) {
    $baseWhere = 'WHERE ' . implode(' AND ', $conditions);
}

$kpiWhere = $baseWhere === '' ? 'WHERE p.estado = ?' : $baseWhere . ' AND p.estado = ?';
$chartWhere = $baseWhere;

$sqlKpi1 = 'SELECT COUNT(*) AS total_confirmados FROM pagos p JOIN cajeros c ON c.id = p.cajero_id ' . $kpiWhere;
$sqlKpi2 = 'SELECT AVG(p.monto) AS promedio_ticket FROM pagos p JOIN cajeros c ON c.id = p.cajero_id ' . $kpiWhere;
$sqlChart = 'SELECT p.fecha AS fecha, SUM(p.monto) AS total_monto
    FROM pagos p
    JOIN cajeros c ON c.id = p.cajero_id ' . $chartWhere . '
    GROUP BY p.fecha
    ORDER BY p.fecha ASC';

function executeQuery(mysqli $mysqli, string $sql, string $types, array $params)
{
    $stmt = $mysqli->prepare($sql);
    if ($types !== '') {
        $stmt->bind_param($types, ...$params);
    }
    $stmt->execute();
    return $stmt->get_result();
}

try {
    $paramsWithStatus = $params;
    $typesWithStatus = $types;
    $paramsWithStatus[] = 'confirmado';
    $typesWithStatus .= 's';

    $kpi1Result = executeQuery($mysqli, $sqlKpi1, $typesWithStatus, $paramsWithStatus);
    $kpi2Result = executeQuery($mysqli, $sqlKpi2, $typesWithStatus, $paramsWithStatus);
    $chartResult = executeQuery($mysqli, $sqlChart, $types, $params);

    $kpi1 = $kpi1Result->fetch_assoc()['total_confirmados'] ?? 0;
    $kpi2 = $kpi2Result->fetch_assoc()['promedio_ticket'] ?? 0;

    $chartData = [];
    while ($row = $chartResult->fetch_assoc()) {
        $chartData[] = [
            'fecha' => $row['fecha'],
            'total_monto' => (float)$row['total_monto'],
        ];
    }

    echo json_encode([
        'success' => true,
        'kpi1' => (int)$kpi1,
        'kpi2' => $kpi2 !== null ? round((float)$kpi2, 2) : 0,
        'chart' => $chartData,
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => $e->getMessage()]);
}
