<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

function respond(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

$linea = isset($_GET['linea']) ? trim((string) $_GET['linea']) : '';
if ($linea === '') {
    respond(400, ['ok' => false, 'error' => 'missing_line']);
}

$limitParam = $_GET['limit'] ?? $_GET['limite'] ?? null;
$limit = is_numeric($limitParam) ? max(1, min(250, (int) $limitParam)) : 120;

$storePath = realpath(__DIR__ . '/../../data/whatsapp-central.json');
if ($storePath === false) {
    $storePath = __DIR__ . '/../../data/whatsapp-central.json';
}

if (!file_exists($storePath)) {
    respond(404, ['ok' => false, 'error' => 'store_not_found']);
}

try {
    $raw = file_get_contents($storePath);
    if ($raw === false) {
        throw new RuntimeException('read_failed');
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        throw new RuntimeException('json_invalid');
    }
} catch (Throwable $exception) {
    respond(500, ['ok' => false, 'error' => 'store_unavailable']);
}

$lines = isset($data['lines']) && is_array($data['lines']) ? $data['lines'] : [];
if (!isset($lines[$linea])) {
    respond(404, ['ok' => false, 'error' => 'line_not_found']);
}

$messages = isset($lines[$linea]['mensajes']) && is_array($lines[$linea]['mensajes'])
    ? array_values($lines[$linea]['mensajes'])
    : [];

if ($limit && count($messages) > $limit) {
    $messages = array_slice($messages, -$limit);
}

respond(200, [
    'ok' => true,
    'linea' => $linea,
    'mensajes' => $messages,
]);
