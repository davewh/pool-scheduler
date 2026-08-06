<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

$configPath = __DIR__ . '/config.php';
if (!is_file($configPath)) {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => 'Missing config.php. Copy config.sample.php to config.php and add your MySQL details.',
    ]);
    exit;
}

$config = require $configPath;
if (!is_array($config) || !isset($config['db'])) {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => 'Invalid config.php. Expected a db configuration array.',
    ]);
    exit;
}

function respond(array $payload, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    exit;
}

function requestSessionId(): string
{
    $sessionId = isset($_GET['id']) ? trim((string) $_GET['id']) : '';
    if ($sessionId === '' || !preg_match('/^[A-Za-z0-9_-]{4,40}$/', $sessionId)) {
        respond([
            'ok' => false,
            'error' => 'Invalid session ID.',
        ], 400);
    }

    return $sessionId;
}

function db(array $dbConfig): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $required = ['host', 'name', 'user', 'pass'];
    foreach ($required as $key) {
        if (!array_key_exists($key, $dbConfig)) {
            respond([
                'ok' => false,
                'error' => "Missing database config value: {$key}.",
            ], 500);
        }
    }

    $charset = $dbConfig['charset'] ?? 'utf8mb4';
    $port = isset($dbConfig['port']) ? (int) $dbConfig['port'] : 3306;
    $dsn = "mysql:host={$dbConfig['host']};port={$port};dbname={$dbConfig['name']};charset={$charset}";

    try {
        $pdo = new PDO($dsn, (string) $dbConfig['user'], (string) $dbConfig['pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
    } catch (PDOException $e) {
        respond([
            'ok' => false,
            'error' => 'Database connection failed: ' . $e->getMessage(),
        ], 500);
    }

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS pool_scheduler_sessions (
            session_id VARCHAR(40) NOT NULL PRIMARY KEY,
            state_json LONGTEXT NOT NULL,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );

    return $pdo;
}

function readJsonBody(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        respond([
            'ok' => false,
            'error' => 'Missing request body.',
        ], 400);
    }

    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        respond([
            'ok' => false,
            'error' => 'Request body must be valid JSON.',
        ], 400);
    }

    return $decoded;
}

$action = isset($_GET['action']) ? (string) $_GET['action'] : '';
$sessionId = requestSessionId();
$pdo = db($config['db']);

if ($action === 'get') {
    $stmt = $pdo->prepare('SELECT state_json, updated_at FROM pool_scheduler_sessions WHERE session_id = :session_id');
    $stmt->execute([
        ':session_id' => $sessionId,
    ]);
    $row = $stmt->fetch();

    if (!$row) {
        respond([
            'ok' => true,
            'state' => null,
            'updatedAt' => '',
        ]);
    }

    $state = json_decode((string) $row['state_json'], true);
    if (!is_array($state)) {
        respond([
            'ok' => false,
            'error' => 'Stored session state is invalid JSON.',
        ], 500);
    }

    respond([
        'ok' => true,
        'state' => $state,
        'updatedAt' => (string) $row['updated_at'],
    ]);
}

if ($action === 'save') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        respond([
            'ok' => false,
            'error' => 'Save requests must use POST.',
        ], 405);
    }

    $body = readJsonBody();
    $state = $body['state'] ?? null;
    if (!is_array($state)) {
        respond([
            'ok' => false,
            'error' => 'Save payload must include a state object.',
        ], 400);
    }

    $stateJson = json_encode($state, JSON_UNESCAPED_SLASHES);
    if ($stateJson === false) {
        respond([
            'ok' => false,
            'error' => 'Failed to encode state JSON.',
        ], 500);
    }

    $stmt = $pdo->prepare(
        'INSERT INTO pool_scheduler_sessions (session_id, state_json)
         VALUES (:session_id, :state_json)
         ON DUPLICATE KEY UPDATE state_json = VALUES(state_json), updated_at = CURRENT_TIMESTAMP'
    );
    $stmt->execute([
        ':session_id' => $sessionId,
        ':state_json' => $stateJson,
    ]);

    $updatedStmt = $pdo->prepare('SELECT updated_at FROM pool_scheduler_sessions WHERE session_id = :session_id');
    $updatedStmt->execute([
        ':session_id' => $sessionId,
    ]);
    $updatedAt = (string) $updatedStmt->fetchColumn();

    respond([
        'ok' => true,
        'updatedAt' => $updatedAt,
    ]);
}

respond([
    'ok' => false,
    'error' => 'Unknown action.',
], 400);
