<?php
declare(strict_types=1);

return [
    'environments' => [
        'local' => [
            'db' => [
                'host' => 'localhost',
                'port' => 3306,
                'name' => 'pool_live_local',
                'user' => 'root',
                'pass' => '',
                'charset' => 'utf8mb4',
            ],
        ],
        'local_test' => [
            'db' => [
                'host' => 'localhost',
                'port' => 3306,
                'name' => 'pool_test_local',
                'user' => 'root',
                'pass' => '',
                'charset' => 'utf8mb4',
            ],
        ],
        'live' => [
            'db' => [
                'host' => 'localhost',
                'port' => 3306,
                'name' => 'your_live_database_name',
                'user' => 'your_live_database_user',
                'pass' => 'your_live_database_password',
                'charset' => 'utf8mb4',
            ],
        ],
        'live_test' => [
            'db' => [
                'host' => 'localhost',
                'port' => 3306,
                'name' => 'your_live_test_database_name',
                'user' => 'your_live_test_database_user',
                'pass' => 'your_live_test_database_password',
                'charset' => 'utf8mb4',
            ],
        ],
    ],
];
