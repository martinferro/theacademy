<?php
session_start();
header('Content-Type: application/json');

if (!isset($_SESSION['admin_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'No autorizado']);
    exit;
}

$defaultLinks = [
    ['id' => 1, 'nombre' => 'Ganemos', 'url' => 'https://ganemos.example.com', 'activo' => true, 'orden' => 1],
    ['id' => 2, 'nombre' => 'Fichas Plus', 'url' => 'https://fichasplus.example.com', 'activo' => true, 'orden' => 2],
    ['id' => 3, 'nombre' => 'Recompensas 24/7', 'url' => 'https://recompensas.example.com', 'activo' => true, 'orden' => 3],
    ['id' => 4, 'nombre' => 'Club Élite', 'url' => 'https://clubelite.example.com', 'activo' => true, 'orden' => 4],
    ['id' => 5, 'nombre' => 'Banca Digital', 'url' => 'https://bancadigital.example.com', 'activo' => false, 'orden' => 5],
];

$storageDir = realpath(__DIR__ . '/../../data');
if ($storageDir === false) {
    $storageDir = __DIR__ . '/../../data';
}

if (!is_dir($storageDir)) {
    mkdir($storageDir, 0775, true);
}

$storagePath = $storageDir . '/platform-links.json';

if (!file_exists($storagePath)) {
    file_put_contents(
        $storagePath,
        json_encode($defaultLinks, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        LOCK_EX
    );
}

function loadLinks(string $path): array
{
    $content = file_get_contents($path);
    if ($content === false) {
        return [];
    }
    $data = json_decode($content, true);
    if (!is_array($data)) {
        return [];
    }
    return $data;
}

function saveLinks(string $path, array $links): bool
{
    $json = json_encode($links, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    return (bool)file_put_contents($path, $json, LOCK_EX);
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    $links = loadLinks($storagePath);
    usort($links, static function ($a, $b) {
        $orderA = $a['orden'] ?? 0;
        $orderB = $b['orden'] ?? 0;
        if ($orderA === $orderB) {
            return strcmp($a['nombre'] ?? '', $b['nombre'] ?? '');
        }
        return $orderA <=> $orderB;
    });

    echo json_encode(['success' => true, 'data' => $links]);
    exit;
}

if ($method !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Método no permitido']);
    exit;
}

$payload = json_decode(file_get_contents('php://input'), true);
if (!is_array($payload)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Datos inválidos']);
    exit;
}

$action = $payload['action'] ?? 'create';
$links = loadLinks($storagePath);

switch ($action) {
    case 'create':
        $nombre = trim((string)($payload['nombre'] ?? ''));
        $url = trim((string)($payload['url'] ?? ''));
        $activo = isset($payload['activo']) ? (bool)$payload['activo'] : true;

        if ($nombre === '' || $url === '') {
            echo json_encode(['success' => false, 'message' => 'Nombre y URL son obligatorios.']);
            break;
        }

        if (!filter_var($url, FILTER_VALIDATE_URL)) {
            echo json_encode(['success' => false, 'message' => 'La URL no es válida.']);
            break;
        }

        $maxId = array_reduce($links, static function ($carry, $item) {
            return max($carry, (int)($item['id'] ?? 0));
        }, 0);
        $maxOrden = array_reduce($links, static function ($carry, $item) {
            return max($carry, (int)($item['orden'] ?? 0));
        }, 0);

        $nuevo = [
            'id' => $maxId + 1,
            'nombre' => $nombre,
            'url' => $url,
            'activo' => $activo,
            'orden' => $maxOrden + 1,
        ];

        $links[] = $nuevo;
        saveLinks($storagePath, $links);
        echo json_encode(['success' => true, 'data' => $nuevo]);
        break;

    case 'update':
        $id = (int)($payload['id'] ?? 0);
        if ($id <= 0) {
            echo json_encode(['success' => false, 'message' => 'ID inválido.']);
            break;
        }
        $actualizado = false;
        $errorMessage = null;
        foreach ($links as &$link) {
            if ((int)($link['id'] ?? 0) === $id) {
                if (isset($payload['nombre'])) {
                    $nombre = trim((string)$payload['nombre']);
                    if ($nombre !== '') {
                        $link['nombre'] = $nombre;
                    }
                }
                if (isset($payload['url'])) {
                    $url = trim((string)$payload['url']);
                    if ($url !== '') {
                        if (!filter_var($url, FILTER_VALIDATE_URL)) {
                            $errorMessage = 'La URL no es válida.';
                            break;
                        }
                        $link['url'] = $url;
                    }
                }
                if (isset($payload['activo'])) {
                    $link['activo'] = (bool)$payload['activo'];
                }
                if (isset($payload['orden'])) {
                    $link['orden'] = (int)$payload['orden'];
                }
                $actualizado = true;
                break;
            }
        }
        unset($link);

        if ($errorMessage !== null) {
            echo json_encode(['success' => false, 'message' => $errorMessage]);
            break;
        }

        if (!$actualizado) {
            echo json_encode(['success' => false, 'message' => 'Enlace no encontrado.']);
            break;
        }

        saveLinks($storagePath, $links);
        echo json_encode(['success' => true]);
        break;

    case 'delete':
        $id = (int)($payload['id'] ?? 0);
        if ($id <= 0) {
            echo json_encode(['success' => false, 'message' => 'ID inválido.']);
            break;
        }
        $nuevoListado = array_values(array_filter($links, static function ($link) use ($id) {
            return (int)($link['id'] ?? 0) !== $id;
        }));
        saveLinks($storagePath, $nuevoListado);
        echo json_encode(['success' => true]);
        break;

    case 'toggle':
        $id = (int)($payload['id'] ?? 0);
        if ($id <= 0) {
            echo json_encode(['success' => false, 'message' => 'ID inválido.']);
            break;
        }
        $encontrado = false;
        foreach ($links as &$link) {
            if ((int)($link['id'] ?? 0) === $id) {
                $link['activo'] = !(bool)($link['activo'] ?? false);
                $encontrado = true;
                break;
            }
        }
        unset($link);
        if (!$encontrado) {
            echo json_encode(['success' => false, 'message' => 'Enlace no encontrado.']);
            break;
        }
        saveLinks($storagePath, $links);
        echo json_encode(['success' => true]);
        break;

    default:
        echo json_encode(['success' => false, 'message' => 'Acción no soportada.']);
}
