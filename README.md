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

- [public/index.html](./public/index.html) - main app
- [public/styles.css](./public/styles.css) - styling
- [public/script.js](./public/script.js) - client logic
- [public/api.php](./public/api.php) - shared-state API
- [public/config.sample.php](./public/config.sample.php) - database config template
- [public/schema.sql](./public/schema.sql) - MySQL table schema

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

Upload the contents of [public/](./public/) into your site web root, typically `public_html`.

You should end up with files like:

```text
public_html/
  index.html
  styles.css
  script.js
  api.php
  config.php
```

### 3. Create config.php

Copy [public/config.sample.php](./public/config.sample.php) to `config.php` and fill in your MySQL details:

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

### 4. Create the table

Either:

- import [public/schema.sql](./public/schema.sql) in phpMyAdmin, or
- just open `api.php` once and let it auto-create the table

### 5. Open the site

Example:

```text
https://aitrax.co.nz/
```

Lock a draw, then share the session link shown in the Settings tab or top bar.

## Local use

### No hosting / no sync

You can still open the HTML file directly in a browser for single-screen local use.

### With PHP locally

If you have PHP installed:

```bash
cd public
php -S localhost:8000
```

Then open:

```text
http://localhost:8000/
```

## Notes

- `config.php` is intentionally gitignored
- shared hosting usually does **not** support a persistent Node/WebSocket process
- polling is used instead of WebSockets so it works on standard PHP hosting
