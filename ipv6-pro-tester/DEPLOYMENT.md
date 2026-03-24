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

## Variables de entorno (si las necesitas después)
Crea `.env`:
```
PORT=3000
HOST=0.0.0.0
```

## Monitoreo
```bash
pm2 logs test-servicios
pm2 status
```
