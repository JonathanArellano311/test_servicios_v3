const state = {
  config: null,
  ipInfo: null,
  health: null,
  scores: { ipv4: 0, ipv6: 0, readiness: 0 },
  packetRun: { active: false, stopRequested: false },
  environment: { isInternal: false, reason: '' },
  tests: [
    { id: 'visitor-ip', title: 'Detección de IP', details: 'Pendiente', status: 'pending' },
    { id: 'same-origin', title: 'Respuesta del servidor', details: 'Pendiente', status: 'pending' },
    { id: 'large-payload', title: 'Paquetes grandes', details: 'Pendiente', status: 'pending' },
    { id: 'stack-check', title: 'Compatibilidad IPv4 / IPv6', details: 'Pendiente', status: 'pending' },
  ]
};

const $ = (id) => document.getElementById(id);

function formatMs(value) {
  return `${Number(value || 0).toFixed(1)} ms`;
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function isPrivateIpv4(value) {
  if (!value || value.includes(':')) return false;
  return value.startsWith('10.')
    || value.startsWith('127.')
    || value.startsWith('192.168.')
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(value);
}

function detectInternalEnvironment() {
  const host = window.location.hostname || '';
  const observedIp = state.ipInfo?.ip || '';
  const localHostnames = ['localhost', '127.0.0.1', '::1'];
  const internalHost = localHostnames.includes(host) || isPrivateIpv4(host);
  const internalIp = localHostnames.includes(observedIp) || isPrivateIpv4(observedIp);

  state.environment = internalHost || internalIp
    ? { isInternal: true, reason: 'Pruebas internas/locales detectadas' }
    : { isInternal: false, reason: 'Entorno con acceso externo o publicado' };
}

function badgeClass(status) {
  if (status === 'ok') return 'ok';
  if (status === 'warn') return 'warn';
  if (status === 'fail') return 'fail';
  return 'pending';
}

function statusWord(status) {
  if (status === 'ok') return 'OK';
  if (status === 'warn') return 'AVISO';
  if (status === 'fail') return 'FALLO';
  return 'PENDIENTE';
}

function renderTests() {
  $('test-list').innerHTML = state.tests.map((test) => `
    <article class="test-item">
      <div>
        <h3>${test.title}</h3>
        <p>${test.details}</p>
      </div>
      <span class="badge ${badgeClass(test.status)}">${statusWord(test.status)}</span>
    </article>
  `).join('');
}

function updateProgressRing(ringId, current, total, label) {
  const ring = $(ringId);
  if (!ring) return;
  
  const circumference = 314.159; // 2 * π * 50
  const percentage = total > 0 ? (current / total) * 100 : 0;
  const offset = circumference - (percentage / 100) * circumference;
  
  ring.style.strokeDashoffset = offset;
  ring.style.setProperty('--progress', `${percentage}%`);
}

function updateLossIndicator(sent, received) {
  const lossRing = $('ring-loss');
  if (!lossRing) return;
  
  const circumference = 314.159;
  const lost = sent > 0 ? sent - received : 0;
  const lossPercentage = sent > 0 ? (lost / sent) * 100 : 0;
  const offset = circumference - (lossPercentage / 100) * circumference;
  
  lossRing.style.strokeDashoffset = offset;
  lossRing.style.setProperty('--loss', `${lossPercentage}%`);
  
  // Si hay pérdida, mostrar la línea blanca
  lossRing.style.opacity = lossPercentage > 0 ? '0.8' : '0';
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function renderPacketStats(sent, received, count, elapsed) {
  // Update sent ring
  $('val-sent').textContent = String(sent);
  $('total-sent').textContent = `/ ${count}`;
  const sentPct = count > 0 ? ((sent / count) * 100).toFixed(0) : 0;
  $('pct-sent').textContent = `${sentPct}%`;
  updateProgressRing('ring-sent', sent, count, 'Enviados');

  // Update time ring (solo contador, sin ring de progreso)
  $('val-time').textContent = formatTime(elapsed);
  $('total-time').textContent = `/ 0:00`;
  
  // Update received ring
  $('val-received').textContent = String(received);
  $('total-received').textContent = `/ ${count}`;
  const receivedPct = count > 0 ? ((received / count) * 100).toFixed(0) : 0;
  $('pct-received').textContent = `${receivedPct}%`;
  updateProgressRing('ring-received', received, count, 'Recibidos');
  
  // Update loss indicator (línea blanca)
  updateLossIndicator(sent, received);
}

function renderStats(items) {
  $('network-stats').innerHTML = items.map((item) => `
    <div class="stat-box">
      <span>${item.label}</span>
      <strong>${item.value}</strong>
    </div>
  `).join('');
}

async function fetchJson(url, options = {}) {
  console.log('[FETCH] GET', url, options);
  const opts = { cache: 'no-store', ...options };
  try {
    const response = await fetch(url, opts);
    console.log('[FETCH] Response status:', response.status, 'for', url);
    if (!response.ok) throw new Error(`Error ${response.status}`);
    const data = await response.json();
    console.log('[FETCH] Response data:', data);
    return data;
  } catch (error) {
    console.error('[FETCH] Error fetching', url, error);
    throw error;
  }
}

async function loadBaseData() {
  console.log('[DATA] Loading base data...');
  const [config, ipInfo, health] = await Promise.all([
    fetchJson('/api/config'),
    fetchJson('/api/ip'),
    fetchJson('/api/health')
  ]);
  console.log('[DATA] Loaded config:', config);
  console.log('[DATA] Loaded ipInfo:', ipInfo);
  console.log('[DATA] Loaded health:', health);
  state.config = config;
  state.ipInfo = ipInfo;
  state.health = health;
}

function updateScores() {
  let ipv4 = 0;
  let ipv6 = 0;
  const family = state.ipInfo?.family || 'Desconocido';
  const hasServerIPv6 = (state.health?.serverAddresses || []).some((item) => String(item.family).includes('6') || String(item.address).includes(':'));
  const hasServerIPv4 = (state.health?.serverAddresses || []).some((item) => String(item.family).includes('4') || String(item.address).includes('.'));
  const internalMode = state.environment.isInternal;

  if (hasServerIPv4) ipv4 += 4;
  if (family === 'IPv4') ipv4 += 6;
  else if (family === 'IPv6') ipv4 += 4;
  else ipv4 += 2;

  if (hasServerIPv6) ipv6 += 4;
  if (family === 'IPv6') ipv6 += 6;
  else if (family === 'IPv4') ipv6 += internalMode ? 5 : 2;
  else ipv6 += internalMode ? 4 : 1;

  state.scores.ipv4 = Math.min(10, ipv4);
  state.scores.ipv6 = Math.min(10, ipv6);
  state.scores.readiness = Number(((state.scores.ipv4 + state.scores.ipv6) / 2).toFixed(1));

  setText('ipv4-score', `${state.scores.ipv4.toFixed(1)}/10`);
  setText('ipv6-score', `${state.scores.ipv6.toFixed(1)}/10`);
  setText('readiness-score', `${state.scores.readiness.toFixed(1)}/10`);

  setText('ipv4-status', state.scores.ipv4 >= 9 ? 'Operativo' : state.scores.ipv4 >= 6 ? 'Parcial' : 'Bajo');
  setText('ipv6-status', internalMode
    ? (hasServerIPv6 ? 'Disponible' : 'Opcional en local')
    : (state.scores.ipv6 >= 9 ? 'Operativo' : state.scores.ipv6 >= 6 ? 'Parcial' : 'Bajo'));
  setText('general-status', state.scores.readiness >= 9 ? 'Excelente' : state.scores.readiness >= 6 ? 'Aceptable' : 'Requiere ajustes');

  // Actualizar desglose de IPv6
  const checks = {
    'check-ipv6-server': hasServerIPv6 ? '✓' : (internalMode ? 'Local' : '✗'),
    'check-ipv6-conn': family === 'IPv6' ? '✓' : (internalMode ? 'Local' : '✗'),
    'check-dual-stack': (hasServerIPv6 && hasServerIPv4) ? '✓' : (internalMode ? 'Local' : '✗'),
    'check-ipv6-latency': 'Pendiente'
  };

  Object.entries(checks).forEach(([id, value]) => {
    const el = $(id);
    if (el) {
      el.textContent = value;
      el.style.color = value === '✓' ? '#34d399' : value === '✗' ? '#fb7185' : value === 'Local' ? '#fbbf24' : '';
    }
  });
}

function updateTestResults() {
  const family = state.ipInfo?.family || 'Desconocido';
  const ip = state.ipInfo?.ip || 'No detectada';
  const serverAddresses = state.health?.serverAddresses || [];
  const hasIPv6 = serverAddresses.some((item) => String(item.address).includes(':'));
  const hasIPv4 = serverAddresses.some((item) => String(item.address).includes('.'));
  const internalMode = state.environment.isInternal;

  state.tests[0] = {
    ...state.tests[0],
    status: family === 'IPv6' || family === 'IPv4' ? 'ok' : 'warn',
    details: `La sesión llega como ${family}. IP detectada: ${ip}.`
  };

  state.tests[1] = {
    ...state.tests[1],
    status: state.health?.ok ? 'ok' : 'fail',
    details: state.health?.ok ? 'El backend respondió correctamente al chequeo de salud.' : 'No hubo respuesta válida del backend.'
  };

  state.tests[2] = {
    ...state.tests[2],
    status: 'warn',
    details: 'Ejecuta la prueba general para validar la transferencia de payload grande.'
  };

  state.tests[3] = {
    ...state.tests[3],
    status: hasIPv4 && hasIPv6 ? 'ok' : hasIPv4 || hasIPv6 ? (internalMode ? 'ok' : 'warn') : 'fail',
    details: hasIPv4 && hasIPv6
      ? 'El servidor expone direcciones IPv4 e IPv6.'
      : internalMode && hasIPv4
      ? 'Prueba interna funcional por IPv4 local. IPv6 no es obligatoria para validar el flujo dentro de tu red.'
      : internalMode && hasIPv6
      ? 'Prueba interna funcional por IPv6 local.'
      : hasIPv4
      ? 'El servidor solo muestra IPv4 en este entorno.'
      : hasIPv6
      ? 'El servidor solo muestra IPv6 en este entorno.'
      : 'No se detectaron direcciones utilizables.'
  };

  renderTests();
}

function updateOverview(latency = 0, largePayload = null) {
  const addresses = state.health?.serverAddresses || [];
  const primaryIPv6 = addresses.find((item) => String(item.address).includes(':'))?.address || 'No detectada';
  const primaryIPv4 = addresses.find((item) => String(item.address).includes('.'))?.address || 'No detectada';
  renderStats([
    { label: 'IP detectada', value: state.ipInfo?.ip || 'No disponible' },
    { label: 'Protocolo observado', value: state.ipInfo?.family || 'Desconocido' },
    { label: 'Latencia base', value: formatMs(latency) },
    { label: 'IPv4 del servidor', value: primaryIPv4 },
    { label: 'IPv6 del servidor', value: primaryIPv6 },
    { label: 'Paquete grande', value: largePayload ? `${(largePayload.bytes / (1024 * 1024)).toFixed(1)} MB` : 'Pendiente' },
  ]);
}

async function measurePingOnce() {
  const start = performance.now();
  await fetchJson(`/api/ping?ts=${Date.now()}`);
  return performance.now() - start;
}

function calculateJitter(values) {
  if (values.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < values.length; i += 1) {
    total += Math.abs(values[i] - values[i - 1]);
  }
  return total / (values.length - 1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runPacketTest({ count, interval, continuous }) {
  state.packetRun.active = true;
  state.packetRun.stopRequested = false;
  $('start-packet-test').disabled = true;
  $('start-continuous-test').disabled = true;
  $('stop-packet-test').disabled = false;

  let sent = 0;
  let received = 0;
  let failures = 0;
  const latencies = [];
  const startedAt = performance.now();

  while (!state.packetRun.stopRequested && (continuous || sent < count)) {
    sent += 1;
    try {
      const latency = await measurePingOnce();
      received += 1;
      latencies.push(latency);
    } catch (error) {
      failures += 1;
    }

    const average = latencies.length ? latencies.reduce((acc, value) => acc + value, 0) / latencies.length : 0;
    const jitter = calculateJitter(latencies);
    const min = latencies.length ? Math.min(...latencies) : 0;
    const max = latencies.length ? Math.max(...latencies) : 0;
    const loss = sent ? ((sent - received) / sent) * 100 : 0;
    const elapsed = (performance.now() - startedAt) / 1000;

    renderPacketStats(sent, received, count, elapsed);

    $('packet-log').textContent = [
      continuous ? 'Modo continuo activo (test local).' : `Prueba en ejecución: ${sent}/${count} (local).`,
      `Latencia mínima: ${formatMs(min)}`,
      `Latencia máxima: ${formatMs(max)}`,
      `Pérdida estimada: ${loss.toFixed(2)} %`,
      `Jitter: ${formatMs(jitter)}`,
      `Fallos: ${failures}`,
      state.packetRun.stopRequested ? 'Deteniendo prueba...' : 'Presiona “Detener” para finalizar.'
    ].join('\n');

    if (state.packetRun.stopRequested) break;
    if (!continuous && sent >= count) break;
    await sleep(interval);
  }

  state.packetRun.active = false;
  $('start-packet-test').disabled = false;
  $('start-continuous-test').disabled = false;
  $('stop-packet-test').disabled = true;

  const finalLoss = sent ? ((sent - received) / sent) * 100 : 0;
  $('packet-log').textContent = [
    continuous ? 'Prueba continua local finalizada.' : 'Prueba local completada.',
    `Solicitudes enviadas: ${sent}`,
    `Solicitudes recibidas: ${received}`,
    `Pérdida estimada final: ${finalLoss.toFixed(2)} %`
  ].join('\n');
}

async function runSpeedTest() {
  $('run-local-speed').disabled = true;
  try {
    const start = performance.now();
    const response = await fetch('/api/speed-payload?ts=' + Date.now(), { cache: 'no-store' });
    const blob = await response.blob();
    const elapsedSeconds = (performance.now() - start) / 1000;
    const bits = blob.size * 8;
    const mbps = elapsedSeconds > 0 ? bits / elapsedSeconds / 1_000_000 : 0;
    setText('speed-download', `${mbps.toFixed(2)} Mbps`);
    setText('speed-size', `${(blob.size / (1024 * 1024)).toFixed(1)} MB`);

    const latency = await measurePingOnce();
    setText('speed-latency', formatMs(latency));
  } catch (error) {
    setText('speed-download', 'Error');
  } finally {
    $('run-local-speed').disabled = false;
  }
}

async function runGeneralTest() {
  console.log('[TEST] Starting runGeneralTest...');
  $('run-main-test').disabled = true;
  try {
    console.log('[TEST] Loading base data...');
    await loadBaseData();
    console.log('[TEST] Base data loaded:', state);
    detectInternalEnvironment();
    const latency = await measurePingOnce();
    console.log('[TEST] Latency measured:', latency);
    const largePayload = await fetchJson('/api/large-payload?mb=2');
    console.log('[TEST] Large payload fetched:', largePayload);
    updateScores();
    updateTestResults();
    updateOverview(latency, largePayload);

    state.tests[2] = {
      ...state.tests[2],
      status: largePayload?.ok ? 'ok' : 'fail',
      details: largePayload?.ok
        ? `Respuesta correcta con un payload de ${(largePayload.bytes / (1024 * 1024)).toFixed(1)} MB.`
        : 'La transferencia de payload grande no respondió correctamente.'
    };
    renderTests();

    const family = state.ipInfo?.family || 'Desconocido';
    const summary = state.environment.isInternal
      ? 'Modo interno detectado: puedes ejecutar tus pruebas dentro de esta red y validar backend, latencia, paquetes, guardado y DNS sin publicar el sitio.'
      : family === 'IPv6'
      ? 'La sesión actual entra por IPv6 y el entorno muestra una preparación sólida para este protocolo.'
      : family === 'IPv4'
      ? 'La sesión actual entra por IPv4. El sitio puede seguir mejorando su exposición y preferencia IPv6.'
      : 'No se pudo determinar el protocolo principal de la sesión actual.';
    setText('hero-summary', summary);
    setText('local-mode-note', state.environment.isInternal
      ? 'Las pruebas internas están activas. Todo lo principal se valida contra tu servidor local y tu red.'
      : 'Este entorno parece publicado o externo. Algunas comprobaciones de IPv6 dependen de conectividad real hacia Internet.');
    console.log('[TEST] runGeneralTest completed successfully');
  } catch (error) {
    console.error('[TEST] Error in runGeneralTest:', error);
    setText('hero-summary', `Ocurrió un error al ejecutar la prueba general: ${error.message}`);
  } finally {
    $('run-main-test').disabled = false;
  }
}

async function saveCurrentResults() {
  try {
    $('save-test-btn').disabled = true;
    const testData = {
      ipInfo: state.ipInfo,
      scores: state.scores,
      tests: state.tests,
      timestamp: new Date().toISOString(),
    };
    const response = await fetchJson('/api/results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testData),
    });
    if (response.ok) {
      setText('save-status', '✓ Resultado guardado correctamente');
      setTimeout(() => setText('save-status', ''), 2000);
      await loadSavedResults();
    }
  } catch (error) {
    setText('save-status', '✗ Error al guardar: ' + error.message);
  } finally {
    $('save-test-btn').disabled = false;
  }
}

async function loadSavedResults() {
  try {
    const results = await fetchJson('/api/results');
    const container = $('results-history');
    if (!container) return;
    
    if (!Array.isArray(results) || results.length === 0) {
      container.innerHTML = '<p style="padding: 1rem;">No hay resultados guardados aún.</p>';
      return;
    }

    container.innerHTML = results.reverse().map((result) => `
      <div style="padding: 1rem; border-bottom: 1px solid #333; margin-bottom: 1rem;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <strong>${new Date(result.saveTime).toLocaleString()}</strong>
            <p style="margin: 0.5rem 0 0 0; font-size: 0.9rem; color: #888;">
              Readiness: ${result.scores.readiness}/10 | IPv4: ${result.scores.ipv4}/10 | IPv6: ${result.scores.ipv6}/10
            </p>
          </div>
          <button onclick="deleteResult(${result.id})" style="padding: 0.25rem 0.5rem; cursor: pointer;">
            Eliminar
          </button>
        </div>
      </div>
    `).join('');
  } catch (error) {
    console.error('Error al cargar resultados:', error);
  }
}

async function deleteResult(id) {
  if (!confirm('¿Estás seguro de que quieres eliminar este resultado?')) return;
  try {
    await fetch(`/api/results/${id}`, { method: 'DELETE' });
    await loadSavedResults();
  } catch (error) {
    console.error('Error al eliminar resultado:', error);
  }
}

async function clearAllResults() {
  if (!confirm('¿Estás seguro de que quieres eliminar TODOS los resultados guardados?')) return;
  try {
    await fetch('/api/results', { method: 'DELETE' });
    await loadSavedResults();
    setText('save-status', '✓ Todos los resultados han sido eliminados');
    setTimeout(() => setText('save-status', ''), 2000);
  } catch (error) {
    console.error('Error al limpiar resultados:', error);
  }
}

async function checkDomain() {
  const domain = $('domain-input').value.trim();
  if (!domain) {
    $('domain-result').textContent = 'Escribe un dominio válido para revisar sus registros.';
    return;
  }

  $('check-domain').disabled = true;
  $('domain-result').textContent = 'Revisando dominio...';
  try {
    const result = await fetchJson(`/api/domain-check?domain=${encodeURIComponent(domain)}`);
    const ipv4Count = result.aRecords.length;
    const ipv6Count = result.aaaaRecords.length;
    const status = ipv4Count && ipv6Count
      ? 'El dominio está listo para dual stack.'
      : ipv6Count
      ? 'El dominio tiene solo registros AAAA.'
      : ipv4Count
      ? 'El dominio tiene solo registros A.'
      : 'No se encontraron registros A ni AAAA.';

    $('domain-result').textContent = [
      `Dominio: ${result.domain}`,
      status,
      `A: ${ipv4Count ? result.aRecords.join(', ') : 'Sin registros'}`,
      `AAAA: ${ipv6Count ? result.aaaaRecords.join(', ') : 'Sin registros'}`,
      result.errors.length ? `Notas: ${result.errors.join(' | ')}` : 'Sin observaciones.'
    ].join('\n');
  } catch (error) {
    $('domain-result').textContent = `No fue posible revisar el dominio: ${error.message}`;
  } finally {
    $('check-domain').disabled = false;
  }
}

// Toggle de tema oscuro/claro
function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.classList.contains('light-mode');
  if (isDark) {
    html.classList.remove('light-mode');
    localStorage.setItem('theme', 'dark');
    $('theme-icon').textContent = '🌙';
  } else {
    html.classList.add('light-mode');
    localStorage.setItem('theme', 'light');
    $('theme-icon').textContent = '☀️';
  }
}

// Cargar tema guardado
function loadTheme() {
  const theme = localStorage.getItem('theme') || 'dark';
  const html = document.documentElement;
  if (theme === 'light') {
    html.classList.add('light-mode');
    $('theme-icon').textContent = '☀️';
  } else {
    html.classList.remove('light-mode');
    $('theme-icon').textContent = '🌙';
  }
}

// Obtener geolocalización
async function loadGeolocation() {
  if (state.environment.isInternal) {
    $('geo-country').textContent = 'Prueba interna';
    $('geo-city').textContent = 'Red local';
    $('geo-isp').textContent = 'No consultado';
    $('geo-coords').textContent = 'No aplica';
    return;
  }

  try {
    const response = await fetch('https://ipapi.co/json/');
    const data = await response.json();
    $('geo-country').textContent = data.country_name || '-';
    $('geo-city').textContent = data.city || '-';
    $('geo-isp').textContent = data.org || '-';
    $('geo-coords').textContent = `${data.latitude}, ${data.longitude}` || '-';
  } catch (error) {
    console.log('No se pudo cargar geolocalización:', error);
    $('geo-country').textContent = 'Error al cargar';
    $('geo-city').textContent = 'Error al cargar';
    $('geo-isp').textContent = 'Error al cargar';
    $('geo-coords').textContent = 'Error al cargar';
  }
}

// Exportar reporte
function exportReport() {
  const reportData = {
    timestamp: new Date().toISOString(),
    ipInfo: state.ipInfo,
    scores: state.scores,
    tests: state.tests,
  };

  const csv = [
    ['Test_Servicios - Reporte', ''],
    ['Fecha', new Date(reportData.timestamp).toLocaleString()],
    [''],
    ['=== RESULTADOS ===', ''],
    ['IP Detectada', reportData.ipInfo?.ip || '-'],
    ['Protocolo', reportData.ipInfo?.family || '-'],
    [''],
    ['=== PUNTUACIONES ===', ''],
    ['IPv4', reportData.scores.ipv4 + '/10'],
    ['IPv6', reportData.scores.ipv6 + '/10'],
    ['Readiness General', reportData.scores.readiness + '/10'],
    [''],
    ['=== PRUEBAS ===', '']
  ];

  reportData.tests.forEach(test => {
    csv.push([test.title, test.status, test.details]);
  });

  const csvContent = csv.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `test-servicios-reporte-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function wireEvents() {
  $('run-main-test').addEventListener('click', runGeneralTest);
  $('run-local-speed').addEventListener('click', runSpeedTest);
  $('check-domain').addEventListener('click', checkDomain);
  $('toggle-theme').addEventListener('click', toggleTheme);
  $('export-report').addEventListener('click', exportReport);
  $('stop-packet-test').addEventListener('click', () => { state.packetRun.stopRequested = true; });

  // Botones de guardar resultados (si existen)
  const saveBtn = $('save-test-btn');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveCurrentResults);
  }

  const clearBtn = $('clear-results-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', clearAllResults);
  }

  $('start-packet-test').addEventListener('click', async () => {
    const count = Math.max(1, Number($('packet-count').value || 20));
    const interval = Math.max(50, Number($('packet-interval').value || 250));
    await runPacketTest({ count, interval, continuous: false });
  });

  $('start-continuous-test').addEventListener('click', async () => {
    const interval = Math.max(50, Number($('packet-interval').value || 250));
    await runPacketTest({ count: Infinity, interval, continuous: true });
  });
}

async function init() {
  loadTheme();
  renderTests();
  renderStats([
    { label: 'IP detectada', value: 'Pendiente' },
    { label: 'Protocolo observado', value: 'Pendiente' },
    { label: 'Latencia base', value: 'Pendiente' },
    { label: 'IPv4 del servidor', value: 'Pendiente' },
    { label: 'IPv6 del servidor', value: 'Pendiente' },
    { label: 'Paquete grande', value: 'Pendiente' },
  ]);
  renderPacketStats(0, 0, 20, 0);
  wireEvents();
  await runGeneralTest();
  await loadGeolocation();
  await loadSavedResults();
}

init();
