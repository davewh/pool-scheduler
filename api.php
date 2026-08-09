<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

$scriptName = str_replace('\\', '/', (string) ($_SERVER['SCRIPT_NAME'] ?? ''));
$isPoolTestDeployment = preg_match('#(?:^|/)pool_test(?:/|$)#i', $scriptName) === 1;
$host = strtolower((string) ($_SERVER['HTTP_HOST'] ?? $_SERVER['SERVER_NAME'] ?? ''));
$host = preg_replace('/:\d+$/', '', $host) ?? $host;
$isLocalhost = in_array($host, ['localhost', '127.0.0.1', '::1'], true);

$configPath = '';
$configCandidates = [
    __DIR__ . '/config.php',
    __DIR__ . '/public/config.php',
];
foreach ($configCandidates as $candidate) {
    if (is_file($candidate)) {
        $configPath = $candidate;
        break;
    }
}

if ($configPath === '') {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => 'Missing config.php. Copy config.sample.php and add your MySQL details.',
    ]);
    exit;
}

$config = require $configPath;
if (!is_array($config)) {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => 'Invalid config.php. Expected a config array.',
    ]);
    exit;
}

$environmentKey = $isLocalhost
    ? ($isPoolTestDeployment ? 'local_test' : 'local')
    : ($isPoolTestDeployment ? 'live_test' : 'live');
$selectedEnvironment = $config[$environmentKey] ?? null;
if (!is_array($selectedEnvironment) || !isset($selectedEnvironment['db']) || !is_array($selectedEnvironment['db'])) {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => 'Invalid config.php. Expected a db configuration for the selected environment.',
    ]);
    exit;
}
$dbConfig = $selectedEnvironment['db'];

function respond(array $payload, int $status = 200): never
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    exit;
}

function requestSessionId(): string
{
    $sessionId = '';
    if (isset($_GET['sid']) && trim((string) $_GET['sid']) !== '') {
        $sessionId = trim((string) $_GET['sid']);
    } elseif (isset($_GET['session']) && trim((string) $_GET['session']) !== '') {
        $sessionId = trim((string) $_GET['session']);
    } elseif (isset($_GET['id']) && trim((string) $_GET['id']) !== '') {
        $sessionId = trim((string) $_GET['id']);
    }

    if ($sessionId === '' || !preg_match('/^[A-Za-z0-9_-]{4,40}$/', $sessionId)) {
        respond([
            'ok' => false,
            'error' => 'Invalid session ID.',
        ], 400);
    }

    return $sessionId;
}

function isAdminLoggedIn(): bool
{
    return !empty($_SESSION['pool_admin']) && $_SESSION['pool_admin'] === true;
}

function generateTournamentId(): string
{
    return 't' . substr(strtoupper(bin2hex(random_bytes(6))), 0, 12);
}

function sanitizeTournamentName(?string $name, string $fallbackId): string
{
    $value = trim((string) ($name ?? ''));
    if ($value === '') {
        return 'tournament ' . $fallbackId;
    }
    $value = mb_substr($value, 0, 200, 'UTF-8');
    return $value;
}

function sanitizeAccessCode(?string $accessCode): string
{
    $value = trim((string) ($accessCode ?? ''));
    $value = strtoupper($value);
    if (!preg_match('/^[A-Z0-9]{5}$/', $value)) {
        return '';
    }
    return $value;
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

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS pool_scheduler_tournaments (
            tournament_id VARCHAR(40) NOT NULL PRIMARY KEY,
            tournament_name VARCHAR(200) NOT NULL,
            access_code VARCHAR(20) NOT NULL,
            is_hidden TINYINT(1) NOT NULL DEFAULT 0,
            is_deleted TINYINT(1) NOT NULL DEFAULT 0,
            state_json LONGTEXT NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );

    $columnStmt = $pdo->query("SHOW COLUMNS FROM pool_scheduler_tournaments LIKE 'access_code'");
    if ($columnStmt->fetch() === false) {
        $pdo->exec("ALTER TABLE pool_scheduler_tournaments ADD COLUMN access_code VARCHAR(20) NOT NULL DEFAULT ''");
    }

    $hiddenColumnStmt = $pdo->query("SHOW COLUMNS FROM pool_scheduler_tournaments LIKE 'is_hidden'");
    if ($hiddenColumnStmt->fetch() === false) {
        $pdo->exec("ALTER TABLE pool_scheduler_tournaments ADD COLUMN is_hidden TINYINT(1) NOT NULL DEFAULT 0");
    }

    $deletedColumnStmt = $pdo->query("SHOW COLUMNS FROM pool_scheduler_tournaments LIKE 'is_deleted'");
    if ($deletedColumnStmt->fetch() === false) {
        $pdo->exec("ALTER TABLE pool_scheduler_tournaments ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0");
    }

    return $pdo;
}

