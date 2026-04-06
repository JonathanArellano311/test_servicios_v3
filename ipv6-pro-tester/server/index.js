const express = require('express');
const os = require('os');
const path = require('path');
const net = require('net');
const dns = require('dns').promises;
const { spawn } = require('child_process');
let rateLimit;
let kill;

try {
  rateLimit = require('express-rate-limit');
} catch (_error) {
  console.warn('[Startup] express-rate-limit no esta instalado. Se desactiva el rate limiting localmente.');
  rateLimit = () => (_req, _res, next) => next();
}

try {
  kill = require('tree-kill');
} catch (_error) {
  console.warn('[Startup] tree-kill no esta instalado. Se usa process.kill como respaldo local.');
  kill = (pid, _signal, callback) => {
    try {
      process.kill(pid);
      callback?.(null);
    } catch (error) {
      callback?.(error);
    }
  };
}

const app = express();
app.set('trust proxy', 1); // Confiar en 1 nivel de proxy (Nginx)
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Buffer pre-procesado: Esto evita alocar 5MB de RAM en cada petición concurrente a la prueba de velocidad
const STATIC_SPEED_BUFFER = Buffer.alloc(5 * 1024 * 1024, 'a');
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const heavyLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // Ventana de 1 minuto
  max: 20, // Máximo 20 peticiones por ventana
  message: { error: 'Límite de peticiones excedido. Intenta de nuevo en un minuto.' }
});

// Aplicamos el limitador a las rutas que consumen CPU, Memoria o Tráfico
app.use('/api/large-payload', heavyLimiter);
app.use('/api/speed-payload', heavyLimiter);
app.use('/api/network-tool/stream', heavyLimiter);

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

function expandIpv6(address) {
  const lowered = String(address || '').toLowerCase();
  const zoneIndex = lowered.indexOf('%');
  const clean = zoneIndex >= 0 ? lowered.slice(0, zoneIndex) : lowered;
  const [left = '', right = ''] = clean.split('::');
  const leftParts = left ? left.split(':').filter(Boolean) : [];
  const rightParts = right ? right.split(':').filter(Boolean) : [];

  if (leftParts.length + rightParts.length > 8) return null;

  const missing = 8 - (leftParts.length + rightParts.length);
  const middle = new Array(missing).fill('0');
  const full = [...leftParts, ...middle, ...rightParts].map((part) => part.padStart(4, '0'));
  return full.length === 8 ? full.join('') : null;
}

