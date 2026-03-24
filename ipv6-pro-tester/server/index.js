const express = require('express');
const os = require('os');
const path = require('path');
const dns = require('dns').promises;
const fs = require('fs').promises;
const fsSync = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const DATA_FILE = path.join(__dirname, '..', 'data', 'results.json');
const DATA_DIR = path.join(__dirname, '..', 'data');

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Asegurar que existe el directorio de datos
async function ensureDataDir() {
  try {
    if (!fsSync.existsSync(DATA_DIR)) {
      fsSync.mkdirSync(DATA_DIR, { recursive: true });
    }
  } catch (error) {
    console.error('Error al crear directorio de datos:', error.message);
  }
}

// Cargar resultados guardados
async function loadResults() {
  try {
    if (fsSync.existsSync(DATA_FILE)) {
      const data = await fs.readFile(DATA_FILE, 'utf-8');
      return JSON.parse(data);
    }
    return [];
  } catch (error) {
    console.error('Error al cargar resultados:', error.message);
    return [];
  }
}

// Guardar resultado
async function saveResult(result) {
  try {
    await ensureDataDir();
    const results = await loadResults();
    result.id = Date.now();
    result.saveTime = new Date().toISOString();
    results.push(result);
    // Mantener solo los últimos 100 resultados
    if (results.length > 100) {
      results.shift();
    }
    await fs.writeFile(DATA_FILE, JSON.stringify(results, null, 2));
    return result;
  } catch (error) {
    console.error('Error al guardar resultado:', error.message);
    throw error;
  }
}

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

app.post('/api/results', async (req, res) => {
  try {
    const testData = req.body;
    const savedResult = await saveResult(testData);
    res.json({ ok: true, result: savedResult });
  } catch (error) {
    res.status(500).json({ error: 'Error al guardar resultado', details: error.message });
  }
});

app.get('/api/results', async (req, res) => {
  try {
    const results = await loadResults();
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener resultados', details: error.message });
  }
});

app.delete('/api/results/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    let results = await loadResults();
    results = results.filter((r) => r.id !== id);
    await fs.writeFile(DATA_FILE, JSON.stringify(results, null, 2));
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar resultado', details: error.message });
  }
});

app.delete('/api/results', async (req, res) => {
  try {
    await ensureDataDir();
    await fs.writeFile(DATA_FILE, JSON.stringify([], null, 2));
    res.json({ ok: true, message: 'Todos los resultados han sido eliminados' });
  } catch (error) {
    res.status(500).json({ error: 'Error al limpiar resultados', details: error.message });
  }
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Test_Servicios running on http://${HOST}:${PORT}`);
});