function rejectDeletedTournamentSession(PDO $pdo, string $sessionId): void
{
    $stmt = $pdo->prepare('SELECT is_deleted FROM pool_scheduler_tournaments WHERE tournament_id = :tournament_id');
    $stmt->execute([':tournament_id' => $sessionId]);
    $row = $stmt->fetch();
    if ($row && ((int) $row['is_deleted']) === 1) {
        respond([
            'ok' => false,
            'error' => 'Tournament not found.',
        ], 404);
    }
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
$pdo = db($dbConfig);

if ($action === 'auth-status') {
    respond([
        'ok' => true,
        'isLoggedIn' => isAdminLoggedIn(),
    ]);
}

if ($action === 'login') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        respond([
            'ok' => false,
            'error' => 'Login requests must use POST.',
        ], 405);
    }

    $body = readJsonBody();
    $username = trim((string) ($body['username'] ?? ''));
    $password = trim((string) ($body['password'] ?? ''));

    if ($username === 'admin' && $password === 'admin') {
        $_SESSION['pool_admin'] = true;
        respond([
            'ok' => true,
            'message' => 'Logged in.',
        ]);
    }

    respond([
        'ok' => false,
        'error' => 'Invalid admin credentials.',
    ], 401);
}

if ($action === 'logout') {
    unset($_SESSION['pool_admin']);
    respond([
        'ok' => true,
        'message' => 'Logged out.',
    ]);
}

if ($action === 'list-tournaments') {
    $includeAccessCode = isAdminLoggedIn();
    $query = 'SELECT tournament_id, tournament_name, access_code, is_hidden, created_at, updated_at FROM pool_scheduler_tournaments WHERE is_deleted = 0';
    if (!$includeAccessCode) {
        $query .= ' AND is_hidden = 0';
    }
    $query .= ' ORDER BY tournament_name ASC, created_at DESC';
    $stmt = $pdo->query($query);
    $rows = $stmt->fetchAll();

    respond([
        'ok' => true,
        'tournaments' => array_map(static function (array $row) use ($includeAccessCode): array {
            $item = [
                'id' => (string) $row['tournament_id'],
                'name' => (string) $row['tournament_name'],
                'createdAt' => (string) $row['created_at'],
                'updatedAt' => (string) $row['updated_at'],
            ];
            if ($includeAccessCode) {
                $item['accessCode'] = (string) $row['access_code'];
                $item['hidden'] = ((int) $row['is_hidden']) === 1;
            }
            return $item;
        }, $rows),
    ]);
}

if ($action === 'verify-tournament-access') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        respond([
            'ok' => false,
            'error' => 'Tournament access checks must use POST.',
        ], 405);
    }

    $body = readJsonBody();
    $tournamentId = trim((string) ($body['tournamentId'] ?? ''));
    $accessCode = sanitizeAccessCode($body['accessCode'] ?? null);

    if ($tournamentId === '' || !preg_match('/^[A-Za-z0-9_-]{1,40}$/', $tournamentId)) {
        respond([
            'ok' => false,
            'error' => 'Invalid tournament ID.',
        ], 400);
    }

    if ($accessCode === '') {
        respond([
            'ok' => false,
            'error' => 'Enter a 5-character quick ID.',
        ], 400);
    }

    $stmt = $pdo->prepare('SELECT tournament_id, tournament_name, access_code FROM pool_scheduler_tournaments WHERE tournament_id = :tournament_id AND is_deleted = 0');
    $stmt->execute([':tournament_id' => $tournamentId]);
    $row = $stmt->fetch();

    if (!$row) {
        respond([
            'ok' => false,
            'error' => 'Tournament not found.',
        ], 404);
    }

    if ((string) $row['access_code'] !== $accessCode) {
        respond([
            'ok' => false,
            'error' => 'That quick ID was not accepted.',
        ], 401);
    }

    respond([
        'ok' => true,
        'tournament' => [
            'id' => (string) $row['tournament_id'],
            'name' => (string) $row['tournament_name'],
        ],
    ]);
}

