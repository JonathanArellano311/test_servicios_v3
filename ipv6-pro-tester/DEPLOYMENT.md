# Test_Servicios - Guía de Deployment

## Requisitos
- Node.js v18+
- npm o yarn
- Git (para syncing automático)

## Instalación Local

```bash
git clone <TU_REPO_URL>
cd ipv6-pro-tester
npm install
npm run dev
```

Luego accede a `http://localhost:3000`

## Instalación en Producción (Proxmox)

### 1. En el servidor
```bash
cd /opt
git clone <TU_REPO_URL>
cd ipv6-pro-tester
npm install
npm run start
```

### 2. Con PM2 (recomendado para mantener el servidor activo)
```bash
npm install -g pm2
pm2 start server/index.js --name "test-servicios"
pm2 startup
pm2 save
```

### 3. Con webhook para auto-update
En el servidor, crea `/opt/webhook-deploy.sh`:
```bash
#!/bin/bash
cd /opt/ipv6-pro-tester
git pull origin main
npm install --production
pm2 restart test-servicios
```

Luego configura el webhook en GitHub → Settings → Webhooks → Payload URL

## Configuración de firewall
- Abre puerto 3000 (o el que uses)
- Para HTTPS, usa nginx como reverse proxy con Let's Encrypt

## Nginx recomendado para dominio/IP pública

Si el dominio funciona pero `http://200.59.191.176` devuelve `404`, revisa que Nginx tenga un bloque `server` para el dominio y, si quieres responder por IP directa, otro bloque `default_server`.

Ejemplo para el dominio:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name tu-dominio.com www.tu-dominio.com;

    client_max_body_size 100m;
    proxy_request_buffering off;
    proxy_buffering off;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Para que la IP pública directa también abra la app:

```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    client_max_body_size 100m;
    proxy_request_buffering off;
    proxy_buffering off;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Después de editar:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Variables de entorno (si las necesitas después)
Crea `.env`:
```
PORT=3000
HOST=0.0.0.0
MAX_SPEED_PAYLOAD_MB=64
```

## Monitoreo
```bash
pm2 logs test-servicios
pm2 status
```
