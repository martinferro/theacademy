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

function sanitize_category(?string $categoria): ?string {
    if ($categoria === null) {
        return null;
    }
    $categoria = strtoupper(trim($categoria));
    $valid = ['VIP', 'REGULAR', 'ESPORADICO'];
    return in_array($categoria, $valid, true) ? $categoria : null;
}

function compute_recommended_category(array $row): string {
    $total7 = (int)($row['contactos_7d'] ?? 0);
    $total30 = (int)($row['contactos_30d'] ?? 0);
    $total = (int)($row['total_contactos'] ?? 0);

    if ($total === 0) {
        return 'ESPORADICO';
    }
    if ($total7 >= 5) {
        return 'REGULAR';
    }
    if ($total30 >= 1) {
        return 'ESPORADICO';
    }
    return 'ESPORADICO';
}

switch ($method) {
    case 'GET':
        $search = trim($_GET['search'] ?? '');
        $categoria = sanitize_category($_GET['categoria'] ?? null);
        $alerta = $_GET['alerta'] ?? '';

        $conditions = [];
        $params = [];
        $types = '';

        if ($search !== '') {
            $conditions[] = '(c.nombre LIKE CONCAT("%", ?, "%") OR c.email LIKE CONCAT("%", ?, "%") OR c.telefono LIKE CONCAT("%", ?, "%"))';
            $params[] = $search;
            $params[] = $search;
            $params[] = $search;
            $types .= 'sss';
        }
        if ($categoria !== null && $categoria !== '') {
            $conditions[] = 'c.categoria = ?';
            $params[] = $categoria;
            $types .= 's';
        }
        if ($alerta !== '') {
            $conditions[] = 'c.alerta = ?';
            $params[] = (int)$alerta;
            $types .= 'i';
        }

        $sql = "SELECT c.id, c.nombre, c.email, c.telefono, c.categoria, c.usa_categoria_auto, c.alerta, c.creado_en, c.actualizado_en,
                        COALESCE(ci.total_contactos, 0) AS total_contactos,
                        ci.ultima_interaccion,
                        COALESCE(ci.contactos_7d, 0) AS contactos_7d,
                        COALESCE(ci.contactos_30d, 0) AS contactos_30d
                FROM clientes c
                LEFT JOIN (
                    SELECT cliente_id,
                           COUNT(*) AS total_contactos,
                           MAX(contacto_en) AS ultima_interaccion,
                           SUM(contacto_en >= DATE_SUB(NOW(), INTERVAL 7 DAY)) AS contactos_7d,
                           SUM(contacto_en >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS contactos_30d
                    FROM cliente_interacciones
                    GROUP BY cliente_id
                ) ci ON ci.cliente_id = c.id";

        if ($conditions) {
            $sql .= ' WHERE ' . implode(' AND ', $conditions);
        }
        $sql .= ' ORDER BY COALESCE(ci.ultima_interaccion, c.creado_en) DESC, c.nombre ASC';

        $stmt = $mysqli->prepare($sql);
        if ($params) {
            $stmt->bind_param($types, ...$params);
        }
        $stmt->execute();
        $result = $stmt->get_result();

        $updateStmt = $mysqli->prepare('UPDATE clientes SET categoria = ?, actualizado_en = NOW() WHERE id = ?');
        $clientes = [];

        while ($row = $result->fetch_assoc()) {
            $recommended = compute_recommended_category($row);
            if ((int)$row['usa_categoria_auto'] === 1 && $row['categoria'] !== $recommended) {
                $updateStmt->bind_param('si', $recommended, $row['id']);
                $updateStmt->execute();
                $row['categoria'] = $recommended;
            }
            $row['categoria_recomendada'] = $recommended;
            $clientes[] = $row;
        }

        echo json_encode(['success' => true, 'data' => $clientes]);
        break;

    case 'POST':
        $payload = json_decode(file_get_contents('php://input'), true) ?? [];
        $action = $payload['action'] ?? 'create';

        if ($action === 'create') {
            $nombre = trim($payload['nombre'] ?? '');
            $email = trim($payload['email'] ?? '');
            $telefono = trim($payload['telefono'] ?? '');
            $password = $payload['password'] ?? '';
            if ($nombre === '' || $password === '') {
                echo json_encode(['success' => false, 'message' => 'Nombre y contraseña son obligatorios.']);
                break;
            }
            $categoria = sanitize_category($payload['categoria'] ?? 'ESPORADICO') ?? 'ESPORADICO';
            $usaAuto = isset($payload['usa_categoria_auto']) ? (int)$payload['usa_categoria_auto'] : 1;
            $alerta = isset($payload['alerta']) ? (int)$payload['alerta'] : 0;
            if ($usaAuto === 1) {
                $categoria = 'ESPORADICO';
            }
            $stmt = $mysqli->prepare('INSERT INTO clientes (nombre, email, telefono, password_hash, categoria, usa_categoria_auto, alerta) VALUES (?, ?, ?, ?, ?, ?, ?)');
            $passwordHash = hash('sha256', $password);
            $emailParam = $email !== '' ? $email : null;
            $telefonoParam = $telefono !== '' ? $telefono : null;
            $stmt->bind_param('sssssii', $nombre, $emailParam, $telefonoParam, $passwordHash, $categoria, $usaAuto, $alerta);
            $success = $stmt->execute();
            echo json_encode(['success' => $success, 'id' => $stmt->insert_id, 'message' => $success ? 'Cliente creado.' : $stmt->error]);
            break;
        }

        if ($action === 'update') {
            $id = (int)($payload['id'] ?? 0);
            if ($id <= 0) {
                echo json_encode(['success' => false, 'message' => 'ID inválido.']);
                break;
            }
            $fields = ['nombre', 'email', 'telefono', 'categoria', 'usa_categoria_auto', 'alerta'];
            $updates = [];
            $params = [];
            $types = '';
            foreach ($fields as $field) {
                if (!array_key_exists($field, $payload)) {
                    continue;
                }
                $value = $payload[$field];
                if ($field === 'categoria') {
                    $value = sanitize_category((string)$value);
                    if ($value === null) {
                        continue;
                    }
                }
                if (in_array($field, ['usa_categoria_auto', 'alerta'], true)) {
                    $value = (int)$value;
                    $types .= 'i';
                } else {
                    $types .= 's';
                }
                $updates[] = "$field = ?";
                $params[] = $value;
            }
            if (!empty($payload['password'])) {
                $updates[] = 'password_hash = ?';
                $params[] = hash('sha256', $payload['password']);
                $types .= 's';
            }
            if (!$updates) {
                echo json_encode(['success' => false, 'message' => 'No hay datos para actualizar.']);
                break;
            }
            $updates[] = 'actualizado_en = NOW()';
            $sql = 'UPDATE clientes SET ' . implode(', ', $updates) . ' WHERE id = ?';
            $params[] = $id;
            $types .= 'i';
            $stmt = $mysqli->prepare($sql);
            $stmt->bind_param($types, ...$params);
            $success = $stmt->execute();
            echo json_encode(['success' => $success, 'message' => $success ? 'Cliente actualizado.' : $stmt->error]);
            break;
        }

        if ($action === 'delete') {
            $id = (int)($payload['id'] ?? 0);
            if ($id <= 0) {
                echo json_encode(['success' => false, 'message' => 'ID inválido.']);
                break;
            }
            $stmt = $mysqli->prepare('DELETE FROM clientes WHERE id = ?');
            $stmt->bind_param('i', $id);
            $success = $stmt->execute();
            echo json_encode(['success' => $success, 'message' => $success ? 'Cliente eliminado.' : $stmt->error]);
            break;
        }

        if ($action === 'register_contact') {
            $clienteId = (int)($payload['cliente_id'] ?? 0);
            if ($clienteId <= 0) {
                echo json_encode(['success' => false, 'message' => 'Cliente inválido.']);
                break;
            }
            $origen = trim($payload['origen'] ?? 'chat_web');
            if ($origen === '') {
                $origen = 'chat_web';
            }
            $stmt = $mysqli->prepare('INSERT INTO cliente_interacciones (cliente_id, origen) VALUES (?, ?)');
            $stmt->bind_param('is', $clienteId, $origen);
            $success = $stmt->execute();
            echo json_encode(['success' => $success, 'message' => $success ? 'Contacto registrado.' : $stmt->error]);
            break;
        }

        if ($action === 'toggle_alerta') {
            $clienteId = (int)($payload['cliente_id'] ?? 0);
            if ($clienteId <= 0) {
                echo json_encode(['success' => false, 'message' => 'Cliente inválido.']);
                break;
            }
            $stmt = $mysqli->prepare('UPDATE clientes SET alerta = NOT alerta, actualizado_en = NOW() WHERE id = ?');
            $stmt->bind_param('i', $clienteId);
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