if ($action === 'create-tournament') {
    if (!isAdminLoggedIn()) {
        respond([
            'ok' => false,
            'error' => 'Admin login required.',
        ], 403);
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        respond([
            'ok' => false,
            'error' => 'Create requests must use POST.',
        ], 405);
    }

    $body = readJsonBody();
    $tournamentId = generateTournamentId();
    $tournamentName = sanitizeTournamentName($body['name'] ?? null, $tournamentId);
    $accessCode = sanitizeAccessCode($body['accessCode'] ?? null);

    if ($accessCode === '') {
        respond([
            'ok' => false,
            'error' => 'Enter a 5-character quick ID using letters or numbers.',
        ], 400);
    }

    $stmt = $pdo->prepare(
        'INSERT INTO pool_scheduler_tournaments (tournament_id, tournament_name, access_code, is_hidden, is_deleted, state_json) VALUES (:tournament_id, :tournament_name, :access_code, :is_hidden, :is_deleted, :state_json)'
    );
    $stmt->execute([
        ':tournament_id' => $tournamentId,
        ':tournament_name' => $tournamentName,
        ':access_code' => $accessCode,
        ':is_hidden' => 0,
        ':is_deleted' => 0,
        ':state_json' => '{}',
    ]);

    respond([
        'ok' => true,
        'tournament' => [
            'id' => $tournamentId,
            'name' => $tournamentName,
            'accessCode' => $accessCode,
        ],
    ]);
}

if ($action === 'clone-tournament') {
    if (!isAdminLoggedIn()) {
        respond([
            'ok' => false,
            'error' => 'Admin login required.',
        ], 403);
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        respond([
            'ok' => false,
            'error' => 'Clone requests must use POST.',
        ], 405);
    }

    $body = readJsonBody();
    $sourceTournamentId = trim((string) ($body['sourceTournamentId'] ?? ''));
    $tournamentId = generateTournamentId();
    $tournamentName = sanitizeTournamentName($body['name'] ?? null, $tournamentId);
    $accessCode = sanitizeAccessCode($body['accessCode'] ?? null);

    if ($sourceTournamentId === '' || !preg_match('/^[A-Za-z0-9_-]{1,40}$/', $sourceTournamentId)) {
        respond([
            'ok' => false,
            'error' => 'Invalid source tournament ID.',
        ], 400);
    }

    if ($accessCode === '') {
        respond([
            'ok' => false,
            'error' => 'Enter a 5-character quick ID using letters or numbers.',
        ], 400);
    }

    $sourceStmt = $pdo->prepare(
        'SELECT tournament_id, state_json FROM pool_scheduler_tournaments WHERE tournament_id = :tournament_id AND is_deleted = 0'
    );
    $sourceStmt->execute([
        ':tournament_id' => $sourceTournamentId,
    ]);
    $sourceTournament = $sourceStmt->fetch();

    if (!$sourceTournament) {
        respond([
            'ok' => false,
            'error' => 'Source tournament not found.',
        ], 404);
    }

    $insertStmt = $pdo->prepare(
        'INSERT INTO pool_scheduler_tournaments (tournament_id, tournament_name, access_code, is_hidden, is_deleted, state_json) VALUES (:tournament_id, :tournament_name, :access_code, :is_hidden, :is_deleted, :state_json)'
    );
    $insertStmt->execute([
        ':tournament_id' => $tournamentId,
        ':tournament_name' => $tournamentName,
        ':access_code' => $accessCode,
        ':is_hidden' => 0,
        ':is_deleted' => 0,
        ':state_json' => (string) $sourceTournament['state_json'],
    ]);

    $sourceSessionStmt = $pdo->prepare('SELECT state_json FROM pool_scheduler_sessions WHERE session_id = :session_id');
    $sourceSessionStmt->execute([
        ':session_id' => $sourceTournamentId,
    ]);
    $sourceSessionState = $sourceSessionStmt->fetchColumn();
    if (!is_string($sourceSessionState) || trim($sourceSessionState) === '') {
        $sourceSessionState = '{}';
    }

    $insertSessionStmt = $pdo->prepare(
        'INSERT INTO pool_scheduler_sessions (session_id, state_json) VALUES (:session_id, :state_json)'
    );
    $insertSessionStmt->execute([
        ':session_id' => $tournamentId,
        ':state_json' => $sourceSessionState,
    ]);

    respond([
        'ok' => true,
        'tournament' => [
            'id' => $tournamentId,
            'name' => $tournamentName,
            'accessCode' => $accessCode,
        ],
    ]);
}

