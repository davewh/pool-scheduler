# Local Setup Troubleshooting Summary

## Current Status
- ? Performance optimizations committed (caching, poll interval tuning)  
- ? Authentication functions added to script.js
- ? Admin API wrapper created at admin/api.php
- ?? Apache + Junction issue: script.js not executing via localhost/pool-scheduler

## The Problem
When using Apache with Windows junction to D:\python\pool-scheduler:
- HTML files load correctly  
- script.js request returns 200 OK
- But browser doesn't execute the JavaScript code
- Appears to be Apache caching or path resolution issue with junctions

## The Workaround (Tested & Working)
Use PHP's built-in server instead of Apache:

`powershell
cd D:\python\pool-scheduler
C:\xampp\php\php.exe -S 127.0.0.1:8000
`

Then access:
- http://127.0.0.1:8000/admin/
- http://127.0.0.1:8000/

This works perfectly - script.js loads and executes immediately.

## What Works
- Login with username: admin, password: admin
- All pool scheduler functionality
- API endpoints responding
- Database connectivity

## Recommendation
For local development, use the PHP server instead of Apache + junction setup.
Apache + junctions may work with proper permissions/configuration, but PHP server is simpler and works immediately.

## Future Investigation
If Apache setup is needed:
1. Check Apache logs: C:\xampp\apache\logs\error.log
2. Verify junction permissions with: dir /L C:\xampp\htdocs\pool-scheduler
3. Try creating real directory copy instead of junction
4. Check Apache FollowSymlinks directive in httpd.conf
