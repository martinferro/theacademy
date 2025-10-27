<?php
// Database connection helper using mysqli

declare(strict_types=1);

$DB_CONFIG = [
    'host' => getenv('DB_HOST') ?: 'localhost',
    'user' => getenv('DB_USER') ?: 'root',
    'pass' => getenv('DB_PASSWORD') ?: '',
    'name' => getenv('DB_NAME') ?: 'bank_ops',
    'port' => (int)(getenv('DB_PORT') ?: 3306),
];

$mysqli = new mysqli($DB_CONFIG['host'], $DB_CONFIG['user'], $DB_CONFIG['pass'], $DB_CONFIG['name'], $DB_CONFIG['port']);

if ($mysqli->connect_errno) {
    http_response_code(500);
    die(json_encode([
        'success' => false,
        'message' => 'Error de conexión a la base de datos: ' . $mysqli->connect_error,
    ]));
}

$mysqli->set_charset('utf8mb4');
