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

function isUserLoggedIn(): bool
{
    return !empty($_SESSION['pool_user_id']) && (int) $_SESSION['pool_user_id'] > 0;
}

function currentUserId(): int
{
    return isUserLoggedIn() ? (int) $_SESSION['pool_user_id'] : 0;
}

function currentUserEmail(): string
{
    return isUserLoggedIn() ? (string) ($_SESSION['pool_user_email'] ?? '') : '';
}

function isSuperuserLoggedIn(): bool
{
    return !empty($_SESSION['pool_is_superuser']) && (bool) $_SESSION['pool_is_superuser'];
}

function currentUserIsSuperuser(): bool
{
    return isSuperuserLoggedIn();
}

function currentUserCanManageTournament(int $ownerUserId): bool
{
    if (currentUserIsSuperuser()) {
        return true;
    }
    return isUserLoggedIn() && currentUserId() === $ownerUserId;
}

function generateTournamentId(): string
{
    return 't' . substr(strtoupper(bin2hex(random_bytes(6))), 0, 12);
}

function generateAccessCode(): string
{
    $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    $code = '';
    $maxIndex = strlen($alphabet) - 1;
    for ($i = 0; $i < 5; $i++) {
        $code .= $alphabet[random_int(0, $maxIndex)];
    }
    return $code;
}

