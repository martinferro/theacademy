<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

function respond(int $status, array $payload): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function store_path(): string
{
    $path = __DIR__ . '/../../data/whatsapp-central.json';
    if (!is_dir(dirname($path))) {
        mkdir(dirname($path), 0775, true);
    }
    return $path;
}

function load_store(): array
{
    $path = store_path();
    if (!file_exists($path)) {
        $initial = ['lines' => []];
        file_put_contents($path, json_encode($initial, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        return $initial;
    }

    $raw = file_get_contents($path);
    if ($raw === false) {
        respond(500, ['ok' => false, 'error' => 'store_unavailable']);
    }

    $data = json_decode($raw, true);
    if (!is_array($data)) {
        $data = ['lines' => []];
    }
    if (!isset($data['lines']) || !is_array($data['lines'])) {
        $data['lines'] = [];
    }

    return $data;
}

function save_store(array $store): void
{
    $path = store_path();
    file_put_contents($path, json_encode($store, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

function normalize_message(array $message): array
{
    $direction = isset($message['direction']) && $message['direction'] === 'outgoing' ? 'outgoing' : 'incoming';

    return [
        'id' => isset($message['id']) && $message['id'] !== '' ? (string) $message['id'] : uniqid('msg_', true),
        'body' => isset($message['body']) ? (string) $message['body'] : '',
        'direction' => $direction,
        'from' => $message['from'] ?? null,
        'to' => $message['to'] ?? null,
        'timestamp' => isset($message['timestamp']) ? (string) $message['timestamp'] : date(DATE_ATOM),
        'status' => $message['status'] ?? null,
    ];
}

function format_line(array $line): array
{
    $messages = isset($line['mensajes']) && is_array($line['mensajes']) ? array_values($line['mensajes']) : [];
    $last = null;
    if (!empty($messages)) {
        $last = normalize_message($messages[count($messages) - 1]);
    }

    return [
        'id' => isset($line['id']) ? (string) $line['id'] : null,
        'nombre' => isset($line['nombre']) && $line['nombre'] !== '' ? (string) $line['nombre'] : (isset($line['id']) ? (string) $line['id'] : ''),
        'estado' => isset($line['estado']) ? (string) $line['estado'] : 'disconnected',
        'ultimaConexion' => $line['ultimaConexion'] ?? null,
        'ultimoMensaje' => $last,
    ];
}

$linea = isset($_GET['linea']) ? trim((string) $_GET['linea']) : '';
$limitParam = $_GET['limit'] ?? $_GET['limite'] ?? null;
$limit = is_numeric($limitParam) ? max(1, min(250, (int) $limitParam)) : 120;

$store = load_store();

if ($linea === '') {
    $lines = array_map('format_line', array_values($store['lines']));
    respond(200, [
        'ok' => true,
        'lineas' => array_values(array_filter($lines, fn ($line) => !empty($line['id']))),
    ]);
}

if (!isset($store['lines'][$linea]) || !is_array($store['lines'][$linea])) {
    $store['lines'][$linea] = [
        'id' => $linea,
        'nombre' => $linea,
        'estado' => 'disconnected',
        'ultimaConexion' => null,
        'mensajes' => [],
    ];
    save_store($store);
}

$line = $store['lines'][$linea];
$messages = isset($line['mensajes']) && is_array($line['mensajes']) ? array_values($line['mensajes']) : [];

if ($limit && count($messages) > $limit) {
    $messages = array_slice($messages, -$limit);
}

$normalized = array_map('normalize_message', $messages);

respond(200, [
    'ok' => true,
    'linea' => $linea,
    'mensajes' => $normalized,
]);
