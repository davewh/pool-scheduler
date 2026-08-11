CREATE TABLE IF NOT EXISTS pool_scheduler_users (
    user_id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(190) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_superuser TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_pool_scheduler_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pool_scheduler_sessions (
    session_id VARCHAR(40) NOT NULL PRIMARY KEY,
    state_json LONGTEXT NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pool_scheduler_tournaments (
    tournament_id VARCHAR(40) NOT NULL PRIMARY KEY,
    owner_user_id INT UNSIGNED NULL,
    tournament_name VARCHAR(200) NOT NULL,
    tournament_location VARCHAR(200) NOT NULL DEFAULT '',
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pool_scheduler_tournament_members (
    tournament_id VARCHAR(40) NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    user_email VARCHAR(190) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (tournament_id, user_id),
    KEY idx_pool_scheduler_tournament_members_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pool_scheduler_tournament_invites (
    invite_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    tournament_id VARCHAR(40) NOT NULL,
    user_email VARCHAR(190) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    expires_at DATETIME NULL,
    accepted_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_pool_scheduler_tournament_invites_tournament_user (tournament_id, user_email),
    KEY idx_pool_scheduler_tournament_invites_user_email (user_email),
    KEY idx_pool_scheduler_tournament_invites_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
