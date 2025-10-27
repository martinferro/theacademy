<?php
session_start();
header('Content-Type: application/json');

if (!isset($_SESSION['admin_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'No autorizado']);
    exit;
}

require_once __DIR__ . '/db.php';

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $result = $mysqli->query('SELECT id, alias, monto_maximo, monto_usado, activo, fecha_creacion FROM alias ORDER BY fecha_creacion DESC');
    $data = [];
    while ($row = $result->fetch_assoc()) {
        $row['saldo_restante'] = max(0, (float)$row['monto_maximo'] - (float)$row['monto_usado']);
        $data[] = $row;
    }
    echo json_encode(['success' => true, 'data' => $data]);
    exit;
}

if ($method !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Método no permitido']);
    exit;
}

$payload = json_decode(file_get_contents('php://input'), true);
$action = $payload['action'] ?? 'create';

switch ($action) {
    case 'create':
        $stmt = $mysqli->prepare('INSERT INTO alias (alias, monto_maximo, monto_usado, activo) VALUES (?, ?, 0, ?)');
        $aliasName = $payload['alias'];
        $montoMax = (float)($payload['monto_maximo'] ?? 0);
        $activo = isset($payload['activo']) ? (int)$payload['activo'] : 1;
        $stmt->bind_param('sdi', $aliasName, $montoMax, $activo);
        $success = $stmt->execute();
        echo json_encode([
            'success' => $success,
            'id' => $stmt->insert_id,
            'message' => $success ? 'Alias creado.' : $stmt->error,
        ]);
        break;

    case 'update':
        $fields = [];
        $params = [];
        $types = '';
        if (isset($payload['alias'])) {
            $fields[] = 'alias = ?';
            $params[] = $payload['alias'];
            $types .= 's';
        }
        if (isset($payload['monto_maximo'])) {
            $fields[] = 'monto_maximo = ?';
            $params[] = (float)$payload['monto_maximo'];
            $types .= 'd';
        }
        if (isset($payload['monto_usado'])) {
            $fields[] = 'monto_usado = ?';
            $params[] = (float)$payload['monto_usado'];
            $types .= 'd';
        }
        if (isset($payload['activo'])) {
            $fields[] = 'activo = ?';
            $params[] = (int)$payload['activo'];
            $types .= 'i';
        }
        if (!$fields) {
            echo json_encode(['success' => false, 'message' => 'No hay datos para actualizar.']);
            break;
        }
        $params[] = (int)$payload['id'];
        $types .= 'i';
        $sql = 'UPDATE alias SET ' . implode(', ', $fields) . ' WHERE id = ?';
        $stmt = $mysqli->prepare($sql);
        $stmt->bind_param($types, ...$params);
        $success = $stmt->execute();
        echo json_encode(['success' => $success, 'message' => $success ? 'Alias actualizado.' : $stmt->error]);
        break;

    case 'delete':
        $stmt = $mysqli->prepare('DELETE FROM alias WHERE id = ?');
        $id = (int)$payload['id'];
        $stmt->bind_param('i', $id);
        $success = $stmt->execute();
        echo json_encode(['success' => $success, 'message' => $success ? 'Alias eliminado.' : $stmt->error]);
        break;

    case 'toggle':
        $stmt = $mysqli->prepare('UPDATE alias SET activo = NOT activo WHERE id = ?');
        $id = (int)$payload['id'];
        $stmt->bind_param('i', $id);
        $success = $stmt->execute();
        echo json_encode(['success' => $success]);
        break;

    case 'assign':
        $monto = (float)($payload['monto'] ?? 0);
        if ($monto <= 0) {
            echo json_encode(['success' => false, 'message' => 'Monto inválido.']);
            break;
        }
        $stmt = $mysqli->prepare('SELECT id, alias, monto_maximo, monto_usado FROM alias WHERE activo = 1 AND (monto_maximo - monto_usado) >= ? ORDER BY fecha_creacion ASC LIMIT 1');
        $stmt->bind_param('d', $monto);
        $stmt->execute();
        $result = $stmt->get_result();
        $alias = $result->fetch_assoc();
        if (!$alias) {
            echo json_encode(['success' => false, 'message' => 'No hay alias disponibles para el monto solicitado.']);
            break;
        }
        $alias['saldo_restante'] = (float)$alias['monto_maximo'] - (float)$alias['monto_usado'];
        echo json_encode(['success' => true, 'data' => $alias]);
        break;

    case 'register_payment':
        $aliasId = (int)($payload['alias_id'] ?? 0);
        $monto = (float)($payload['monto'] ?? 0);
        if ($aliasId <= 0 || $monto <= 0) {
            echo json_encode(['success' => false, 'message' => 'Datos incompletos.']);
            break;
        }
        $mysqli->begin_transaction();
        try {
            $stmt = $mysqli->prepare('SELECT monto_maximo, monto_usado FROM alias WHERE id = ? FOR UPDATE');
            $stmt->bind_param('i', $aliasId);
            $stmt->execute();
            $result = $stmt->get_result();
            $alias = $result->fetch_assoc();
            if (!$alias) {
                throw new RuntimeException('Alias no encontrado.');
            }
            $nuevoUsado = (float)$alias['monto_usado'] + $monto;
            $activo = $nuevoUsado >= (float)$alias['monto_maximo'] ? 0 : 1;
            $stmtUpdate = $mysqli->prepare('UPDATE alias SET monto_usado = ?, activo = ? WHERE id = ?');
            $stmtUpdate->bind_param('dii', $nuevoUsado, $activo, $aliasId);
            $stmtUpdate->execute();
            $mysqli->commit();
            echo json_encode(['success' => true, 'activo' => $activo, 'monto_usado' => $nuevoUsado]);
        } catch (Throwable $e) {
            $mysqli->rollback();
            echo json_encode(['success' => false, 'message' => $e->getMessage()]);
        }
        break;

    default:
        echo json_encode(['success' => false, 'message' => 'Acción no soportada.']);
}