if ($action === 'set-tournament-hidden') {
    if (!isAdminLoggedIn()) {
        respond([
            'ok' => false,
            'error' => 'Admin login required.',
        ], 403);
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        respond([
            'ok' => false,
            'error' => 'Visibility requests must use POST.',
        ], 405);
    }

    $body = readJsonBody();
    $tournamentId = trim((string) ($body['tournamentId'] ?? ''));
    $isHidden = !empty($body['hidden']);

    if ($tournamentId === '' || !preg_match('/^[A-Za-z0-9_-]{1,40}$/', $tournamentId)) {
        respond([
            'ok' => false,
            'error' => 'Invalid tournament ID.',
        ], 400);
    }

    $stmt = $pdo->prepare(
        'UPDATE pool_scheduler_tournaments SET is_hidden = :is_hidden WHERE tournament_id = :tournament_id AND is_deleted = 0'
    );
    $stmt->execute([
        ':is_hidden' => $isHidden ? 1 : 0,
        ':tournament_id' => $tournamentId,
    ]);

    if ($stmt->rowCount() < 1) {
        $existsStmt = $pdo->prepare('SELECT tournament_id FROM pool_scheduler_tournaments WHERE tournament_id = :tournament_id');
        $existsStmt->execute([':tournament_id' => $tournamentId]);
        if ($existsStmt->fetch() === false) {
            respond([
                'ok' => false,
                'error' => 'Tournament not found.',
            ], 404);
        }
    }

    respond([
        'ok' => true,
        'hidden' => $isHidden,
    ]);
}

if ($action === 'set-tournament-deleted') {
    if (!isAdminLoggedIn()) {
        respond([
            'ok' => false,
            'error' => 'Admin login required.',
        ], 403);
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        respond([
            'ok' => false,
            'error' => 'Delete requests must use POST.',
        ], 405);
    }

    $body = readJsonBody();
    $tournamentId = trim((string) ($body['tournamentId'] ?? ''));

    if ($tournamentId === '' || !preg_match('/^[A-Za-z0-9_-]{1,40}$/', $tournamentId)) {
        respond([
            'ok' => false,
            'error' => 'Invalid tournament ID.',
        ], 400);
    }

    $statusStmt = $pdo->prepare('SELECT is_hidden, is_deleted FROM pool_scheduler_tournaments WHERE tournament_id = :tournament_id');
    $statusStmt->execute([':tournament_id' => $tournamentId]);
    $row = $statusStmt->fetch();

    if (!$row || ((int) $row['is_deleted']) === 1) {
        respond([
            'ok' => false,
            'error' => 'Tournament not found.',
        ], 404);
    }

    if (((int) $row['is_hidden']) !== 1) {
        respond([
            'ok' => false,
            'error' => 'Hide the tournament before deleting it.',
        ], 400);
    }

    $stmt = $pdo->prepare(
        'UPDATE pool_scheduler_tournaments SET is_deleted = 1 WHERE tournament_id = :tournament_id'
    );
    $stmt->execute([
        ':tournament_id' => $tournamentId,
    ]);

    respond([
        'ok' => true,
        'deleted' => true,
    ]);
}

$sessionId = requestSessionId();
rejectDeletedTournamentSession($pdo, $sessionId);

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
