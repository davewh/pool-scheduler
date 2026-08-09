# Pool Scheduler local setup (XAMPP + Apache + MySQL)

This file is a short reminder for how to run this project locally on Windows.

## Goal

Run the same project in two local URLs:

- `http://localhost/pool-scheduler/` -> uses `config.php` and the live DB
- `http://localhost/pool_test/` -> uses `config.pool_test.php` and the test DB

The project lives in:

- `D:\python\pool-scheduler`

## 1) Install and start tools

Install XAMPP (or equivalent) with:

- Apache
- MySQL

Then start these in XAMPP Control Panel:

- Apache
- MySQL

## 2) Create the local databases in phpMyAdmin

Open:

- `http://localhost/phpmyadmin/`

Run this SQL:

```sql
CREATE DATABASE pool_live_local CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE pool_test_local CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

## 3) Create the config files

In `D:\python\pool-scheduler`, create these files:

- `config.php`
- `config.pool_test.php`

Use these values for local XAMPP:

### `config.php`

```php
<?php
declare(strict_types=1);

return [
    'db' => [
        'host' => 'localhost',
        'port' => 3306,
        'name' => 'pool_live_local',
        'user' => 'root',
        'pass' => '',
        'charset' => 'utf8mb4',
    ],
];
```

### `config.pool_test.php`

```php
<?php
declare(strict_types=1);

return [
    'db' => [
        'host' => 'localhost',
        'port' => 3306,
        'name' => 'pool_test_local',
        'user' => 'root',
        'pass' => '',
        'charset' => 'utf8mb4',
    ],
];
```

## 4) Make Apache serve the project without copying files

The easiest way is to create junctions from XAMPP's web root to the project folder.

Run this in PowerShell as Administrator:

```powershell
cmd /c mklink /J "C:\xampp\htdocs\pool-scheduler" "D:\python\pool-scheduler"
cmd /c mklink /J "C:\xampp\htdocs\pool_test" "D:\python\pool-scheduler"
```

If the folder already exists, remove it first or use a different name.

### Permanent vs temporary

A junction is permanent on your Windows machine. It stays in place until you remove it.

You do not need to recreate it every time you open the project.

### Remove the junction later

If you want to undo it:

```powershell
rmdir "C:\xampp\htdocs\pool-scheduler"
rmdir "C:\xampp\htdocs\pool_test"
```

If you created a junction for a different target path, replace the path above with the one you used.

## 5) Open the app locally

Use these URLs:

- `http://localhost/pool-scheduler/`
- `http://localhost/pool_test/`

## 6) What happens if something breaks

### If `localhost` does not load

Check that:

- Apache is running in XAMPP
- the junctions exist in `C:\xampp\htdocs`

### If the app shows a DB error

Check that:

- the database names are correct
- the MySQL user is `root`
- the password is blank (`''`) for local XAMPP

### If you want to test from PHP's built-in server instead

You can also run:

```powershell
Set-Location D:\python
& "C:\xampp\php\php.exe" -S 127.0.0.1:8000
```

Then open:

- `http://127.0.0.1:8000/pool-scheduler/`
- `http://127.0.0.1:8000/pool_test/`

## 7) Performance optimization for mobile clients

The app is optimized for ~30 concurrent mobile users (phones) updating pool scores 1-2 times per minute.

### Browser caching

The `.htaccess` file caches static assets to make page navigation instant:

- **JavaScript & CSS**: cached for 30 days (no reload unless file changes)
- **HTML & PHP**: never cached (always fetch fresh content)
- **Gzip compression**: reduces file sizes by ~65%

### Poll optimization

The score polling has been tuned to reduce API load:

- **Poll interval**: every 5 seconds (instead of 3 seconds)
- **Result**: 30 users × 5s polling = 6 API calls/sec (instead of 10 calls/sec)
- **Trade-off**: users see score updates within 0–5 seconds (average ~2.5s)

This saves 40% on API bandwidth without noticeable impact on user experience.

## Summary

- Use XAMPP Apache + MySQL
- Create two local DBs: `pool_live_local` and `pool_test_local`
- Put the correct values in `config.php` and `config.pool_test.php`
- Serve the repo from `C:\xampp\htdocs` using junctions
- Open the app at `http://localhost/pool-scheduler/` and `http://localhost/pool_test/`
- Browser caching and poll tuning are automatically applied via `.htaccess` and `script.js`