function generateInviteToken(): string
{
    return bin2hex(random_bytes(16));
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

function generateUniqueAccessCode(PDO $pdo): string
{
    for ($attempt = 0; $attempt < 20; $attempt++) {
        $accessCode = generateAccessCode();
        $stmt = $pdo->prepare('SELECT tournament_id FROM pool_scheduler_tournaments WHERE access_code = :access_code LIMIT 1');
        $stmt->execute([':access_code' => $accessCode]);
        if ($stmt->fetch() === false) {
            return $accessCode;
        }
    }

    respond([
        'ok' => false,
        'error' => 'Could not generate a unique tournament code. Please try again.',
    ], 500);
}

function sanitizeEmail(?string $email): string
{
    $value = trim((string) ($email ?? ''));
    $value = strtolower($value);
    if ($value === '' || filter_var($value, FILTER_VALIDATE_EMAIL) === false) {
        return '';
    }
    return mb_substr($value, 0, 190, 'UTF-8');
}

function sanitizeDisplayName(?string $name): string
{
    $value = trim((string) ($name ?? ''));
    $value = preg_replace('/\s+/', ' ', $value) ?? $value;
    return mb_substr($value, 0, 80, 'UTF-8');
}

function normalizeLoginEmail(?string $email): string
{
    $value = trim((string) ($email ?? ''));
    $value = strtolower($value);
    if ($value === 'admin' || $value === 'admin@localhost' || $value === 'admin@pool.local') {
        return 'admin@pool.local';
    }
    return sanitizeEmail($value);
}

function sanitizeVisibilityDays($value): int
{
    $days = is_numeric($value) ? (int) $value : 0;
    if ($days < 1) {
        return 7;
    }
    if ($days > 365) {
        return 365;
    }
    return $days;
}

function calculatePublicExpiresAt(bool $isPublic, int $visibilityDays, ?string $musterDate): ?string
{
    if (!$isPublic) {
        return null;
    }

    $baseTimestamp = time();
    $musterValue = trim((string) ($musterDate ?? ''));
    if ($musterValue !== '') {
        $parsed = strtotime($musterValue);
        if ($parsed !== false) {
            $baseTimestamp = $parsed;
        }
    }

    return gmdate('Y-m-d H:i:s', $baseTimestamp + ($visibilityDays * 86400));
}

function sanitizeLocation(?string $location): string
{
    return mb_substr(trim((string) ($location ?? '')), 0, 200, 'UTF-8');
}

function calculateInviteExpiresAt(?string $musterDate): string
{
    $baseTimestamp = time();
    $musterValue = trim((string) ($musterDate ?? ''));
    if ($musterValue !== '') {
        $parsed = strtotime($musterValue);
        if ($parsed !== false) {
            $baseTimestamp = $parsed;
        }
    }

    return gmdate('Y-m-d H:i:s', $baseTimestamp + (7 * 86400));
}

function sanitizeMusterDate(?string $musterDate): ?string
{
    $value = trim((string) ($musterDate ?? ''));
    if ($value === '') {
        return null;
    }

    $timestamp = strtotime($value);
    if ($timestamp === false) {
        return null;
    }

    return date('Y-m-d H:i:s', $timestamp);
}

function parseInviteRecipients($value): array
{
    $parts = [];
    if (is_array($value)) {
        $parts = $value;
    } elseif (is_string($value)) {
        $parts = preg_split('/[\s,;]+/', $value) ?: [];
    }

    $recipients = [];
    foreach ($parts as $part) {
        $email = sanitizeEmail(is_string($part) ? $part : null);
        if ($email !== '') {
            $recipients[$email] = true;
        }
    }

    return array_keys($recipients);
}

function buildTournamentPublicUrl(string $tournamentId, ?string $recipientEmail = null, ?string $inviteToken = null): string
{
    $scheme = (!empty($_SERVER['HTTPS']) && strtolower((string) $_SERVER['HTTPS']) !== 'off') ? 'https' : 'http';
    $host = (string) ($_SERVER['HTTP_HOST'] ?? $_SERVER['SERVER_NAME'] ?? 'localhost');
    $scriptName = str_replace('\\', '/', (string) ($_SERVER['SCRIPT_NAME'] ?? ''));
    $baseDir = rtrim(str_replace('/api.php', '', $scriptName), '/');
    $path = ($baseDir === '' ? '' : $baseDir) . '/';
    $queryParams = ['id' => $tournamentId];
    $normalizedInviteToken = trim((string) ($inviteToken ?? ''));
    if ($normalizedInviteToken !== '') {
        $queryParams['invite'] = $normalizedInviteToken;
    } else {
        $normalizedRecipientEmail = sanitizeEmail($recipientEmail);
        if ($normalizedRecipientEmail !== '') {
            $queryParams['email'] = $normalizedRecipientEmail;
        }
    }
    $queryString = http_build_query($queryParams, '', '&', PHP_QUERY_RFC3986);
    return "{$scheme}://{$host}{$path}?{$queryString}";
}

function parseBooleanSettingValue($value, bool $default): bool
{
    if (is_bool($value)) {
        return $value;
    }
    if (is_int($value)) {
        return $value === 1;
    }
    if (is_string($value)) {
        $normalized = strtolower(trim($value));
        if ($normalized === '') {
            return $default;
        }
        if (in_array($normalized, ['1', 'true', 'yes', 'on'], true)) {
            return true;
        }
        if (in_array($normalized, ['0', 'false', 'no', 'off'], true)) {
            return false;
        }
    }
    return $default;
}

function readSiteSetting(PDO $pdo, string $settingKey, bool $default = true): bool
{
    $stmt = $pdo->prepare('SELECT setting_value FROM pool_scheduler_site_settings WHERE setting_key = :setting_key LIMIT 1');
    $stmt->execute([':setting_key' => $settingKey]);
    $row = $stmt->fetch();
    if (!$row) {
        return $default;
    }
    return parseBooleanSettingValue($row['setting_value'] ?? '', $default);
}

function writeSiteSetting(PDO $pdo, string $settingKey, bool $value): bool
{
    $stmt = $pdo->prepare('INSERT INTO pool_scheduler_site_settings (setting_key, setting_value) VALUES (:setting_key, :setting_value) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = CURRENT_TIMESTAMP');
    $stmt->execute([
        ':setting_key' => $settingKey,
        ':setting_value' => $value ? '1' : '0',
    ]);
    return true;
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
        'CREATE TABLE IF NOT EXISTS pool_scheduler_users (
            user_id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            email VARCHAR(190) NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            is_superuser TINYINT(1) NOT NULL DEFAULT 0,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_pool_scheduler_users_email (email)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    $userEmailIndexStmt = $pdo->query("SHOW INDEX FROM pool_scheduler_users WHERE Key_name = 'uq_pool_scheduler_users_email'");
    if ($userEmailIndexStmt->fetch() === false) {
        $pdo->exec("ALTER TABLE pool_scheduler_users ADD UNIQUE KEY uq_pool_scheduler_users_email (email)");
    }
    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS pool_scheduler_site_settings (
            setting_key VARCHAR(64) NOT NULL PRIMARY KEY,
            setting_value VARCHAR(255) NOT NULL,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );
    $settingDefaultStmt = $pdo->prepare('INSERT INTO pool_scheduler_site_settings (setting_key, setting_value) VALUES (:setting_key, :setting_value) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = CURRENT_TIMESTAMP');
    $settingDefaultStmt->execute([
        ':setting_key' => 'allow_invites',
        ':setting_value' => '1',
    ]);

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS pool_scheduler_tournaments (
            tournament_id VARCHAR(40) NOT NULL PRIMARY KEY,
            owner_user_id INT UNSIGNED NULL,
            tournament_name VARCHAR(200) NOT NULL,
            tournament_location VARCHAR(200) NOT NULL DEFAULT \'\',
            muster_at DATETIME NULL,
            access_code VARCHAR(20) NOT NULL,
            is_public TINYINT(1) NOT NULL DEFAULT 1,
            public_expires_at DATETIME NULL,
            is_hidden TINYINT(1) NOT NULL DEFAULT 0,
            is_deleted TINYINT(1) NOT NULL DEFAULT 0,
            state_json LONGTEXT NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY idx_pool_scheduler_tournaments_owner_user_id (owner_user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS pool_scheduler_tournament_members (
            tournament_id VARCHAR(40) NOT NULL,
            user_id INT UNSIGNED NOT NULL,
            user_email VARCHAR(190) NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (tournament_id, user_id),
            KEY idx_pool_scheduler_tournament_members_user_id (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS pool_scheduler_tournament_invites (
            invite_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            tournament_id VARCHAR(40) NOT NULL,
            user_email VARCHAR(190) NOT NULL,
            invite_token VARCHAR(64) NULL,
            status VARCHAR(20) NOT NULL DEFAULT "pending",
            expires_at DATETIME NULL,
            accepted_at DATETIME NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY uq_pool_scheduler_tournament_invites_tournament_user (tournament_id, user_email),
            KEY idx_pool_scheduler_tournament_invites_user_email (user_email),
            KEY idx_pool_scheduler_tournament_invites_expires_at (expires_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    );

    $inviteStatusColumnStmt = $pdo->query("SHOW COLUMNS FROM pool_scheduler_tournament_invites LIKE 'status'");
    if ($inviteStatusColumnStmt->fetch() === false) {
        $pdo->exec("ALTER TABLE pool_scheduler_tournament_invites ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'pending' AFTER user_email");
    }

    $inviteExpiresColumnStmt = $pdo->query("SHOW COLUMNS FROM pool_scheduler_tournament_invites LIKE 'expires_at'");
    if ($inviteExpiresColumnStmt->fetch() === false) {
        $pdo->exec("ALTER TABLE pool_scheduler_tournament_invites ADD COLUMN expires_at DATETIME NULL AFTER status");
    }

    $inviteAcceptedColumnStmt = $pdo->query("SHOW COLUMNS FROM pool_scheduler_tournament_invites LIKE 'accepted_at'");
    if ($inviteAcceptedColumnStmt->fetch() === false) {
        $pdo->exec("ALTER TABLE pool_scheduler_tournament_invites ADD COLUMN accepted_at DATETIME NULL AFTER expires_at");
    }

    $inviteTokenColumnStmt = $pdo->query("SHOW COLUMNS FROM pool_scheduler_tournament_invites LIKE 'invite_token'");
    if ($inviteTokenColumnStmt->fetch() === false) {
        $pdo->exec("ALTER TABLE pool_scheduler_tournament_invites ADD COLUMN invite_token VARCHAR(64) NULL AFTER user_email");
    }

    $inviteTokenIndexStmt = $pdo->query("SHOW INDEX FROM pool_scheduler_tournament_invites WHERE Key_name = 'uq_pool_scheduler_tournament_invites_token'");
    if ($inviteTokenIndexStmt->fetch() === false) {
        $pdo->exec("ALTER TABLE pool_scheduler_tournament_invites ADD UNIQUE KEY uq_pool_scheduler_tournament_invites_token (invite_token)");
    }

    $columnStmt = $pdo->query("SHOW COLUMNS FROM pool_scheduler_tournaments LIKE 'access_code'");
    if ($columnStmt->fetch() === false) {
        $pdo->exec("ALTER TABLE pool_scheduler_tournaments ADD COLUMN access_code VARCHAR(20) NOT NULL DEFAULT ''");
    }

    $superuserColumnStmt = $pdo->query("SHOW COLUMNS FROM pool_scheduler_users LIKE 'is_superuser'");
    if ($superuserColumnStmt->fetch() === false) {
        $pdo->exec("ALTER TABLE pool_scheduler_users ADD COLUMN is_superuser TINYINT(1) NOT NULL DEFAULT 0 AFTER password_hash");
    }

    $displayNameColumnStmt = $pdo->query("SHOW COLUMNS FROM pool_scheduler_users LIKE 'display_name'");
    if ($displayNameColumnStmt->fetch() === false) {
        $pdo->exec("ALTER TABLE pool_scheduler_users ADD COLUMN display_name VARCHAR(80) NOT NULL DEFAULT '' AFTER password_hash");
    }

    $seedSuperuserEmail = 'admin@pool.local';
    $seedSuperuserPasswordHash = password_hash('Admin98', PASSWORD_DEFAULT);
    if (is_string($seedSuperuserPasswordHash) && $seedSuperuserPasswordHash !== '') {
        $seedSuperuserStmt = $pdo->prepare(
            'INSERT INTO pool_scheduler_users (email, password_hash, is_superuser)
             VALUES (:email, :password_hash, :is_superuser)
             ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), is_superuser = VALUES(is_superuser)'
        );
        $seedSuperuserStmt->execute([
            ':email' => $seedSuperuserEmail,
            ':password_hash' => $seedSuperuserPasswordHash,
            ':is_superuser' => 1,
        ]);
    }

    $ownerColumnStmt = $pdo->query("SHOW COLUMNS FROM pool_scheduler_tournaments LIKE 'owner_user_id'");
    if ($ownerColumnStmt->fetch() === false) {
        $pdo->exec("ALTER TABLE pool_scheduler_tournaments ADD COLUMN owner_user_id INT UNSIGNED NULL AFTER tournament_id");
    }

    $locationColumnStmt = $pdo->query("SHOW COLUMNS FROM pool_scheduler_tournaments LIKE 'tournament_location'");
    if ($locationColumnStmt->fetch() === false) {
        $pdo->exec("ALTER TABLE pool_scheduler_tournaments ADD COLUMN tournament_location VARCHAR(200) NOT NULL DEFAULT '' AFTER tournament_name");
    }

    $musterColumnStmt = $pdo->query("SHOW COLUMNS FROM pool_scheduler_tournaments LIKE 'muster_at'");
    if ($musterColumnStmt->fetch() === false) {
        $pdo->exec("ALTER TABLE pool_scheduler_tournaments ADD COLUMN muster_at DATETIME NULL AFTER tournament_location");
    }

    $hiddenColumnStmt = $pdo->query("SHOW COLUMNS FROM pool_scheduler_tournaments LIKE 'is_hidden'");
    if ($hiddenColumnStmt->fetch() === false) {
        $pdo->exec("ALTER TABLE pool_scheduler_tournaments ADD COLUMN is_hidden TINYINT(1) NOT NULL DEFAULT 0");
    }

    $publicColumnStmt = $pdo->query("SHOW COLUMNS FROM pool_scheduler_tournaments LIKE 'is_public'");
    if ($publicColumnStmt->fetch() === false) {
        $pdo->exec("ALTER TABLE pool_scheduler_tournaments ADD COLUMN is_public TINYINT(1) NOT NULL DEFAULT 1 AFTER access_code");
    }

    $publicExpiryColumnStmt = $pdo->query("SHOW COLUMNS FROM pool_scheduler_tournaments LIKE 'public_expires_at'");
    if ($publicExpiryColumnStmt->fetch() === false) {
        $pdo->exec("ALTER TABLE pool_scheduler_tournaments ADD COLUMN public_expires_at DATETIME NULL AFTER is_public");
    }

    $deletedColumnStmt = $pdo->query("SHOW COLUMNS FROM pool_scheduler_tournaments LIKE 'is_deleted'");
    if ($deletedColumnStmt->fetch() === false) {
        $pdo->exec("ALTER TABLE pool_scheduler_tournaments ADD COLUMN is_deleted TINYINT(1) NOT NULL DEFAULT 0");
    }

    $ownerIndexStmt = $pdo->query("SHOW INDEX FROM pool_scheduler_tournaments WHERE Key_name = 'idx_pool_scheduler_tournaments_owner_user_id'");
    if ($ownerIndexStmt->fetch() === false) {
        $pdo->exec("ALTER TABLE pool_scheduler_tournaments ADD INDEX idx_pool_scheduler_tournaments_owner_user_id (owner_user_id)");
    }

    $memberUserIndexStmt = $pdo->query("SHOW INDEX FROM pool_scheduler_tournament_members WHERE Key_name = 'idx_pool_scheduler_tournament_members_user_id'");
    if ($memberUserIndexStmt->fetch() === false) {
        $pdo->exec("ALTER TABLE pool_scheduler_tournament_members ADD INDEX idx_pool_scheduler_tournament_members_user_id (user_id)");
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
    if ($raw === false) {
        $raw = '';
    }

    $contentType = strtolower((string) ($_SERVER['CONTENT_TYPE'] ?? ''));
    if ($raw === '' && is_array($_POST) && count($_POST) > 0) {
        return $_POST;
    }

    if ($raw === '') {
        return [];
    }

    if (str_contains($contentType, 'application/x-www-form-urlencoded') || str_contains($contentType, 'multipart/form-data')) {
        $formData = [];
        parse_str($raw, $formData);
        if (is_array($formData) && count($formData) > 0) {
            return $formData;
        }
    }

    $decoded = json_decode($raw, true);
    if (is_array($decoded)) {
        return $decoded;
    }

    respond([
        'ok' => false,
        'error' => 'Request body must be valid JSON or form data.',
    ], 400);
}

$action = isset($_GET['action']) ? (string) $_GET['action'] : '';
$pdo = db($dbConfig);

if ($action === 'auth-status') {
    $displayName = '';
    if (isUserLoggedIn()) {
        $stmt = $pdo->prepare('SELECT display_name FROM pool_scheduler_users WHERE user_id = :user_id LIMIT 1');
        $stmt->execute([':user_id' => currentUserId()]);
        $user = $stmt->fetch();
        if ($user) {
            $displayName = (string) ($user['display_name'] ?? '');
        }
    }

    respond([
        'ok' => true,
        'isLoggedIn' => isUserLoggedIn(),
        'userEmail' => currentUserEmail(),
        'displayName' => $displayName,
        'isSuperuser' => currentUserIsSuperuser(),
    ]);
}

if ($action === 'site-settings') {
    $allowInvites = readSiteSetting($pdo, 'allow_invites', true);
    respond([
        'ok' => true,
        'settings' => [
            'allowInvites' => $allowInvites,
        ],
    ]);
}

if ($action === 'update-site-setting') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        respond([
            'ok' => false,
            'error' => 'Setting updates must use POST.',
        ], 405);
    }

    if (!isUserLoggedIn() || !currentUserIsSuperuser()) {
        respond([
            'ok' => false,
            'error' => 'Only administrators can update site settings.',
        ], 403);
    }

    $body = readJsonBody();
    $settingKey = trim((string) ($body['settingKey'] ?? ''));
    if ($settingKey === '') {
        respond([
            'ok' => false,
            'error' => 'Please choose a setting to update.',
        ], 400);
    }

    if ($settingKey !== 'allow_invites') {
        respond([
            'ok' => false,
            'error' => 'Only the allow_invites setting can be changed.',
        ], 400);
    }

    $value = $body['value'] ?? ($body['allowInvites'] ?? true);
    $allowInvites = parseBooleanSettingValue($value, true);
    writeSiteSetting($pdo, $settingKey, $allowInvites);

    respond([
        'ok' => true,
        'settings' => [
            'allowInvites' => $allowInvites,
        ],
    ]);
}

if ($action === 'resolve-invite') {
    $inviteToken = trim((string) ($_GET['invite'] ?? ($_GET['token'] ?? '')));
    if ($inviteToken === '') {
        respond([
            'ok' => false,
            'error' => 'Invite token is missing.',
        ], 400);
    }

    $stmt = $pdo->prepare('SELECT user_email FROM pool_scheduler_tournament_invites WHERE invite_token = :invite_token LIMIT 1');
    $stmt->execute([':invite_token' => $inviteToken]);
    $row = $stmt->fetch();
    if (!$row) {
        respond([
            'ok' => false,
            'error' => 'Invite not found.',
        ], 404);
    }

    respond([
        'ok' => true,
        'email' => (string) $row['user_email'],
    ]);
}

if ($action === 'signup') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        respond([
            'ok' => false,
            'error' => 'Sign-up requests must use POST.',
        ], 405);
    }

    $body = readJsonBody();
    $email = sanitizeEmail($body['email'] ?? null);
    $password = trim((string) ($body['password'] ?? ''));
    $displayName = sanitizeDisplayName($body['displayName'] ?? ($body['display_name'] ?? null));

    if ($email === '') {
        respond([
            'ok' => false,
            'error' => 'Enter a valid email address.',
        ], 400);
    }

    if (mb_strlen($password, 'UTF-8') < 6) {
        respond([
            'ok' => false,
            'error' => 'Password must be at least 6 characters.',
        ], 400);
    }

    $existingStmt = $pdo->prepare('SELECT user_id FROM pool_scheduler_users WHERE email = :email');
    $existingStmt->execute([':email' => $email]);
    if ($existingStmt->fetch() !== false) {
        respond([
            'ok' => false,
            'error' => 'That email address is already registered.',
        ], 409);
    }

    $passwordHash = password_hash($password, PASSWORD_DEFAULT);
    if (!is_string($passwordHash) || $passwordHash === '') {
        respond([
            'ok' => false,
            'error' => 'Could not create your account right now.',
        ], 500);
    }

    $insertStmt = $pdo->prepare('INSERT INTO pool_scheduler_users (email, password_hash, display_name, is_superuser) VALUES (:email, :password_hash, :display_name, :is_superuser)');
    $insertStmt->execute([
        ':email' => $email,
        ':password_hash' => $passwordHash,
        ':display_name' => $displayName,
        ':is_superuser' => 0,
    ]);

    $userId = (int) $pdo->lastInsertId();
    $_SESSION['pool_user_id'] = $userId;
    $_SESSION['pool_user_email'] = $email;
    $_SESSION['pool_is_superuser'] = false;

    respond([
        'ok' => true,
        'message' => 'Account created.',
        'userEmail' => $email,
        'displayName' => $displayName,
        'isSuperuser' => false,
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
    $email = normalizeLoginEmail($body['email'] ?? null);
    $password = trim((string) ($body['password'] ?? ''));

    if ($email === '' || $password === '') {
        respond([
            'ok' => false,
            'error' => 'Enter your email address and password.',
        ], 400);
    }

    $stmt = $pdo->prepare('SELECT user_id, email, password_hash, display_name, is_superuser FROM pool_scheduler_users WHERE email = :email');
    $stmt->execute([':email' => $email]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, (string) $user['password_hash'])) {
        respond([
            'ok' => false,
            'error' => 'That email or password was not accepted.',
        ], 401);
    }

    $_SESSION['pool_user_id'] = (int) $user['user_id'];
    $_SESSION['pool_user_email'] = (string) $user['email'];
    $_SESSION['pool_is_superuser'] = ((int) $user['is_superuser']) === 1;

    respond([
        'ok' => true,
        'message' => 'Logged in.',
        'userEmail' => (string) $user['email'],
        'displayName' => (string) ($user['display_name'] ?? ''),
        'isSuperuser' => ((int) $user['is_superuser']) === 1,
    ]);
}

if ($action === 'account-profile') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        respond([
            'ok' => false,
            'error' => 'Profile updates must use POST.',
        ], 405);
    }

    if (!isUserLoggedIn()) {
        respond([
            'ok' => false,
            'error' => 'Please log in to update your account.',
        ], 403);
    }

    $body = readJsonBody();
    $displayNameInputProvided = array_key_exists('displayName', $body) || array_key_exists('display_name', $body);
    $displayNameValue = $displayNameInputProvided ? sanitizeDisplayName($body['displayName'] ?? ($body['display_name'] ?? null)) : null;

    $currentPassword = trim((string) ($body['currentPassword'] ?? ($body['current_password'] ?? '')));
    $newPassword = trim((string) ($body['newPassword'] ?? ($body['new_password'] ?? '')));
    $confirmPassword = trim((string) ($body['confirmPassword'] ?? ($body['confirm_password'] ?? '')));

    $passwordChangeRequested = $currentPassword !== '' || $newPassword !== '' || $confirmPassword !== '';
    if ($passwordChangeRequested) {
        if ($currentPassword === '' || $newPassword === '' || $confirmPassword === '') {
            respond([
                'ok' => false,
                'error' => 'Please complete your current password, new password, and confirm password fields.',
            ], 400);
        }
        if ($newPassword !== $confirmPassword) {
            respond([
                'ok' => false,
                'error' => 'New password and confirmation do not match.',
            ], 400);
        }
        if (mb_strlen($newPassword, 'UTF-8') < 6) {
            respond([
                'ok' => false,
                'error' => 'New password must be at least 6 characters.',
            ], 400);
        }

        $existingStmt = $pdo->prepare('SELECT password_hash FROM pool_scheduler_users WHERE user_id = :user_id LIMIT 1');
        $existingStmt->execute([':user_id' => currentUserId()]);
        $existingUser = $existingStmt->fetch();
        if (!$existingUser || !password_verify($currentPassword, (string) $existingUser['password_hash'])) {
            respond([
                'ok' => false,
                'error' => 'Your current password was not accepted.',
            ], 401);
        }

        $newPasswordHash = password_hash($newPassword, PASSWORD_DEFAULT);
        if (!is_string($newPasswordHash) || $newPasswordHash === '') {
            respond([
                'ok' => false,
                'error' => 'Could not update your password right now.',
            ], 500);
        }

        $passwordUpdateStmt = $pdo->prepare('UPDATE pool_scheduler_users SET password_hash = :password_hash WHERE user_id = :user_id');
        $passwordUpdateStmt->execute([
            ':password_hash' => $newPasswordHash,
            ':user_id' => currentUserId(),
        ]);
    }

    if ($displayNameInputProvided) {
        $displayNameUpdateStmt = $pdo->prepare('UPDATE pool_scheduler_users SET display_name = :display_name WHERE user_id = :user_id');
        $displayNameUpdateStmt->execute([
            ':display_name' => $displayNameValue ?? '',
            ':user_id' => currentUserId(),
        ]);
    }

    $profileStmt = $pdo->prepare('SELECT email, display_name FROM pool_scheduler_users WHERE user_id = :user_id LIMIT 1');
    $profileStmt->execute([':user_id' => currentUserId()]);
    $profile = $profileStmt->fetch();

    respond([
        'ok' => true,
        'message' => 'Account updated.',
        'profile' => [
            'email' => (string) ($profile['email'] ?? currentUserEmail()),
            'displayName' => (string) ($profile['display_name'] ?? ''),
        ],
    ]);
}

if ($action === 'logout') {
    unset($_SESSION['pool_user_id'], $_SESSION['pool_user_email'], $_SESSION['pool_is_superuser']);
    unset($_SESSION['pool_admin']);
    respond([
        'ok' => true,
        'message' => 'Logged out.',
    ]);
}

if ($action === 'list-tournaments') {
    $scope = strtolower(trim((string) ($_GET['scope'] ?? '')));
    if ($scope !== 'public' && $scope !== 'mine' && $scope !== 'invited') {
        $scope = isUserLoggedIn() ? 'mine' : 'public';
    }

    $requestedTournamentId = trim((string) ($_GET['id'] ?? ($_GET['tournamentId'] ?? '')));
    if ($requestedTournamentId !== '' && !preg_match('/^[A-Za-z0-9_-]{4,40}$/', $requestedTournamentId)) {
        $requestedTournamentId = '';
    }

    $viewerUserId = currentUserId();
    $isSuperuser = currentUserIsSuperuser();
    $includeAccessCode = in_array($scope, ['mine', 'invited'], true) && isUserLoggedIn();
    $params = [];

    $query = 'SELECT
            pool_scheduler_tournaments.tournament_id,
            pool_scheduler_tournaments.owner_user_id,
            pool_scheduler_tournaments.tournament_name,
            pool_scheduler_tournaments.tournament_location,
            pool_scheduler_tournaments.muster_at,
            pool_scheduler_tournaments.access_code,
            pool_scheduler_tournaments.is_public,
            pool_scheduler_tournaments.public_expires_at,
            pool_scheduler_tournaments.is_hidden,
            pool_scheduler_tournaments.created_at,
            pool_scheduler_tournaments.updated_at,
            (SELECT COUNT(*) FROM pool_scheduler_tournament_members members WHERE members.tournament_id = pool_scheduler_tournaments.tournament_id) AS join_count';

    if ($viewerUserId > 0) {
        $query .= ',
            (SELECT COUNT(*) FROM pool_scheduler_tournament_members members WHERE members.tournament_id = pool_scheduler_tournaments.tournament_id AND members.user_id = :viewer_user_id) AS viewer_joined';
        $params[':viewer_user_id'] = $viewerUserId;
    }

    if ($scope === 'invited') {
        $query .= ',
            pool_scheduler_tournament_invites.invite_id,
            pool_scheduler_tournament_invites.status AS invite_status,
            pool_scheduler_tournament_invites.expires_at AS invite_expires_at,
            pool_scheduler_tournament_invites.accepted_at AS invite_accepted_at';
    }

    $query .= ' FROM pool_scheduler_tournaments';

    if ($scope === 'invited') {
        if (!isUserLoggedIn()) {
            respond([
                'ok' => false,
                'error' => 'Log in to view your invited tournaments.',
            ], 403);
        }
        $userEmail = sanitizeEmail(currentUserEmail());
        if ($userEmail === '') {
            respond([
                'ok' => false,
                'error' => 'Your account email is missing.',
            ], 400);
        }
        $query .= ' INNER JOIN pool_scheduler_tournament_invites ON pool_scheduler_tournament_invites.tournament_id = pool_scheduler_tournaments.tournament_id';
        $query .= ' WHERE pool_scheduler_tournaments.is_deleted = 0 AND pool_scheduler_tournament_invites.user_email = :invite_user_email AND (pool_scheduler_tournament_invites.expires_at IS NULL OR pool_scheduler_tournament_invites.expires_at > NOW())';
        $params[':invite_user_email'] = $userEmail;
    } else {
        $query .= ' WHERE pool_scheduler_tournaments.is_deleted = 0';
    }

    if ($requestedTournamentId !== '') {
        $query .= ' AND pool_scheduler_tournaments.tournament_id = :requested_tournament_id';
        $params[':requested_tournament_id'] = $requestedTournamentId;
    } elseif ($scope === 'mine') {
        if (!isUserLoggedIn()) {
            respond([
                'ok' => false,
                'error' => 'Log in to view your tournaments.',
            ], 403);
        }
        $query .= ' AND (pool_scheduler_tournaments.owner_user_id = :owner_user_id OR EXISTS (
            SELECT 1
            FROM pool_scheduler_tournament_members members
            WHERE members.tournament_id = pool_scheduler_tournaments.tournament_id
              AND members.user_id = :viewer_member_user_id
        ))';
        $params[':owner_user_id'] = $viewerUserId;
        $params[':viewer_member_user_id'] = $viewerUserId;
    } elseif ($scope !== 'invited') {
        $query .= ' AND pool_scheduler_tournaments.is_hidden = 0 AND pool_scheduler_tournaments.is_public = 1 AND (pool_scheduler_tournaments.public_expires_at IS NULL OR pool_scheduler_tournaments.public_expires_at > NOW())';
    }

    $query .= ' ORDER BY pool_scheduler_tournaments.updated_at DESC, pool_scheduler_tournaments.tournament_name ASC';
    $stmt = $pdo->prepare($query);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();

    respond([
        'ok' => true,
        'scope' => $scope,
        'tournaments' => array_map(static function (array $row) use ($includeAccessCode, $requestedTournamentId, $viewerUserId, $scope, $isSuperuser): array {
            $musterAt = $row['muster_at'] === null ? '' : (string) $row['muster_at'];
            $musterTimestamp = $musterAt !== '' ? strtotime($musterAt) : false;
            $joinWindowOpen = $musterTimestamp === false || $musterTimestamp > time();
            $isPublic = ((int) ($row['is_public'] ?? 0)) === 1;
            $isOwner = $viewerUserId > 0 && ((int) ($row['owner_user_id'] ?? 0) === $viewerUserId || $isSuperuser);
            $item = [
                'id' => (string) $row['tournament_id'],
                'name' => (string) $row['tournament_name'],
                'location' => (string) ($row['tournament_location'] ?? ''),
                'musterAt' => $musterAt,
                'joinCount' => (int) ($row['join_count'] ?? 0),
                'joined' => $viewerUserId > 0 ? ((int) ($row['viewer_joined'] ?? 0) > 0) : false,
                'joinWindowOpen' => $joinWindowOpen,
                'canJoin' => $joinWindowOpen && isUserLoggedIn() && !$isOwner && ($isPublic || $requestedTournamentId !== '' || $scope === 'invited'),
                'createdAt' => (string) $row['created_at'],
                'updatedAt' => (string) $row['updated_at'],
            ];
            if ($includeAccessCode) {
                $item['accessCode'] = (string) $row['access_code'];
                $item['hidden'] = ((int) $row['is_hidden']) === 1;
                $item['isPublic'] = ((int) $row['is_public']) === 1;
                $item['publicExpiresAt'] = $row['public_expires_at'] === null ? '' : (string) $row['public_expires_at'];
            }
            if ($scope === 'invited') {
                $item['inviteStatus'] = (string) ($row['invite_status'] ?? 'pending');
                $item['inviteExpiresAt'] = $row['invite_expires_at'] === null ? '' : (string) $row['invite_expires_at'];
                $item['inviteAcceptedAt'] = $row['invite_accepted_at'] === null ? '' : (string) $row['invite_accepted_at'];
            }
            $item['isOwner'] = $isOwner;
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
            'error' => 'Enter a 5-character tournament code.',
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
            'error' => 'That tournament code was not accepted.',
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

if ($action === 'resolve-tournament-code') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        respond([
            'ok' => false,
            'error' => 'Code lookup requests must use POST.',
        ], 405);
    }

    $body = readJsonBody();
    $accessCode = sanitizeAccessCode($body['accessCode'] ?? null);

    if ($accessCode === '') {
        respond([
            'ok' => false,
            'error' => 'Enter a 5-character tournament code.',
        ], 400);
    }

    $stmt = $pdo->prepare('SELECT tournament_id, tournament_name FROM pool_scheduler_tournaments WHERE access_code = :access_code AND is_deleted = 0');
    $stmt->execute([':access_code' => $accessCode]);
    $row = $stmt->fetch();

    if (!$row) {
        respond([
            'ok' => false,
            'error' => 'Tournament code not found.',
        ], 404);
    }

    respond([
        'ok' => true,
        'tournament' => [
            'id' => (string) $row['tournament_id'],
            'name' => (string) $row['tournament_name'],
            'accessCode' => $accessCode,
        ],
    ]);
}

if ($action === 'create-tournament') {
    if (!isUserLoggedIn()) {
        respond([
            'ok' => false,
            'error' => 'Log in to create a tournament.',
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
    $tournamentLocation = sanitizeLocation($body['location'] ?? null);
    $musterAt = sanitizeMusterDate($body['musterDate'] ?? null);
    $accessCode = generateUniqueAccessCode($pdo);
    $isPublic = !empty($body['isPublic']);
    $visibilityDays = sanitizeVisibilityDays($body['visibilityDays'] ?? null);
    $publicExpiresAt = calculatePublicExpiresAt($isPublic, $visibilityDays, $musterAt);

    $stmt = $pdo->prepare(
        'INSERT INTO pool_scheduler_tournaments (tournament_id, owner_user_id, tournament_name, tournament_location, muster_at, access_code, is_public, public_expires_at, is_hidden, is_deleted, state_json) VALUES (:tournament_id, :owner_user_id, :tournament_name, :tournament_location, :muster_at, :access_code, :is_public, :public_expires_at, :is_hidden, :is_deleted, :state_json)'
    );
    $stmt->execute([
        ':tournament_id' => $tournamentId,
        ':owner_user_id' => currentUserId(),
        ':tournament_name' => $tournamentName,
        ':tournament_location' => $tournamentLocation,
        ':muster_at' => $musterAt,
        ':access_code' => $accessCode,
        ':is_public' => $isPublic ? 1 : 0,
        ':public_expires_at' => $publicExpiresAt,
        ':is_hidden' => 0,
        ':is_deleted' => 0,
        ':state_json' => '{}',
    ]);

    respond([
        'ok' => true,
        'tournament' => [
            'id' => $tournamentId,
            'name' => $tournamentName,
            'location' => $tournamentLocation,
            'musterAt' => $musterAt ?? '',
            'accessCode' => $accessCode,
            'isPublic' => $isPublic,
            'publicExpiresAt' => $publicExpiresAt ?? '',
        ],
    ]);
}

if ($action === 'clone-tournament') {
    if (!isUserLoggedIn()) {
        respond([
            'ok' => false,
            'error' => 'Log in to copy a tournament.',
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
    $requestedLocation = sanitizeLocation($body['location'] ?? null);
    $requestedMusterAt = sanitizeMusterDate($body['musterDate'] ?? null);
    $accessCode = generateUniqueAccessCode($pdo);
    $isPublic = !empty($body['isPublic']);
    $visibilityDays = sanitizeVisibilityDays($body['visibilityDays'] ?? null);

    if ($sourceTournamentId === '' || !preg_match('/^[A-Za-z0-9_-]{1,40}$/', $sourceTournamentId)) {
        respond([
            'ok' => false,
            'error' => 'Invalid source tournament ID.',
        ], 400);
    }

    $sourceStmt = $pdo->prepare(
        'SELECT tournament_id, state_json, tournament_location, muster_at FROM pool_scheduler_tournaments WHERE tournament_id = :tournament_id AND is_deleted = 0 AND (:is_superuser = 1 OR owner_user_id = :owner_user_id)'
    );
    $sourceStmt->execute([
        ':tournament_id' => $sourceTournamentId,
        ':is_superuser' => currentUserIsSuperuser() ? 1 : 0,
        ':owner_user_id' => currentUserId(),
    ]);
    $sourceTournament = $sourceStmt->fetch();

    if (!$sourceTournament) {
        respond([
            'ok' => false,
            'error' => 'Source tournament not found.',
        ], 404);
    }

    $tournamentLocation = $requestedLocation !== '' ? $requestedLocation : (string) ($sourceTournament['tournament_location'] ?? '');
    $musterAt = $requestedMusterAt ?? ($sourceTournament['muster_at'] === null ? null : (string) $sourceTournament['muster_at']);
    $publicExpiresAt = calculatePublicExpiresAt($isPublic, $visibilityDays, $musterAt);

    $insertStmt = $pdo->prepare(
        'INSERT INTO pool_scheduler_tournaments (tournament_id, owner_user_id, tournament_name, tournament_location, muster_at, access_code, is_public, public_expires_at, is_hidden, is_deleted, state_json) VALUES (:tournament_id, :owner_user_id, :tournament_name, :tournament_location, :muster_at, :access_code, :is_public, :public_expires_at, :is_hidden, :is_deleted, :state_json)'
    );
    $insertStmt->execute([
        ':tournament_id' => $tournamentId,
        ':owner_user_id' => currentUserId(),
        ':tournament_name' => $tournamentName,
        ':tournament_location' => $tournamentLocation,
        ':muster_at' => $musterAt,
        ':access_code' => $accessCode,
        ':is_public' => $isPublic ? 1 : 0,
        ':public_expires_at' => $publicExpiresAt,
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
            'location' => $tournamentLocation,
            'musterAt' => $musterAt ?? '',
            'accessCode' => $accessCode,
            'isPublic' => $isPublic,
            'publicExpiresAt' => $publicExpiresAt ?? '',
        ],
    ]);
}

if ($action === 'set-tournament-hidden') {
    if (!isUserLoggedIn()) {
        respond([
            'ok' => false,
            'error' => 'Log in to change tournament visibility.',
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
        'UPDATE pool_scheduler_tournaments SET is_hidden = :is_hidden WHERE tournament_id = :tournament_id AND is_deleted = 0 AND (:is_superuser = 1 OR owner_user_id = :owner_user_id)'
    );
    $stmt->execute([
        ':is_hidden' => $isHidden ? 1 : 0,
        ':tournament_id' => $tournamentId,
        ':is_superuser' => currentUserIsSuperuser() ? 1 : 0,
        ':owner_user_id' => currentUserId(),
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

if ($action === 'update-tournament-meta') {
    if (!isUserLoggedIn()) {
        respond([
            'ok' => false,
            'error' => 'Log in to update tournament details.',
        ], 403);
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        respond([
            'ok' => false,
            'error' => 'Tournament detail updates must use POST.',
        ], 405);
    }

    $body = readJsonBody();
    $tournamentId = trim((string) ($body['tournamentId'] ?? ''));
    $isPublic = !empty($body['isPublic']);
    $visibilityDays = sanitizeVisibilityDays($body['visibilityDays'] ?? null);
    $tournamentLocation = sanitizeLocation($body['location'] ?? null);
    $musterAt = sanitizeMusterDate($body['musterDate'] ?? null);
    $publicExpiresAt = calculatePublicExpiresAt($isPublic, $visibilityDays, $musterAt);

    if ($tournamentId === '' || !preg_match('/^[A-Za-z0-9_-]{1,40}$/', $tournamentId)) {
        respond([
            'ok' => false,
            'error' => 'Invalid tournament ID.',
        ], 400);
    }

    $stmt = $pdo->prepare(
        'UPDATE pool_scheduler_tournaments
         SET tournament_location = :tournament_location, muster_at = :muster_at, is_public = :is_public, public_expires_at = :public_expires_at
         WHERE tournament_id = :tournament_id AND is_deleted = 0 AND (:is_superuser = 1 OR owner_user_id = :owner_user_id)'
    );
    $stmt->execute([
        ':tournament_location' => $tournamentLocation,
        ':muster_at' => $musterAt,
        ':is_public' => $isPublic ? 1 : 0,
        ':public_expires_at' => $publicExpiresAt,
        ':tournament_id' => $tournamentId,
        ':is_superuser' => currentUserIsSuperuser() ? 1 : 0,
        ':owner_user_id' => currentUserId(),
    ]);

    if ($stmt->rowCount() < 1) {
        $existsStmt = $pdo->prepare(
                'SELECT tournament_id FROM pool_scheduler_tournaments WHERE tournament_id = :tournament_id AND is_deleted = 0 AND (:is_superuser = 1 OR owner_user_id = :owner_user_id)'
        );
        $existsStmt->execute([
            ':tournament_id' => $tournamentId,
                ':is_superuser' => currentUserIsSuperuser() ? 1 : 0,
                ':owner_user_id' => currentUserId(),
            ]);
        if ($existsStmt->fetch() === false) {
            respond([
                'ok' => false,
                'error' => 'Tournament not found.',
            ], 404);
        }
    }

    respond([
        'ok' => true,
        'location' => $tournamentLocation,
        'musterAt' => $musterAt ?? '',
        'isPublic' => $isPublic,
        'publicExpiresAt' => $publicExpiresAt ?? '',
    ]);
}

if ($action === 'set-tournament-deleted') {
    if (!isUserLoggedIn()) {
        respond([
            'ok' => false,
            'error' => 'Log in to delete a tournament.',
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

    $statusStmt = $pdo->prepare('SELECT is_hidden, is_deleted FROM pool_scheduler_tournaments WHERE tournament_id = :tournament_id AND is_deleted = 0 AND (:is_superuser = 1 OR owner_user_id = :owner_user_id)');
    $statusStmt->execute([
        ':tournament_id' => $tournamentId,
        ':is_superuser' => currentUserIsSuperuser() ? 1 : 0,
        ':owner_user_id' => currentUserId(),
    ]);
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
        'UPDATE pool_scheduler_tournaments SET is_deleted = 1 WHERE tournament_id = :tournament_id AND is_deleted = 0 AND (:is_superuser = 1 OR owner_user_id = :owner_user_id)'
    );
    $stmt->execute([
        ':tournament_id' => $tournamentId,
        ':is_superuser' => currentUserIsSuperuser() ? 1 : 0,
        ':owner_user_id' => currentUserId(),
    ]);

    respond([
        'ok' => true,
        'deleted' => true,
    ]);
}

$sessionId = requestSessionId();
rejectDeletedTournamentSession($pdo, $sessionId);

if ($action === 'tournament-context') {
    $stmt = $pdo->prepare(
        'SELECT
            tournament_id,
            owner_user_id,
            tournament_name,
            tournament_location,
            muster_at,
            access_code,
            is_public,
            public_expires_at,
            is_hidden,
            created_at,
            updated_at
         FROM pool_scheduler_tournaments
         WHERE tournament_id = :tournament_id AND is_deleted = 0'
    );
    $stmt->execute([
        ':tournament_id' => $sessionId,
    ]);
    $tournament = $stmt->fetch();

    if (!$tournament) {
        respond([
            'ok' => false,
            'error' => 'Tournament not found.',
        ], 404);
    }

    $joinCountStmt = $pdo->prepare('SELECT COUNT(*) FROM pool_scheduler_tournament_members WHERE tournament_id = :tournament_id');
    $joinCountStmt->execute([':tournament_id' => $sessionId]);
    $joinCount = (int) $joinCountStmt->fetchColumn();

    $viewerUserId = currentUserId();
    $hasJoined = false;
    if ($viewerUserId > 0) {
        $joinedStmt = $pdo->prepare('SELECT 1 FROM pool_scheduler_tournament_members WHERE tournament_id = :tournament_id AND user_id = :user_id LIMIT 1');
        $joinedStmt->execute([
            ':tournament_id' => $sessionId,
            ':user_id' => $viewerUserId,
        ]);
        $hasJoined = $joinedStmt->fetch() !== false;
    }

    $musterAt = $tournament['muster_at'] === null ? '' : (string) $tournament['muster_at'];
    $musterTimestamp = $musterAt !== '' ? strtotime($musterAt) : false;
    $joinWindowOpen = $musterTimestamp === false || $musterTimestamp > time();
    $isPublic = ((int) $tournament['is_public']) === 1;
    $isOwner = $viewerUserId > 0 && ((int) $tournament['owner_user_id'] === $viewerUserId || currentUserIsSuperuser());
    $directTournamentContext = isset($_GET['id']) || isset($_GET['sid']) || isset($_GET['session']) || isset($_GET['tournamentId']);
    $shareUrl = buildTournamentPublicUrl($sessionId);
    $joinUrl = $shareUrl . '&join=1';

    $members = [];
    if ($isOwner) {
        $membersStmt = $pdo->prepare(
            'SELECT user_email, created_at
             FROM pool_scheduler_tournament_members
             WHERE tournament_id = :tournament_id
             ORDER BY created_at ASC, user_email ASC'
        );
        $membersStmt->execute([':tournament_id' => $sessionId]);
        $members = array_map(static function (array $row): array {
            return [
                'email' => (string) $row['user_email'],
                'joinedAt' => (string) $row['created_at'],
            ];
        }, $membersStmt->fetchAll());
    }

    respond([
        'ok' => true,
        'tournament' => [
            'id' => (string) $tournament['tournament_id'],
            'name' => (string) $tournament['tournament_name'],
            'location' => (string) ($tournament['tournament_location'] ?? ''),
            'musterAt' => $musterAt,
            'accessCode' => (string) $tournament['access_code'],
            'isPublic' => ((int) $tournament['is_public']) === 1,
            'publicExpiresAt' => $tournament['public_expires_at'] === null ? '' : (string) $tournament['public_expires_at'],
            'hidden' => ((int) $tournament['is_hidden']) === 1,
            'isOwner' => $isOwner,
            'joinCount' => $joinCount,
            'hasJoined' => $hasJoined,
            'joinWindowOpen' => $joinWindowOpen,
            'canJoin' => $joinWindowOpen && isUserLoggedIn() && !$isOwner && ($isPublic || $directTournamentContext),
            'shareUrl' => $shareUrl,
            'joinUrl' => $joinUrl,
            'members' => $members,
            'createdAt' => (string) $tournament['created_at'],
            'updatedAt' => (string) $tournament['updated_at'],
        ],
    ]);
}

if ($action === 'join-tournament') {
    if (!isUserLoggedIn()) {
        respond([
            'ok' => false,
            'error' => 'Log in to add yourself to this tournament.',
        ], 403);
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        respond([
            'ok' => false,
            'error' => 'Join requests must use POST.',
        ], 405);
    }

    $tournamentStmt = $pdo->prepare(
        'SELECT tournament_id, owner_user_id, tournament_name, tournament_location, muster_at
         FROM pool_scheduler_tournaments
         WHERE tournament_id = :tournament_id AND is_deleted = 0'
    );
    $tournamentStmt->execute([':tournament_id' => $sessionId]);
    $tournament = $tournamentStmt->fetch();

    if (!$tournament) {
        respond([
            'ok' => false,
            'error' => 'Tournament not found.',
        ], 404);
    }

    if (!currentUserIsSuperuser() && (int) $tournament['owner_user_id'] === currentUserId()) {
        respond([
            'ok' => false,
            'error' => 'You already own this tournament.',
        ], 400);
    }

    $musterAt = $tournament['muster_at'] === null ? '' : (string) $tournament['muster_at'];
    $musterTimestamp = $musterAt !== '' ? strtotime($musterAt) : false;
    if ($musterTimestamp !== false && $musterTimestamp <= time()) {
        respond([
            'ok' => false,
            'error' => 'This tournament is no longer open for self-joining.',
        ], 400);
    }

    $isPublic = ((int) $tournament['is_public']) === 1;
    $directTournamentContext = isset($_GET['id']) || isset($_GET['sid']) || isset($_GET['session']) || isset($_GET['tournamentId']);
    if (!$isPublic && !$directTournamentContext) {
        respond([
            'ok' => false,
            'error' => 'This tournament is not available for self-joining from the public list.',
        ], 403);
    }

    $alreadyJoinedStmt = $pdo->prepare('SELECT 1 FROM pool_scheduler_tournament_members WHERE tournament_id = :tournament_id AND user_id = :user_id LIMIT 1');
    $alreadyJoinedStmt->execute([
        ':tournament_id' => $sessionId,
        ':user_id' => currentUserId(),
    ]);
    $alreadyJoined = $alreadyJoinedStmt->fetch() !== false;

    if (!$alreadyJoined) {
        $insertStmt = $pdo->prepare(
            'INSERT INTO pool_scheduler_tournament_members (tournament_id, user_id, user_email)
             VALUES (:tournament_id, :user_id, :user_email)
             ON DUPLICATE KEY UPDATE user_email = VALUES(user_email), updated_at = CURRENT_TIMESTAMP'
        );
        $insertStmt->execute([
            ':tournament_id' => $sessionId,
            ':user_id' => currentUserId(),
            ':user_email' => currentUserEmail(),
        ]);
    }

    $inviteEmail = sanitizeEmail(currentUserEmail());
    if ($inviteEmail !== '') {
        $inviteUpdateStmt = $pdo->prepare(
            'UPDATE pool_scheduler_tournament_invites
             SET status = :status, accepted_at = COALESCE(accepted_at, NOW()), updated_at = CURRENT_TIMESTAMP
             WHERE tournament_id = :tournament_id AND user_email = :user_email'
        );
        $inviteUpdateStmt->execute([
            ':status' => 'accepted',
            ':tournament_id' => $sessionId,
            ':user_email' => $inviteEmail,
        ]);
    }

    $joinCountStmt = $pdo->prepare('SELECT COUNT(*) FROM pool_scheduler_tournament_members WHERE tournament_id = :tournament_id');
    $joinCountStmt->execute([':tournament_id' => $sessionId]);

    respond([
        'ok' => true,
        'alreadyJoined' => $alreadyJoined,
        'joinCount' => (int) $joinCountStmt->fetchColumn(),
        'message' => $alreadyJoined ? 'You are already on this tournament list.' : 'You have been added to this tournament.',
        'tournament' => [
            'id' => (string) $tournament['tournament_id'],
            'name' => (string) $tournament['tournament_name'],
            'location' => (string) ($tournament['tournament_location'] ?? ''),
            'musterAt' => $musterAt,
        ],
    ]);
}

if ($action === 'remove-tournament-member') {
    if (!isUserLoggedIn()) {
        respond([
            'ok' => false,
            'error' => 'Log in to remove yourself from this tournament.',
        ], 403);
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        respond([
            'ok' => false,
            'error' => 'Remove requests must use POST.',
        ], 405);
    }

    $tournamentStmt = $pdo->prepare(
        'SELECT tournament_id, owner_user_id, tournament_name
         FROM pool_scheduler_tournaments
         WHERE tournament_id = :tournament_id AND is_deleted = 0'
    );
    $tournamentStmt->execute([':tournament_id' => $sessionId]);
    $tournament = $tournamentStmt->fetch();

    if (!$tournament) {
        respond([
            'ok' => false,
            'error' => 'Tournament not found.',
        ], 404);
    }

    if (!currentUserIsSuperuser() && (int) $tournament['owner_user_id'] === currentUserId()) {
        respond([
            'ok' => false,
            'error' => 'The owner cannot be removed from their own tournament.',
        ], 400);
    }

    $deleteStmt = $pdo->prepare(
        'DELETE FROM pool_scheduler_tournament_members WHERE tournament_id = :tournament_id AND user_id = :user_id'
    );
    $deleteStmt->execute([
        ':tournament_id' => $sessionId,
        ':user_id' => currentUserId(),
    ]);

    $inviteEmail = sanitizeEmail(currentUserEmail());
    if ($inviteEmail !== '') {
        $inviteUpdateStmt = $pdo->prepare(
            'UPDATE pool_scheduler_tournament_invites
             SET status = :status, updated_at = CURRENT_TIMESTAMP
             WHERE tournament_id = :tournament_id AND user_email = :user_email'
        );
        $inviteUpdateStmt->execute([
            ':status' => 'removed',
            ':tournament_id' => $sessionId,
            ':user_email' => $inviteEmail,
        ]);
    }

    $removed = (int) $deleteStmt->rowCount() > 0;

    $joinCountStmt = $pdo->prepare('SELECT COUNT(*) FROM pool_scheduler_tournament_members WHERE tournament_id = :tournament_id');
    $joinCountStmt->execute([':tournament_id' => $sessionId]);

    respond([
        'ok' => true,
        'removed' => $removed,
        'joinCount' => (int) $joinCountStmt->fetchColumn(),
        'message' => $removed ? 'You have been removed from this tournament.' : 'You were not on this tournament list.',
        'tournament' => [
            'id' => (string) $tournament['tournament_id'],
            'name' => (string) $tournament['tournament_name'],
        ],
    ]);
}

if ($action === 'send-tournament-invites') {
    if (!isUserLoggedIn()) {
        respond([
            'ok' => false,
            'error' => 'Log in to send tournament invitations.',
        ], 403);
    }

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        respond([
            'ok' => false,
            'error' => 'Invitation requests must use POST.',
        ], 405);
    }

    if (!function_exists('mail')) {
        respond([
            'ok' => false,
            'error' => 'Email sending is not available on this server.',
        ], 500);
    }

    $allowInvites = readSiteSetting($pdo, 'allow_invites', true);
    if (!$allowInvites) {
        respond([
            'ok' => false,
            'error' => 'Invites are currently disabled by the administrator.',
        ], 403);
    }

    $body = readJsonBody();
    $recipients = parseInviteRecipients($body['recipients'] ?? ($body['emailsText'] ?? null));
    if (count($recipients) < 1) {
        respond([
            'ok' => false,
            'error' => 'Enter at least one valid email address.',
        ], 400);
    }
    if (count($recipients) > 100) {
        respond([
            'ok' => false,
            'error' => 'Please send to 100 email addresses or fewer at a time.',
        ], 400);
    }

    $tournamentStmt = $pdo->prepare(
        'SELECT tournament_id, owner_user_id, tournament_name, tournament_location, muster_at, access_code
         FROM pool_scheduler_tournaments
         WHERE tournament_id = :tournament_id AND is_deleted = 0'
    );
    $tournamentStmt->execute([':tournament_id' => $sessionId]);
    $tournament = $tournamentStmt->fetch();

    if (!$tournament || (int) $tournament['owner_user_id'] !== currentUserId()) {
        respond([
            'ok' => false,
            'error' => 'Tournament not found.',
        ], 404);
    }

    $tournamentName = (string) $tournament['tournament_name'];
    $location = trim((string) ($tournament['tournament_location'] ?? ''));
    $musterAt = $tournament['muster_at'] === null ? '' : (string) $tournament['muster_at'];
    $inviteExpiresAt = calculateInviteExpiresAt($musterAt);
    $subject = "Tournament invite: {$tournamentName}";

    $inviteInsertStmt = $pdo->prepare(
        'INSERT INTO pool_scheduler_tournament_invites (tournament_id, user_email, invite_token, status, expires_at)
         VALUES (:tournament_id, :user_email, :invite_token, :status, :expires_at)
         ON DUPLICATE KEY UPDATE invite_token = COALESCE(invite_token, VALUES(invite_token)), expires_at = VALUES(expires_at), updated_at = CURRENT_TIMESTAMP'
    );

    $host = preg_replace('/:\d+$/', '', (string) ($_SERVER['HTTP_HOST'] ?? 'localhost')) ?: 'localhost';
    $host = preg_replace('/^www\./i', '', $host) ?: 'localhost';
    $fromAddress = "noreply@{$host}";
    $headers = [
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        "From: Pool Scheduler <{$fromAddress}>",
    ];
    if (currentUserEmail() !== '') {
        $headers[] = 'Reply-To: ' . currentUserEmail();
    }
    $headersText = implode("\r\n", $headers);

    $sent = [];
    $failed = [];
    foreach ($recipients as $recipient) {
        $inviteToken = generateInviteToken();
        $inviteInsertStmt->execute([
            ':tournament_id' => $sessionId,
            ':user_email' => $recipient,
            ':invite_token' => $inviteToken,
            ':status' => 'pending',
            ':expires_at' => $inviteExpiresAt,
        ]);
        $recipientShareUrl = buildTournamentPublicUrl($sessionId, null, $inviteToken) . '&join=1';
        $detailLines = [
            "Tournament: {$tournamentName}",
            'Muster: ' . ($musterAt !== '' ? $musterAt : 'To be confirmed'),
            'Club: ' . ($location !== '' ? $location : 'To be confirmed'),
            'Code: ' . (string) $tournament['access_code'],
            '',
            'Open / join link:',
            $recipientShareUrl,
            '',
            'Log in or sign up and the link will let you add yourself before muster time.',
        ];
        $messageText = implode("\n", $detailLines);
        $sentOk = mail($recipient, $subject, $messageText, $headersText);
        if ($sentOk) {
            $sent[] = $recipient;
        } else {
            $failed[] = $recipient;
        }
    }

    if (count($sent) < 1) {
        respond([
            'ok' => false,
            'error' => 'The server could not send those invitations.',
            'failedRecipients' => $failed,
        ], 500);
    }

    respond([
        'ok' => true,
        'sentCount' => count($sent),
        'failedCount' => count($failed),
        'sentRecipients' => $sent,
        'failedRecipients' => $failed,
    ]);
}

if ($action === 'get') {
    $stmt = $pdo->prepare('SELECT state_json, updated_at FROM pool_scheduler_sessions WHERE session_id = :session_id');
    $stmt->execute([
        ':session_id' => $sessionId,
    ]);
    $row = $stmt->fetch();

    if (!$row) {
        // If no session state found, try to load from tournament state
        $tournamentStmt = $pdo->prepare('SELECT state_json, updated_at FROM pool_scheduler_tournaments WHERE tournament_id = :tournament_id AND is_deleted = 0');
        $tournamentStmt->execute([
            ':tournament_id' => $sessionId,
        ]);
        $tournamentRow = $tournamentStmt->fetch();
        
        if (!$tournamentRow) {
            respond([
                'ok' => true,
                'state' => null,
                'updatedAt' => '',
            ]);
        }
        
        $state = json_decode((string) $tournamentRow['state_json'], true);
        if (!is_array($state)) {
            respond([
                'ok' => true,
                'state' => null,
                'updatedAt' => '',
            ]);
        }
        
        respond([
            'ok' => true,
            'state' => $state,
            'updatedAt' => (string) $tournamentRow['updated_at'],
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

    $tournamentStateStmt = $pdo->prepare(
        'UPDATE pool_scheduler_tournaments
         SET state_json = :state_json, updated_at = CURRENT_TIMESTAMP
         WHERE tournament_id = :tournament_id AND is_deleted = 0'
    );
    $tournamentStateStmt->execute([
        ':state_json' => $stateJson,
        ':tournament_id' => $sessionId,
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
