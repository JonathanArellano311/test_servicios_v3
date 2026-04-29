(function () {
  const SPEEDTEST_CONFIG = {
    // Cambia a "librespeed" cuando publiques LibreSpeed y cargues /librespeed/speedtest.js.
    mode: 'demo',
    scriptReadyGlobal: 'Speedtest',
    maxVisualMbps: 500,
  };

  const state = {
    controller: null,
    timer: null,
    running: false,
    phase: 'ready',
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

  function renderValues(values) {
    state.values = { ...state.values, ...values };

    const download = clamp(Number(state.values.download || 0), 0, SPEEDTEST_CONFIG.maxVisualMbps);
    const upload = clamp(Number(state.values.upload || 0), 0, SPEEDTEST_CONFIG.maxVisualMbps);

    $('speed-ping').textContent = formatNumber(state.values.ping, 0);
    $('speed-jitter').textContent = formatNumber(state.values.jitter, 0);
    $('speed-download').textContent = formatNumber(state.values.download);
    $('speed-upload').textContent = formatNumber(state.values.upload);
    $('speed-download-bar').style.width = `${(download / SPEEDTEST_CONFIG.maxVisualMbps) * 100}%`;
    $('speed-upload-bar').style.width = `${(upload / SPEEDTEST_CONFIG.maxVisualMbps) * 100}%`;
  }

  function resetValues() {
    renderValues({ ping: 0, jitter: 0, download: 0, upload: 0 });
  }

  function setModeLabel(mode) {
    const label = $('speed-mode-label');
    if (label) label.textContent = mode === 'librespeed' ? 'LibreSpeed' : 'Demo';
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
      renderValues(normalizeLibreSpeedData(data || {}));
      setStatus('running', 'Midiendo velocidad con LibreSpeed...');
    };

    test.onend = (aborted) => {
      state.running = false;
      state.controller = null;
      setButtons(false);
      setStatus(aborted ? 'ready' : 'finished', aborted ? 'Prueba detenida.' : 'Prueba completada correctamente.');
    };

    test.start();
  }

  function startDemoTest() {
    let tick = 0;
    const totalTicks = 44;
    const downloadTarget = 180 + Math.random() * 160;
    const uploadTarget = 35 + Math.random() * 85;
    const pingTarget = 8 + Math.random() * 24;
    const jitterTarget = 1 + Math.random() * 8;

    state.timer = window.setInterval(() => {
      tick += 1;
      const progress = tick / totalTicks;
      const wave = Math.sin(progress * Math.PI);

      if (tick < 10) {
        renderValues({
          ping: pingTarget * progress * 3.5,
          jitter: jitterTarget * progress * 3.5,
        });
        setStatus('running', 'Midiendo ping y jitter...');
      } else if (tick < 29) {
        renderValues({
          ping: pingTarget,
          jitter: jitterTarget,
          download: downloadTarget * clamp(wave * 1.08, 0, 1),
        });
        setStatus('running', 'Midiendo descarga...');
      } else {
        renderValues({
          ping: pingTarget,
          jitter: jitterTarget,
          download: downloadTarget,
          upload: uploadTarget * clamp(wave * 1.2, 0, 1),
        });
        setStatus('running', 'Midiendo subida...');
      }

      if (tick >= totalTicks) {
        stopCurrentTimer();
        state.running = false;
        setButtons(false);
        renderValues({
          ping: pingTarget,
          jitter: jitterTarget,
          download: downloadTarget,
          upload: uploadTarget,
        });
        setStatus('finished', 'Simulacion completada. Cambia a modo LibreSpeed cuando el backend este disponible.');
      }
    }, 120);
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
    setStatus('running', 'Preparando prueba...');

    try {
      if (SPEEDTEST_CONFIG.mode === 'librespeed') {
        startLibreSpeedTest();
      } else {
        startDemoTest();
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
    setStatus('ready', 'Prueba detenida.');
  }

  function wireSpeedTest() {
    if (!$('speedtest-section')) return;

    setModeLabel(SPEEDTEST_CONFIG.mode);
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
    finish: () => setStatus('finished', 'Prueba completada correctamente.'),
  };

  document.addEventListener('DOMContentLoaded', wireSpeedTest);
})();
