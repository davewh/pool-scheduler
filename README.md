# Pool Scheduler

A live pool tournament scheduler for clubs. Supports round-robin draws, split-pool mode, live table dispatch, and multi-computer sync via WebSockets.

## Running locally

```bash
npm install
npm start
# Open http://localhost:3000
```

## Deploying to Linux server (aitrax.co.nz)

```bash
# On the server
git clone https://github.com/davewh/pool-scheduler.git
cd pool-scheduler
npm install
npm start
```

To run as a background service with PM2:

```bash
npm install -g pm2
pm2 start server.js --name pool-scheduler
pm2 save
pm2 startup   # follow the printed command to auto-start on reboot
```

The server listens on port 3000 by default. To use a different port:

```bash
PORT=8080 npm start
```

### Nginx reverse proxy (optional — serve on port 80)

```nginx
server {
    listen 80;
    server_name aitrax.co.nz;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

## Multi-computer sync

Once the draw is locked, a **Session ID** appears at the top of the Live Board. Open the same URL with `?id=XXXXXX` on any computer on the same network — it will automatically sync to the same live tournament state.
