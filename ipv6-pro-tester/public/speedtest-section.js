(function () {
  const SPEEDTEST_CONFIG = {
    // Cambia a "librespeed" cuando publiques LibreSpeed y cargues /librespeed/speedtest.js.
    mode: 'fallback',
    scriptReadyGlobal: 'Speedtest',
    maxVisualMbps: 1000,
  };

  const state = {
    controller: null,
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

    if (phaseLabel) phaseLabel.textContent = labels[phase] || 'Preparado';
    if (uploadChannel) uploadChannel.classList.toggle('is-active', phase === 'upload');
    if (downloadChannel) downloadChannel.classList.toggle('is-active', phase === 'download' || phase === 'ready');
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

  function startFallbackTest() {
    let tick = 0;
    const totalTicks = 190;
    const downloadTarget = 180 + Math.random() * 160;
    const uploadTarget = 35 + Math.random() * 85;
    const pingTarget = 8 + Math.random() * 24;
    const jitterTarget = 1 + Math.random() * 8;

    state.timer = window.setInterval(() => {
      tick += 1;

      if (tick < 20) {
        setPhase('ping');
        const progress = tick / 20;
        renderValues({
          ping: pingTarget * progress * 3.5,
          jitter: jitterTarget * progress * 3.5,
        });
        setStatus('running', 'Midiendo ping y jitter...');
      } else if (tick < 125) {
        setPhase('download');
        const progress = (tick - 20) / 105;
        const eased = Math.sin(progress * Math.PI * 0.5);
        renderValues({
          ping: pingTarget,
          jitter: jitterTarget,
          download: downloadTarget * clamp(eased, 0, 1),
        });
        setStatus('running', 'Midiendo descarga...');
      } else if (tick < 130) {
        setPhase('reset');
        updateGauge(0);
        setStatus('running', 'Preparando medicion de subida...');
      } else {
        setPhase('upload');
        const progress = (tick - 130) / 60;
        const eased = Math.sin(progress * Math.PI * 0.5);
        renderValues({
          ping: pingTarget,
          jitter: jitterTarget,
          download: downloadTarget,
          upload: uploadTarget * clamp(eased, 0, 1),
        });
        setStatus('running', 'Midiendo subida...');
      }

      if (tick >= totalTicks) {
        stopCurrentTimer();
        state.running = false;
        setButtons(false);
        setPhase('finished');
        renderValues({
          ping: pingTarget,
          jitter: jitterTarget,
          download: downloadTarget,
          upload: uploadTarget,
        });
        setStatus('finished', 'Prueba completada. Lista para conectarse al backend LibreSpeed real.');
      }
    }, 200);
  }

  function stopCurrentTimer() {
    if (state.timer) {
      window.clearInterval(state.timer);
      state.timer = null;
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
        startFallbackTest();
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
    finish: () => {
      setPhase('finished');
      setStatus('finished', 'Prueba completada correctamente.');
    },
  };

  document.addEventListener('DOMContentLoaded', wireSpeedTest);
})();
