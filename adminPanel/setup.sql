-- Database setup for admin panel
CREATE DATABASE IF NOT EXISTS bank_ops CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE bank_ops;

-- Admin users table
CREATE TABLE IF NOT EXISTS admin_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    email VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO admin_users (username, password_hash, nombre, email)
VALUES ('admin', SHA2('admin123', 256), 'Administrador', 'admin@example.com')
ON DUPLICATE KEY UPDATE email = VALUES(email);

-- Cajeros table
CREATE TABLE IF NOT EXISTS cajeros (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    usuario VARCHAR(50) NOT NULL UNIQUE,
    contrasena VARCHAR(255) NOT NULL,
    email VARCHAR(100),
    turno VARCHAR(50) DEFAULT 'manana',
    apodo VARCHAR(50),
    estado TINYINT(1) DEFAULT 1,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Alias table
CREATE TABLE IF NOT EXISTS alias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    alias VARCHAR(100) NOT NULL UNIQUE,
    monto_maximo DECIMAL(12,2) NOT NULL DEFAULT 0,
    monto_usado DECIMAL(12,2) NOT NULL DEFAULT 0,
    activo TINYINT(1) DEFAULT 1,
    fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Pagos table
CREATE TABLE IF NOT EXISTS pagos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cajero_id INT NOT NULL,
    fecha DATE NOT NULL,
    monto DECIMAL(12,2) NOT NULL,
    estado ENUM('pendiente', 'confirmado') DEFAULT 'pendiente',
    alias_id INT NULL,
    CONSTRAINT fk_pagos_cajero FOREIGN KEY (cajero_id) REFERENCES cajeros(id) ON DELETE CASCADE,
    CONSTRAINT fk_pagos_alias FOREIGN KEY (alias_id) REFERENCES alias(id) ON DELETE SET NULL
);

-- Sample data
INSERT INTO cajeros (nombre, usuario, contrasena, email, turno, apodo)
VALUES
('Juan Perez', 'jperez', SHA2('secret', 256), 'juan@example.com', 'manana', 'El Rápido'),
('Maria Gomez', 'mgomez', SHA2('secret', 256), 'maria@example.com', 'tarde', 'La Precisa')
ON DUPLICATE KEY UPDATE email = VALUES(email);

INSERT INTO alias (alias, monto_maximo, monto_usado, activo)
VALUES
('ALIAS123', 10000, 2000, 1),
('ALIAS456', 8000, 1000, 1),
('ALIAS789', 12000, 0, 1)
ON DUPLICATE KEY UPDATE monto_maximo = VALUES(monto_maximo);

INSERT INTO pagos (cajero_id, fecha, monto, estado)
SELECT c.id, CURDATE() - INTERVAL (ROW_NUMBER() OVER (ORDER BY c.id)) DAY, 1500 + (c.id * 250), 'confirmado'
FROM cajeros c
LIMIT 5;
