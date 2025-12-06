<?php
session_start();
header('Content-Type: application/json');

if (!isset($_SESSION['admin_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'No autorizado']);
    exit;
}

require_once __DIR__ . '/db.php';

function respond(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

function tableExists(mysqli $mysqli, string $table): bool
{
    $stmt = $mysqli->prepare('SHOW TABLES LIKE ?');
    $stmt->bind_param('s', $table);
    $stmt->execute();
    $result = $stmt->get_result();
    return $result && $result->num_rows > 0;
}

function deleteTableData(mysqli $mysqli, string $sql, string $types = '', array $params = []): int
{
    $stmt = $mysqli->prepare($sql);
    if ($types !== '') {
        $stmt->bind_param($types, ...$params);
    }
    $stmt->execute();
    return $stmt->affected_rows;
}

function clearChatMessages(mysqli $mysqli): array
{
    $deletedMessages = 0;
    $resetThreads = 0;

    if (tableExists($mysqli, 'chat_mensajes')) {
        $deletedMessages = deleteTableData($mysqli, 'DELETE FROM chat_mensajes');
    }

    if (tableExists($mysqli, 'chat_threads')) {
        $resetThreads = deleteTableData($mysqli, 'UPDATE chat_threads SET ultimo_mensaje = NULL, fecha_ultima = NOW()');
    }

    return [
        'messagesDeleted' => $deletedMessages,
        'threadsReset' => $resetThreads,
    ];
}

function clearIncomingMessages(mysqli $mysqli): array
{
    if (!tableExists($mysqli, 'chat_mensajes')) {
        return ['deleted' => 0];
    }

    $deleted = deleteTableData($mysqli, "DELETE FROM chat_mensajes WHERE autor = 'cliente'");
    return ['deleted' => $deleted];
}

function deleteCajeros(mysqli $mysqli): array
{
    $deletedPayments = 0;
    $deletedTokens = 0;
    $deletedCajeros = 0;

    $mysqli->begin_transaction();
    try {
        if (tableExists($mysqli, 'pagos')) {
            $deletedPayments = deleteTableData($mysqli, 'DELETE FROM pagos');
        }
        if (tableExists($mysqli, 'cajero_tokens')) {
            $deletedTokens = deleteTableData($mysqli, 'DELETE FROM cajero_tokens');
        }
        if (tableExists($mysqli, 'cajeros')) {
            $deletedCajeros = deleteTableData($mysqli, 'DELETE FROM cajeros');
        }
        $mysqli->commit();
    } catch (Throwable $e) {
        $mysqli->rollback();
        throw $e;
    }

    return [
        'paymentsDeleted' => $deletedPayments,
        'tokensDeleted' => $deletedTokens,
        'cajerosDeleted' => $deletedCajeros,
    ];
}

function deleteClientes(mysqli $mysqli): array
{
    $deletedInteractions = 0;
    $deletedMessages = 0;
    $deletedThreads = 0;
    $deletedClients = 0;

    $mysqli->begin_transaction();
    try {
        if (tableExists($mysqli, 'cliente_interacciones')) {
            $deletedInteractions = deleteTableData($mysqli, 'DELETE FROM cliente_interacciones');
        }
        if (tableExists($mysqli, 'chat_mensajes')) {
            $deletedMessages = deleteTableData($mysqli, 'DELETE FROM chat_mensajes');
        }
        if (tableExists($mysqli, 'chat_threads')) {
            $deletedThreads = deleteTableData($mysqli, 'DELETE FROM chat_threads');
        }
        if (tableExists($mysqli, 'clientes')) {
            $deletedClients = deleteTableData($mysqli, 'DELETE FROM clientes');
        }
        $mysqli->commit();
    } catch (Throwable $e) {
        $mysqli->rollback();
        throw $e;
    }

    return [
        'interactionsDeleted' => $deletedInteractions,
        'messagesDeleted' => $deletedMessages,
        'threadsDeleted' => $deletedThreads,
        'clientsDeleted' => $deletedClients,
    ];
}

function whatsappStorePath(): string
{
    return __DIR__ . '/../../data/whatsapp-central.json';
}

function loadWhatsappStore(): array
{
    $path = whatsappStorePath();
    if (!file_exists($path)) {
        return ['lines' => []];
    }

    $content = file_get_contents($path);
    $data = json_decode($content, true);
    if (!is_array($data) || !isset($data['lines']) || !is_array($data['lines'])) {
        return ['lines' => []];
    }

    return $data;
}

function saveWhatsappStore(array $store): void
{
    $path = whatsappStorePath();
    $dir = dirname($path);
    if (!is_dir($dir)) {
        mkdir($dir, 0775, true);
    }
    file_put_contents($path, json_encode($store, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

function listWhatsappLines(): array
{
    $store = loadWhatsappStore();
    $lines = [];
    foreach ($store['lines'] as $id => $line) {
        if (!$id) {
            continue;
        }
        $lines[] = [
            'id' => $id,
            'nombre' => isset($line['nombre']) && $line['nombre'] !== '' ? $line['nombre'] : $id,
        ];
    }

    usort($lines, function ($a, $b) {
        return strcasecmp($a['nombre'], $b['nombre']);
    });

    return $lines;
}

function purgeWhatsappLines(string $mode, array $lines): array
{
    $store = loadWhatsappStore();
    $before = count($store['lines']);

    if ($mode === 'all') {
        $store['lines'] = [];
    } else {
        foreach ($lines as $lineId) {
            $normalized = is_string($lineId) ? trim($lineId) : '';
            if ($normalized === '') {
                continue;
            }
            unset($store['lines'][$normalized]);
        }
    }

    saveWhatsappStore($store);

    return [
        'removed' => max(0, $before - count($store['lines'])),
        'remaining' => count($store['lines']),
    ];
}

function clearWhatsappMessages(): array
{
    $store = loadWhatsappStore();
    $cleared = 0;

    foreach ($store['lines'] as &$line) {
        if (isset($line['mensajes']) && is_array($line['mensajes']) && count($line['mensajes']) > 0) {
            $cleared += count($line['mensajes']);
        }
        $line['mensajes'] = [];
    }
    unset($line);

    saveWhatsappStore($store);

    return ['messagesCleared' => $cleared, 'linesAffected' => count($store['lines'])];
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $action = $_GET['action'] ?? '';
    if ($action === 'list_lines') {
        $lines = listWhatsappLines();
        respond(200, ['success' => true, 'lines' => $lines]);
    }

    respond(400, ['success' => false, 'message' => 'Acción no soportada']);
}

if ($method !== 'POST') {
    respond(405, ['success' => false, 'message' => 'Método no permitido']);
}

$payload = json_decode(file_get_contents('php://input'), true);
$action = is_array($payload) ? ($payload['action'] ?? '') : '';

try {
    switch ($action) {
        case 'clear_messages':
            $result = clearChatMessages($mysqli);
            respond(200, ['success' => true, 'message' => 'Historial de mensajes borrado.', 'result' => $result]);
            break;
        case 'purge_whatsapp_lines':
            $mode = isset($payload['mode']) && $payload['mode'] === 'selected' ? 'selected' : 'all';
            $lines = isset($payload['lines']) && is_array($payload['lines']) ? $payload['lines'] : [];
            $result = purgeWhatsappLines($mode, $lines);
            respond(200, ['success' => true, 'message' => 'Líneas de WhatsApp depuradas.', 'result' => $result]);
            break;
        case 'delete_cajeros':
            $result = deleteCajeros($mysqli);
            respond(200, ['success' => true, 'message' => 'Cajeros eliminados.', 'result' => $result]);
            break;
        case 'delete_incoming_messages':
            $chatResult = clearIncomingMessages($mysqli);
            $whatsappResult = clearWhatsappMessages();
            respond(200, [
                'success' => true,
                'message' => 'Mensajes entrantes eliminados.',
                'result' => [
                    'chat' => $chatResult,
                    'whatsapp' => $whatsappResult,
                ],
            ]);
            break;
        case 'delete_clients':
            $result = deleteClientes($mysqli);
            respond(200, ['success' => true, 'message' => 'Clientes eliminados.', 'result' => $result]);
            break;
        default:
            respond(400, ['success' => false, 'message' => 'Acción no soportada']);
    }
} catch (Throwable $e) {
    respond(500, ['success' => false, 'message' => $e->getMessage()]);
}
