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

switch ($method) {
    case 'GET':
        $filters = [
            'search' => trim($_GET['search'] ?? ''),
            'turno' => trim($_GET['turno'] ?? ''),
            'estado' => trim($_GET['estado'] ?? ''),
            'apodo' => trim($_GET['apodo'] ?? ''),
        ];

        $conditions = [];
        $params = [];
        $types = '';

        if ($filters['search'] !== '') {
            $conditions[] = '(nombre LIKE CONCAT("%", ?, "%") OR usuario LIKE CONCAT("%", ?, "%"))';
            $params[] = $filters['search'];
            $params[] = $filters['search'];
            $types .= 'ss';
        }
        if ($filters['turno'] !== '') {
            $conditions[] = 'turno = ?';
            $params[] = $filters['turno'];
            $types .= 's';
        }
        if ($filters['estado'] !== '') {
            $conditions[] = 'estado = ?';
            $params[] = (int)$filters['estado'];
            $types .= 'i';
        }
        if ($filters['apodo'] !== '') {
            $conditions[] = 'apodo LIKE CONCAT("%", ?, "%")';
            $params[] = $filters['apodo'];
            $types .= 's';
        }

        $sql = 'SELECT id, nombre, usuario, email, turno, apodo, estado, fecha_creacion FROM cajeros';
        if ($conditions) {
            $sql .= ' WHERE ' . implode(' AND ', $conditions);
        }
        $sql .= ' ORDER BY fecha_creacion DESC';

        $stmt = $mysqli->prepare($sql);
        if ($params) {
            $stmt->bind_param($types, ...$params);
        }
        $stmt->execute();
        $data = $stmt->get_result()->fetch_all(MYSQLI_ASSOC);
        echo json_encode(['success' => true, 'data' => $data]);
        break;

    case 'POST':
        $payload = json_decode(file_get_contents('php://input'), true);
        $action = $payload['action'] ?? 'create';

        if ($action === 'create') {
            $stmt = $mysqli->prepare('INSERT INTO cajeros (nombre, usuario, contrasena, email, turno, apodo, estado) VALUES (?, ?, ?, ?, ?, ?, ?)');
            $hashedPassword = hash('sha256', $payload['contrasena'] ?? '');
            $estado = isset($payload['estado']) ? (int)$payload['estado'] : 1;
            $stmt->bind_param(
                'ssssssi',
                $payload['nombre'],
                $payload['usuario'],
                $hashedPassword,
                $payload['email'],
                $payload['turno'],
                $payload['apodo'],
                $estado
            );
            $success = $stmt->execute();
            echo json_encode(['success' => $success, 'id' => $stmt->insert_id, 'message' => $success ? 'Cajero creado.' : $stmt->error]);
            break;
        }

        if ($action === 'update') {
            $fields = ['nombre', 'email', 'turno', 'apodo', 'estado'];
            $updates = [];
            $params = [];
            $types = '';
            foreach ($fields as $field) {
                if (isset($payload[$field])) {
                    $updates[] = "$field = ?";
                    if ($field === 'estado') {
                        $params[] = (int)$payload[$field];
                        $types .= 'i';
                    } else {
                        $params[] = $payload[$field];
                        $types .= 's';
                    }
                }
            }
            if (!empty($payload['contrasena'])) {
                $updates[] = 'contrasena = ?';
                $params[] = hash('sha256', $payload['contrasena']);
                $types .= 's';
            }
            if (!$updates) {
                echo json_encode(['success' => false, 'message' => 'No hay datos para actualizar.']);
                break;
            }
            $params[] = (int)$payload['id'];
            $types .= 'i';
            $sql = 'UPDATE cajeros SET ' . implode(', ', $updates) . ' WHERE id = ?';
            $stmt = $mysqli->prepare($sql);
            $stmt->bind_param($types, ...$params);
            $success = $stmt->execute();
            echo json_encode(['success' => $success, 'message' => $success ? 'Cajero actualizado.' : $stmt->error]);
            break;
        }

        if ($action === 'delete') {
            $stmt = $mysqli->prepare('DELETE FROM cajeros WHERE id = ?');
            $id = (int)$payload['id'];
            $stmt->bind_param('i', $id);
            $success = $stmt->execute();
            echo json_encode(['success' => $success, 'message' => $success ? 'Cajero eliminado.' : $stmt->error]);
            break;
        }

        if ($action === 'toggle') {
            $stmt = $mysqli->prepare('UPDATE cajeros SET estado = NOT estado WHERE id = ?');
            $id = (int)$payload['id'];
            $stmt->bind_param('i', $id);
            $success = $stmt->execute();
            echo json_encode(['success' => $success]);
            break;
        }

        echo json_encode(['success' => false, 'message' => 'Acción no soportada.']);
        break;

    default:
        http_response_code(405);
        echo json_encode(['success' => false, 'message' => 'Método no permitido']);
}