async function resolveAsnForIp(ipAddress) {
  const family = net.isIP(ipAddress);
  if (!family) return null;

  let originHost = '';
  if (family === 4) {
    originHost = `${ipAddress.split('.').reverse().join('.')}.origin.asn.cymru.com`;
  } else {
    const expanded = expandIpv6(ipAddress);
    if (!expanded) return null;
    originHost = `${expanded.split('').reverse().join('.')}.origin6.asn.cymru.com`;
  }

  const originTxtRecords = await dns.resolveTxt(originHost);
  const originLine = (originTxtRecords?.[0] || []).join('');
  const originParts = originLine.split('|').map((item) => item.trim());
  const asnRaw = originParts[0] || '';
  const asnPrimary = asnRaw.split(/\s+/)[0];
  if (!asnPrimary || !/^\d+$/.test(asnPrimary)) return null;

  const asnHost = `AS${asnPrimary}.asn.cymru.com`;
  let owner = '';
  try {
    const asnTxtRecords = await dns.resolveTxt(asnHost);
    const asnLine = (asnTxtRecords?.[0] || []).join('');
    const asnParts = asnLine.split('|').map((item) => item.trim());
    owner = asnParts[4] || '';
  } catch (_error) {
    // Algunos resolvers no permiten TXT de owner; mantenemos ASN parcial.
  }

  return {
    asn: `AS${asnPrimary}`,
    prefix: originParts[1] || '',
    countryCode: originParts[2] || '',
    registry: originParts[3] || '',
    allocatedAt: originParts[4] || '',
    owner,
  };
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
      // -4 fuerza IPv4 en Linux: evita que el kernel prefiera IPv6 cuando el VPS
      // tiene interfaces IPv6 pero sin routing saliente hacia Internet.
      args = count === null ? ['-4', target] : ['-4', '-c', String(count), target];
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
    // -4 fuerza IPv4 en traceroute por la misma razón que en ping.
    args = ['-4', '-n', '-m', String(maxHops), target];
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
  const forwardedChain = String(req.headers['x-forwarded-for'] || '')
    .split(',')
    .map((item) => normalizeAddress(item.trim()))
    .filter(Boolean);
  const socketAddress = normalizeAddress(req.socket.remoteAddress || '');
  const candidate = normalizeAddress(req.ip || forwardedChain[0] || socketAddress || '');
  console.log('[API] GET /api/ip ->', candidate);
  res.json({
    ip: candidate,
    family: inferFamily(candidate),
    forwardedFor: forwardedChain,
    remoteAddress: socketAddress,
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
  
  // Ya no generamos strings gigantescos al aire, ahorrando RAM drásticamente
  res.json({ ok: true, bytes: sizeBytes });
});

app.get('/api/speed-payload', (_req, res) => {
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  // Servimos estáticamente el mismo payload pre-cargado
  res.send(STATIC_SPEED_BUFFER);
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
    if (child.exitCode === null && !child.killed) {
      kill(child.pid, 'SIGKILL', (err) => {
        if (err) console.error(`[Seguridad] Error destruyendo proceso hijo zombi: ${err}`);
      });
    }
  });
});

app.get('/api/domain-check', async (req, res) => {
  const rawInput = String(req.query.domain || req.query.target || '').trim();
  const target = normalizeTarget(rawInput);
  if (!target) {
    res.status(400).json({ error: 'Debes indicar un dominio, IP o URL valida.' });
    return;
  }

  // Codigos que indican "sin registros" (esperado, no son errores reales).
  const NO_RECORD_CODES = new Set(['ENODATA', 'ENOTFOUND', 'ENONAME']);
  const normalizedTarget = target.toLowerCase();
  const isIp = Boolean(net.isIP(normalizedTarget));

  const output = {
    input: rawInput,
    target: normalizedTarget,
    type: isIp ? 'ip' : 'domain',
    aRecords: [],
    aaaaRecords: [],
    ptrRecords: [],
    asn: null,
    warnings: [],
    errors: [],
  };

  if (isIp) {
    if (net.isIP(normalizedTarget) === 4) output.aRecords = [normalizedTarget];
    if (net.isIP(normalizedTarget) === 6) output.aaaaRecords = [normalizedTarget];

    try {
      output.ptrRecords = await dns.reverse(normalizedTarget);
    } catch (error) {
      if (NO_RECORD_CODES.has(error.code)) {
        output.warnings.push('PTR: sin registros de host reverso');
      } else {
        output.errors.push(`PTR: ${error.code || error.message}`);
      }
    }

    try {
      output.asn = await resolveAsnForIp(normalizedTarget);
      if (!output.asn) output.warnings.push('ASN: no se pudo determinar');
    } catch (error) {
      output.errors.push(`ASN: ${error.code || error.message}`);
    }
  } else {
    try {
      output.aRecords = await dns.resolve4(normalizedTarget);
    } catch (error) {
      if (NO_RECORD_CODES.has(error.code)) {
        output.warnings.push('IPv4 (A): sin registros');
      } else {
        output.errors.push(`A: ${error.code || error.message}`);
      }
    }

    try {
      output.aaaaRecords = await dns.resolve6(normalizedTarget);
    } catch (error) {
      if (NO_RECORD_CODES.has(error.code)) {
        output.warnings.push('IPv6 (AAAA): sin registros');
      } else {
        output.errors.push(`AAAA: ${error.code || error.message}`);
      }
    }
  }

  res.json(output);
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`Test_Servicios running on http://${HOST}:${PORT}`);
});

