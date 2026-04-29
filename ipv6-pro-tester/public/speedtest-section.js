(function () {
  const SPEEDTEST_CONFIG = {
    // Cambia a "librespeed" cuando publiques LibreSpeed y cargues /librespeed/speedtest.js.
    mode: 'local',
    scriptReadyGlobal: 'Speedtest',
    maxVisualMbps: 1000,
    downloadMb: 20,
    uploadMb: 10,
    downloadDurationMs: 12000,
    uploadTimeoutMs: 12000,
  };

  const state = {
    controller: null,
    xhr: null,
    timer: null,
    running: false,
    phase: 'ready',
    activeMetric: 'download',
    values: { ping: 0, jitter: 0, download: 0, upload: 0 },
  };

  const $ = (id) => document.getElementById(id);
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  function formatNumber(value, decimals = 2) {
    return Number(value || 0).toFixed(decimals);
  }

  function setStatus(status, message) {
    const statusEl = $('speedtest-state');
    const messageEl = $('speedtest-message');
    if (!statusEl || !messageEl) return;

    statusEl.classList.remove('is-running', 'is-finished', 'is-error');
    if (status === 'running') statusEl.classList.add('is-running');
    if (status === 'finished') statusEl.classList.add('is-finished');
    if (status === 'error') statusEl.classList.add('is-error');

    const labels = {
      ready: 'Listo',
      running: 'Corriendo',
      finished: 'Finalizado',
      error: 'Error',
    };

    statusEl.textContent = labels[status] || 'Listo';
    messageEl.textContent = message;
  }

  function setButtons(running) {
    const start = $('start-speedtest');
    const stop = $('stop-speedtest');
    if (start) start.disabled = running;
    if (stop) stop.disabled = !running;
  }

  function setPhase(phase) {
    state.phase = phase;
    if (phase === 'download' || phase === 'ready') state.activeMetric = 'download';
    if (phase === 'upload') state.activeMetric = 'upload';

    const card = $('speedtest-section');
    const phaseLabel = $('speed-phase-label');
    const uploadChannel = $('speed-upload-channel');
    const downloadChannel = $('speed-download-channel');

    const labels = {
      ready: 'Preparado',
      ping: 'Ping',
      upload: 'Subida',
      download: 'Descarga',
      reset: 'Preparando subida',
      finished: 'Finalizado',
      error: 'Error',
    };

    if (card) {
      const finishedDownload = phase === 'finished' && state.activeMetric === 'download';
      const finishedUpload = phase === 'finished' && state.activeMetric === 'upload';
      card.classList.toggle('is-download', phase === 'download' || phase === 'ready' || finishedDownload);
      card.classList.toggle('is-upload', phase === 'upload' || phase === 'reset' || finishedUpload);
    }
    if (phaseLabel) phaseLabel.textContent = labels[phase] || 'Preparado';
    if (uploadChannel) uploadChannel.classList.toggle('is-active', phase === 'upload');
    if (downloadChannel) downloadChannel.classList.toggle('is-active', phase === 'download' || phase === 'ready');
  }

  function setPhaseProgress(percent) {
    const fill = $('speed-phase-progress-fill');
    if (!fill) return;
    fill.style.width = `${clamp(Number(percent || 0), 0, 100)}%`;
  }

  function updateGauge(value) {
    const bounded = clamp(Number(value || 0), 0, SPEEDTEST_CONFIG.maxVisualMbps);
    const progress = bounded / SPEEDTEST_CONFIG.maxVisualMbps;
    const degrees = progress * 260;
    const needleAngle = -130 + degrees;
    const gauge = $('speed-gauge-progress');
    const needle = $('speed-needle');
    const current = $('speed-current-value');

    if (gauge) gauge.style.setProperty('--gauge-deg', `${degrees}deg`);
    if (needle) needle.style.setProperty('--needle-angle', `${needleAngle}deg`);
    if (current) current.textContent = formatNumber(value);
  }

  function renderValues(values) {
    state.values = { ...state.values, ...values };

    $('speed-ping').textContent = formatNumber(state.values.ping, 0);
    $('speed-jitter').textContent = formatNumber(state.values.jitter, 0);
    $('speed-download').textContent = formatNumber(state.values.download);
    $('speed-upload').textContent = formatNumber(state.values.upload);

    const activeValue = state.activeMetric === 'download'
      ? state.values.download
      : state.values.upload;
    updateGauge(activeValue);
  }

  function resetValues() {
    setPhase('ready');
    setPhaseProgress(0);
    renderValues({ ping: 0, jitter: 0, download: 0, upload: 0 });
  }

  function normalizeLibreSpeedData(data) {
    return {
      ping: Number(data.pingStatus || data.ping || 0),
      jitter: Number(data.jitterStatus || data.jitter || 0),
      download: Number(data.dlStatus || data.download || 0),
      upload: Number(data.ulStatus || data.upload || 0),
    };
  }

  function calculateMbps(bytes, elapsedMs) {
    if (!bytes || !elapsedMs || elapsedMs <= 0) return 0;
    return (bytes * 8) / (elapsedMs / 1000) / 1000000;
  }

  function smoothSpeed(previous, next) {
    if (!previous) return next;
    const weight = next > previous ? 0.58 : 0.35;
    return (previous * (1 - weight)) + (next * weight);
  }

  async function measurePingAndJitter(signal) {
    setPhase('ping');
    setStatus('running', 'Midiendo ping y jitter...');

    const samples = [];
    for (let index = 0; index < 5; index += 1) {
      const startedAt = performance.now();
      await fetch(`/api/ping?ts=${Date.now()}-${index}`, { cache: 'no-store', signal });
      const latency = performance.now() - startedAt;
      samples.push(latency);

      const avgPing = samples.reduce((sum, value) => sum + value, 0) / samples.length;
      const jitter = samples.length > 1
        ? samples.slice(1).reduce((sum, value, itemIndex) => sum + Math.abs(value - samples[itemIndex]), 0) / (samples.length - 1)
        : 0;

      renderValues({ ping: avgPing, jitter });
      setPhaseProgress(((index + 1) / 5) * 100);
    }
  }

  async function measureDownload(signal) {
    setPhase('download');
    setStatus('running', 'Midiendo descarga...');

    const response = await fetch(`/api/speed-payload?mb=${SPEEDTEST_CONFIG.downloadMb}&ts=${Date.now()}`, {
      cache: 'no-store',
      signal,
    });

    if (!response.ok) throw new Error(`Descarga: error ${response.status}`);

    const startedAt = performance.now();
    let loadedBytes = 0;
    let lastBytes = 0;
    let lastAt = startedAt;
    let displayedSpeed = 0;

    if (!response.body) {
      const data = await response.arrayBuffer();
      displayedSpeed = calculateMbps(data.byteLength, performance.now() - startedAt);
      renderValues({ download: displayedSpeed });
      return displayedSpeed;
    }

    const reader = response.body.getReader();
    let reachedTimeLimit = false;
    const downloadTimeout = window.setTimeout(() => {
      reachedTimeLimit = true;
      reader.cancel().catch(() => {});
    }, SPEEDTEST_CONFIG.downloadDurationMs);

    try {
      while (!reachedTimeLimit) {
        const { value, done } = await reader.read();
        if (done) break;

        loadedBytes += value.byteLength;
        const now = performance.now();
        const elapsedSinceLast = now - lastAt;
        const elapsedTotal = now - startedAt;
        setPhaseProgress((elapsedTotal / SPEEDTEST_CONFIG.downloadDurationMs) * 100);

        if (elapsedSinceLast >= 140) {
          const instantSpeed = calculateMbps(loadedBytes - lastBytes, elapsedSinceLast);
          displayedSpeed = smoothSpeed(displayedSpeed, instantSpeed);
          renderValues({ download: displayedSpeed });
          lastBytes = loadedBytes;
          lastAt = now;
        }
      }
    } finally {
      window.clearTimeout(downloadTimeout);
    }

    const finalSpeed = calculateMbps(loadedBytes, performance.now() - startedAt);
    setPhaseProgress(100);
    renderValues({ download: finalSpeed });
    return finalSpeed;
  }

  function measureUpload(signal) {
    setPhase('reset');
    setPhaseProgress(0);
    updateGauge(0);
    setStatus('running', 'Preparando medicion de subida...');

    return new Promise((resolve, reject) => {
      const uploadBytes = SPEEDTEST_CONFIG.uploadMb * 1024 * 1024;
      const payload = new Uint8Array(uploadBytes);
      const xhr = new XMLHttpRequest();
      let displayedSpeed = 0;
      let startedAt = 0;

      state.xhr = xhr;

      const abortUpload = () => xhr.abort();
      signal.addEventListener('abort', abortUpload, { once: true });

      xhr.open('POST', `/api/speed-upload?ts=${Date.now()}`, true);
      xhr.timeout = SPEEDTEST_CONFIG.uploadTimeoutMs;
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');

      xhr.upload.onloadstart = () => {
        startedAt = performance.now();
        setPhase('upload');
        setPhaseProgress(0);
        setStatus('running', 'Midiendo subida...');
      };

      xhr.upload.onprogress = (event) => {
        const elapsed = performance.now() - startedAt;
        const measured = calculateMbps(event.loaded, elapsed);
        displayedSpeed = smoothSpeed(displayedSpeed, measured);
        const byteProgress = event.lengthComputable ? (event.loaded / event.total) * 100 : 0;
        const timeProgress = (elapsed / SPEEDTEST_CONFIG.uploadTimeoutMs) * 100;
        setPhaseProgress(Math.max(byteProgress, Math.min(timeProgress, 98)));
        renderValues({ upload: displayedSpeed });
      };

      xhr.onload = () => {
        signal.removeEventListener('abort', abortUpload);
        state.xhr = null;

        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error(`Subida: error ${xhr.status}`));
          return;
        }

        const finalSpeed = calculateMbps(uploadBytes, performance.now() - startedAt);
        setPhaseProgress(100);
        renderValues({ upload: finalSpeed });
        resolve(finalSpeed);
      };

      xhr.onerror = () => {
        signal.removeEventListener('abort', abortUpload);
        state.xhr = null;
        reject(new Error('No fue posible medir la subida.'));
      };

      xhr.ontimeout = () => {
        signal.removeEventListener('abort', abortUpload);
        state.xhr = null;
        if (displayedSpeed > 0) {
          renderValues({ upload: displayedSpeed });
          setPhaseProgress(100);
          resolve(displayedSpeed);
          return;
        }
        reject(new Error('La medicion de subida excedio el tiempo esperado.'));
      };

      xhr.onabort = () => {
        signal.removeEventListener('abort', abortUpload);
        state.xhr = null;
        reject(new DOMException('Prueba detenida.', 'AbortError'));
      };

      xhr.send(payload);
    });
  }

  function startLibreSpeedTest() {
    if (!window[SPEEDTEST_CONFIG.scriptReadyGlobal]) {
      throw new Error('LibreSpeed no esta cargado. Publica speedtest.js y cambia el modo a librespeed.');
    }

    // Aqui se conecta el backend real de LibreSpeed:
    // 1. Sirve speedtest.js desde tu instalacion self-hosted.
    // 2. Agrega su <script> antes de speedtest-section.js o carga el script dinamicamente.
    // 3. Configura endpoints y servidores con test.setParameter(...) segun tu despliegue.
    const test = new window[SPEEDTEST_CONFIG.scriptReadyGlobal]();
    state.controller = test;

    test.onupdate = (data) => {
      const normalized = normalizeLibreSpeedData(data || {});
      if (normalized.download > 0) setPhase('download');
      if (normalized.upload > 0 && normalized.download <= 0) setPhase('upload');
      renderValues(normalized);
      setStatus('running', 'Midiendo velocidad con LibreSpeed...');
    };

    test.onend = (aborted) => {
      state.running = false;
      state.controller = null;
      setButtons(false);
      setPhase(aborted ? 'ready' : 'finished');
      setStatus(aborted ? 'ready' : 'finished', aborted ? 'Prueba detenida.' : 'Prueba completada correctamente.');
    };

    test.start();
  }

  async function startLocalSpeedTest() {
    const controller = new AbortController();
    state.controller = controller;

    try {
      await measurePingAndJitter(controller.signal);
      await measureDownload(controller.signal);
      await measureUpload(controller.signal);

      state.running = false;
      state.controller = null;
      setButtons(false);
      setPhase('finished');
      setPhaseProgress(100);
      setStatus('finished', 'Prueba completada con medicion local contra este servidor.');
    } catch (error) {
      state.running = false;
      state.controller = null;
      setButtons(false);
      if (error.name === 'AbortError') {
        setPhase('ready');
        setPhaseProgress(0);
        setStatus('ready', 'Prueba detenida.');
        return;
      }
      setPhase('error');
      setStatus('error', error.message || 'No fue posible completar el test de velocidad.');
    }
  }

  function stopCurrentTimer() {
    if (state.timer) {
      window.clearInterval(state.timer);
      state.timer = null;
    }
    if (state.xhr) {
      state.xhr.abort();
      state.xhr = null;
    }
  }

  function startSpeedTest() {
    if (state.running) return;

    resetValues();
    state.running = true;
    setButtons(true);
    setPhase('ping');
    setStatus('running', 'Preparando prueba...');

    try {
      if (SPEEDTEST_CONFIG.mode === 'librespeed') {
        startLibreSpeedTest();
      } else {
        startLocalSpeedTest();
      }
    } catch (error) {
      state.running = false;
      state.controller = null;
      setButtons(false);
      setStatus('error', error.message || 'No fue posible iniciar el test de velocidad.');
    }
  }

  function stopSpeedTest() {
    stopCurrentTimer();

    if (state.controller && typeof state.controller.abort === 'function') {
      state.controller.abort();
    }

    state.controller = null;
    state.running = false;
    setButtons(false);
    setPhase('ready');
    setPhaseProgress(0);
    setStatus('ready', 'Prueba detenida.');
  }

  function wireSpeedTest() {
    if (!$('speedtest-section')) return;

    resetValues();
    setButtons(false);
    setStatus('ready', 'Listo para iniciar.');

    $('start-speedtest').addEventListener('click', startSpeedTest);
    $('stop-speedtest').addEventListener('click', stopSpeedTest);
  }

  window.TestServiciosSpeedtest = {
    config: SPEEDTEST_CONFIG,
    start: startSpeedTest,
    stop: stopSpeedTest,
    update: renderValues,
    setPhase,
    setPhaseProgress,
    finish: () => {
      setPhase('finished');
      setStatus('finished', 'Prueba completada correctamente.');
    },
  };

  document.addEventListener('DOMContentLoaded', wireSpeedTest);
})();
