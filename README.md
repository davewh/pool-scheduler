# Pool Scheduler

Pool tournament scheduler for clubs with:

- configurable teams, tables, and match times
- random draw with re-draw before lock
- optional 2-pool split mode
- live match board with auto table dispatch
- queue, games, stats, and settings tabs
- multi-screen sync using PHP + MySQL session storage

## Hosting fit for Crazy Domains

Your Crazy Domains Linux hosting is a good fit for this version because it advertises:

- PHP
- MySQL databases
- phpMyAdmin
- cPanel
- 1-click app installer
- FTP and SSH access
- multiple PHP versions

That makes **PHP + MySQL** the safest shared-hosting backend for live sync.

## Project structure

- [index.html](./index.html) - public tournament portal
- [admin/index.html](./admin/index.html) - admin login and tournament management
- [script.js](./script.js) - client logic
- [api.php](./api.php) - shared-state API
- [config.sample.php](./config.sample.php) - production DB config template
- [config.pool_test.sample.php](./config.pool_test.sample.php) - test DB config template for `/pool_test`
- [public/schema.sql](./public/schema.sql) - MySQL table schema (optional manual import)

## How live sync works

When the draw is locked, the app creates a session ID in the URL:

```text
https://your-site.example/?id=AB12CD34
```

Every screen using that same URL reads and writes the same tournament state through `api.php`.

## Crazy Domains deployment

### 1. Create a MySQL database

In Crazy Domains / cPanel:

1. Create a database
2. Create a database user
3. Assign the user to the database
4. Note the host, database name, username, and password

### 2. Upload the website files

Upload the project files into each server folder you want to run:

- `public_html/pool/` (live)
- `public_html/pool_test/` (testing)

Both folders should contain the same app files, including [admin/](./admin/), [index.html](./index.html), [script.js](./script.js), and [api.php](./api.php).

### 3. Create SQL configs (live + test)

In each deployed folder:

- copy [config.sample.php](./config.sample.php) to `config.php` for live SQL
- copy [config.pool_test.sample.php](./config.pool_test.sample.php) to `config.pool_test.php` for test SQL

Fill each file with the matching database credentials:

```php
<?php
return [
    'db' => [
        'host' => 'localhost',
        'port' => 3306,
        'name' => 'your_database_name',
        'user' => 'your_database_user',
        'pass' => 'your_database_password',
        'charset' => 'utf8mb4',
    ],
];
```

When the app runs under a `/pool_test` path, [api.php](./api.php) will prefer `config.pool_test.php`; otherwise it uses `config.php`.

### 4. Create the table

Either:

- import [public/schema.sql](./public/schema.sql) in phpMyAdmin, or
- just open `api.php` once and let it auto-create the table

### 5. Open the site

Example:

```text
https://your-site.example/pool/
https://your-site.example/pool_test/
```

Lock a draw, then share the session link shown in the Settings tab or top bar.

## Local use

### No hosting / no sync

You can still open the HTML file directly in a browser for single-screen local use.

### With PHP locally

If you have PHP installed:

```bash
php -S localhost:8000
```

Then open:

```text
http://localhost:8000/
```

## Notes

- `config.php` and `config.pool_test.php` are intentionally gitignored
- shared hosting usually does **not** support a persistent Node/WebSocket process
- polling is used instead of WebSockets so it works on standard PHP hosting
