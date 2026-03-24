const express = require('express');
const os = require('os');
const path = require('path');
const dns = require('dns').promises;

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

function normalizeAddress(address) {
  if (!address) return null;
  if (address.startsWith('::ffff:')) return address.replace('::ffff:', '');
  return address;
}

function inferFamily(address) {
  if (!address) return 'Desconocido';
  if (address.includes(':')) return 'IPv6';
  if (address.includes('.')) return 'IPv4';
  return 'Desconocido';
}

function getServerAddresses() {
  const nets = os.networkInterfaces();
  const results = [];
  for (const [name, addrs] of Object.entries(nets)) {
    for (const item of addrs || []) {
      if (item.internal) continue;
      results.push({
        interface: name,
        family: item.family,
        address: item.address,
        cidr: item.cidr,
      });
    }
  }
  return results;
}

app.get('/api/config', (_req, res) => {
  res.json({
    appName: 'Test_Servicios',
    notes: {
      localMode: 'En local puedes validar interfaz, backend y lógica. Para pruebas IPv6 externas completas necesitas publicar el sitio en un servidor con IPv4, IPv6 y DNS adecuado.'
    }
  });
});

app.get('/api/ip', (req, res) => {
  const forwarded = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const candidate = normalizeAddress(forwarded || req.socket.remoteAddress || '');
  res.json({
    ip: candidate,
    family: inferFamily(candidate),
    userAgent: req.headers['user-agent'] || '',
    host: req.headers.host,
    protocol: req.protocol,
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'test-servicios',
    now: new Date().toISOString(),
    serverAddresses: getServerAddresses(),
  });
});

app.get('/api/ping', (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

app.get('/api/large-payload', (req, res) => {
  const requestedMb = Number(req.query.mb || 2);
  const sizeBytes = Math.min(Math.max(1, requestedMb), 5) * 1024 * 1024;
  const payload = 'X'.repeat(sizeBytes);
  res.json({ ok: true, bytes: Buffer.byteLength(payload) });
});

app.get('/api/speed-payload', (_req, res) => {
  const sizeBytes = 5 * 1024 * 1024;
  const payload = Buffer.alloc(sizeBytes, 'a');
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  res.send(payload);
});

app.get('/api/domain-check', async (req, res) => {
  const domain = String(req.query.domain || '').trim().toLowerCase();
  if (!domain) {
    res.status(400).json({ error: 'Debes indicar un dominio.' });
    return;
  }

  const output = { domain, aRecords: [], aaaaRecords: [], errors: [] };

  try {
    output.aRecords = await dns.resolve4(domain);
  } catch (error) {
    output.errors.push(`A: ${error.code || 'sin registros'}`);
  }

  try {
    output.aaaaRecords = await dns.resolve6(domain);
  } catch (error) {
    output.errors.push(`AAAA: ${error.code || 'sin registros'}`);
  }

  res.json(output);
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Test_Servicios running on http://${HOST}:${PORT}`);
});
