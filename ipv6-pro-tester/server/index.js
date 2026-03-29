const express = require('express');
const os = require('os');
const path = require('path');
const net = require('net');
const dns = require('dns').promises;
const { spawn } = require('child_process');

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

function normalizeTarget(input) {
  const raw = String(input || '').trim();
  if (!raw || raw.length > 255) return null;

  const ipv6Candidate = raw.replace(/^\[|\]$/g, '');
  if (net.isIP(ipv6Candidate) === 6) {
    return ipv6Candidate;
  }

  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;

  try {
    const parsed = new URL(candidate);
    return parsed.hostname || null;
  } catch (_error) {
    if (/^[a-z0-9.-]+$/i.test(raw)) {
      return raw.replace(/^\.+|\.+$/g, '');
    }
    return null;
  }
}

function buildNetworkCommand(tool, target, options = {}) {
  const isWin = os.platform() === 'win32';

  if (tool === 'ping') {
    const executable = isWin 
      ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'ping.exe')
      : 'ping';
      
    const count = options.infinite ? null : Math.min(Math.max(Number(options.count) || 4, 1), 999);
    
    let args = [];
    if (isWin) {
      args = count === null ? ['-t', target] : ['-n', String(count), target];
    } else {
      args = count === null ? [target] : ['-c', String(count), target];
    }
    
    return { executable, args };
  }

  // Si no es ping, asumimos tracert
  const executable = isWin 
    ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tracert.exe')
    : 'traceroute';
    
  const maxHops = Math.min(Math.max(Number(options.maxHops) || 12, 1), 30);
  
  let args = [];
  if (isWin) {
    args = ['-d', '-h', String(maxHops), target];
  } else {
    args = ['-n', '-m', String(maxHops), target];
  }
  
  return { executable, args };
}

app.get('/api/config', (_req, res) => {
  console.log('[API] GET /api/config');
  res.json({
    appName: 'Test_Servicios',
    notes: {
      localMode: 'En local puedes validar interfaz, backend, ping, tracert y lógica. Para pruebas IPv6 externas completas necesitas publicar el sitio en un servidor con IPv4, IPv6 y DNS adecuado.',
    },
  });
});

app.get('/api/ip', (req, res) => {
  const forwarded = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const candidate = normalizeAddress(forwarded || req.socket.remoteAddress || '');
  console.log('[API] GET /api/ip ->', candidate);
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
  console.log('[API] GET /api/health');
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

app.get('/api/network-tool/stream', (req, res) => {
  const tool = String(req.query.tool || '').trim().toLowerCase();
  const target = normalizeTarget(req.query.target);
  const infinite = String(req.query.infinite || '').toLowerCase() === 'true';
  const count = Number(req.query.count || 4);
  const maxHops = Number(req.query.maxHops || 12);

  if (!['ping', 'tracert'].includes(tool)) {
    res.status(400).json({ error: 'Debes indicar una herramienta válida: ping o tracert.' });
    return;
  }

  if (!target) {
    res.status(400).json({ error: 'Debes indicar un dominio, IP o URL válida.' });
    return;
  }

  const { executable, args } = buildNetworkCommand(tool, target, { infinite, count, maxHops });
  console.log(`[API] GET /api/network-tool/stream -> ${tool} ${target} ${args.join(' ')}`);

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Accel-Buffering', 'no');

  let child;
  try {
    child = spawn(executable, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    res.write(`[ERROR] No fue posible iniciar ${tool}: ${error.message}\n`);
    res.end();
    return;
  }

  let closed = false;
  const writeChunk = (chunk) => {
    if (!closed) {
      res.write(chunk);
    }
  };

  child.stdout.on('data', (chunk) => writeChunk(chunk));
  child.stderr.on('data', (chunk) => writeChunk(chunk));

  child.on('error', (error) => {
    writeChunk(`\n[ERROR] ${error.message}\n`);
    if (!closed) {
      closed = true;
      res.end();
    }
  });

  child.on('close', (code) => {
    writeChunk(`\n[Proceso finalizado con código ${code}]\n`);
    if (!closed) {
      closed = true;
      res.end();
    }
  });

  req.on('close', () => {
    closed = true;
    if (!child.killed) {
      child.kill();
    }
  });
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
