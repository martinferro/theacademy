<?php
session_start();
header('Content-Type: application/json');

require_once __DIR__ . '/db.php';

$input = json_decode(file_get_contents('php://input'), true);
$username = trim($input['username'] ?? '');
$password = $input['password'] ?? '';

if ($username === '' || $password === '') {
    echo json_encode(['success' => false, 'message' => 'Usuario y contraseña son obligatorios.']);
    exit;
}

$stmt = $mysqli->prepare('SELECT id, username, password_hash, nombre FROM admin_users WHERE username = ? LIMIT 1');
$stmt->bind_param('s', $username);
$stmt->execute();
$result = $stmt->get_result();

if ($row = $result->fetch_assoc()) {
    if (hash('sha256', $password) === $row['password_hash']) {
        $_SESSION['admin_id'] = $row['id'];
        $_SESSION['admin_name'] = $row['nombre'];
        echo json_encode(['success' => true, 'message' => 'Acceso concedido.']);
        exit;
    }
}

echo json_encode(['success' => false, 'message' => 'Credenciales inválidas.']);
