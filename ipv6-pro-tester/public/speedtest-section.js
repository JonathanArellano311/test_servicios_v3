(function () {
  const SPEEDTEST_CONFIG = {
    // Cambia a "librespeed" cuando el servicio dedicado de velocidad este disponible.
    mode: 'local',
    scriptReadyGlobal: 'Speedtest',
    maxVisualMbps: 10000,
    downloadMb: 64,
    downloadParallel: 6,
    uploadParallel: 4,
    uploadChunkBytes: 8 * 1024 * 1024,
    uploadDurationMs: 15000,
    downloadDurationMs: 15000,
    uploadTimeoutMs: 20000,
  };

  const state = {
    controller: null,
    xhr: null,
    activeXhrs: new Set(),
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
    const progress = gaugeProgressForMbps(bounded);
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

  function gaugeProgressForMbps(value) {
    const points = [
      [0, 0],
      [100, 0.12],
      [500, 0.24],
      [1000, 0.38],
      [2500, 0.56],
      [5000, 0.74],
      [7500, 0.88],
      [10000, 1],
    ];
    const speed = clamp(Number(value || 0), 0, SPEEDTEST_CONFIG.maxVisualMbps);

    for (let index = 1; index < points.length; index += 1) {
      const [currentSpeed, currentProgress] = points[index];
      const [previousSpeed, previousProgress] = points[index - 1];
      if (speed <= currentSpeed) {
        const ratio = (speed - previousSpeed) / (currentSpeed - previousSpeed);
        return previousProgress + ((currentProgress - previousProgress) * ratio);
      }
    }

    return 1;
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

    const startedAt = performance.now();
    const deadline = startedAt + SPEEDTEST_CONFIG.downloadDurationMs;
    let loadedBytes = 0;
    let displayedSpeed = 0;
    let lastRenderAt = startedAt;

    async function downloadWorker(workerIndex) {
      while (!signal.aborted && performance.now() < deadline) {
        const response = await fetch(`/api/speed-payload?mb=${SPEEDTEST_CONFIG.downloadMb}&worker=${workerIndex}&ts=${Date.now()}`, {
          cache: 'no-store',
          signal,
        });
        if (!response.ok) throw new Error(`Descarga: error ${response.status}`);

        if (!response.body) {
          const data = await response.arrayBuffer();
          loadedBytes += data.byteLength;
          continue;
        }

        const reader = response.body.getReader();
        while (!signal.aborted && performance.now() < deadline) {
          const { value, done } = await reader.read();
          if (done) break;
          loadedBytes += value.byteLength;
          updateDownloadProgress();
        }
        reader.cancel().catch(() => {});
      }
    }

    function updateDownloadProgress() {
        const now = performance.now();
        const elapsedTotal = now - startedAt;
        setPhaseProgress((elapsedTotal / SPEEDTEST_CONFIG.downloadDurationMs) * 100);

        if (now - lastRenderAt >= 140) {
          displayedSpeed = smoothSpeed(displayedSpeed, calculateMbps(loadedBytes, elapsedTotal));
          renderValues({ download: displayedSpeed });
          lastRenderAt = now;
        }
    }

    await Promise.all(Array.from({ length: SPEEDTEST_CONFIG.downloadParallel }, (_, index) => downloadWorker(index)));

    const finalSpeed = calculateMbps(loadedBytes, performance.now() - startedAt);
    setPhaseProgress(100);
    renderValues({ download: finalSpeed });
    return finalSpeed;
  }

  function uploadChunk(payload, signal, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      state.xhr = xhr;

      const abortUpload = () => xhr.abort();
      signal.addEventListener('abort', abortUpload, { once: true });
      state.activeXhrs.add(xhr);

      xhr.open('POST', `/api/speed-upload?ts=${Date.now()}`, true);
      xhr.timeout = SPEEDTEST_CONFIG.uploadTimeoutMs;
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');

      xhr.upload.onprogress = (event) => {
        onProgress(event.loaded);
      };

      xhr.onload = () => {
        signal.removeEventListener('abort', abortUpload);
        state.activeXhrs.delete(xhr);
        state.xhr = null;

        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error(xhr.status === 413
            ? 'Subida: Nginx esta limitando el tamaño del cuerpo de carga.'
            : `Subida: error ${xhr.status}`));
          return;
        }

        resolve(payload.byteLength);
      };

      xhr.onerror = () => {
        signal.removeEventListener('abort', abortUpload);
        state.activeXhrs.delete(xhr);
        state.xhr = null;
        reject(new Error('No fue posible enviar el bloque de subida.'));
      };

      xhr.ontimeout = () => {
        signal.removeEventListener('abort', abortUpload);
        state.activeXhrs.delete(xhr);
        state.xhr = null;
        reject(new Error('Un bloque de subida excedio el tiempo esperado.'));
      };

      xhr.onabort = () => {
        signal.removeEventListener('abort', abortUpload);
        state.activeXhrs.delete(xhr);
        state.xhr = null;
        reject(new DOMException('Prueba detenida.', 'AbortError'));
      };

      xhr.send(payload);
    });
  }

  async function measureUpload(signal) {
    setPhase('reset');
    setPhaseProgress(0);
    updateGauge(0);
    setStatus('running', 'Preparando medicion de subida...');

    const payload = new Uint8Array(SPEEDTEST_CONFIG.uploadChunkBytes);
    const startedAt = performance.now();
    const deadline = startedAt + SPEEDTEST_CONFIG.uploadDurationMs;
    let uploadedBytes = 0;
    let displayedSpeed = 0;
    const activeUploads = new Map();

    setPhase('upload');
    setStatus('running', 'Midiendo subida...');

    async function uploadWorker(workerIndex) {
      while (!signal.aborted && performance.now() < deadline) {
        await uploadChunk(payload, signal, (loadedInChunk) => {
          const now = performance.now();
          const elapsed = now - startedAt;
          activeUploads.set(workerIndex, loadedInChunk);
          const activeBytes = [...activeUploads.values()].reduce((sum, value) => sum + value, 0);
          const currentBytes = uploadedBytes + activeBytes;
          displayedSpeed = smoothSpeed(displayedSpeed, calculateMbps(currentBytes, elapsed));
          setPhaseProgress((elapsed / SPEEDTEST_CONFIG.uploadDurationMs) * 100);
          renderValues({ upload: displayedSpeed });
        });

        uploadedBytes += payload.byteLength;
        activeUploads.set(workerIndex, 0);
      }
    }

    await Promise.all(Array.from({ length: SPEEDTEST_CONFIG.uploadParallel }, (_, index) => uploadWorker(index)));

    const finalSpeed = calculateMbps(uploadedBytes, performance.now() - startedAt);
    setPhaseProgress(100);
    renderValues({ upload: finalSpeed || displayedSpeed });
    return finalSpeed || displayedSpeed;
  }

  function startLibreSpeedTest() {
    if (!window[SPEEDTEST_CONFIG.scriptReadyGlobal]) {
      throw new Error('El servicio de velocidad no está disponible.');
    }

    // Aqui se conecta el servicio dedicado de velocidad:
    // 1. Carga el script de medicion antes de este archivo.
    // 2. Configura endpoints y servidores con test.setParameter(...) segun tu despliegue.
    const test = new window[SPEEDTEST_CONFIG.scriptReadyGlobal]();
    state.controller = test;

    test.onupdate = (data) => {
      const normalized = normalizeLibreSpeedData(data || {});
      if (normalized.download > 0) setPhase('download');
      if (normalized.upload > 0 && normalized.download <= 0) setPhase('upload');
      renderValues(normalized);
      setStatus('running', 'Midiendo velocidad...');
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
      setStatus('finished', 'Prueba completada.');
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
    state.activeXhrs.forEach((xhr) => xhr.abort());
    state.activeXhrs.clear();
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
