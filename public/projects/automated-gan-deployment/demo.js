/*
 * In-browser demo for the MSc fraud classifier.
 *
 * Static only: no server, no API calls. Loads onnxruntime-web (pinned) from
 * cdn.jsdelivr.net on first use, then scores synthetic transactions locally.
 *
 * Preprocessing (see msc-project/DEMO-FEASIBILITY.md section 3): the z-score
 * scaling (x - mean) / std is baked into fraud.onnx, so this script sends RAW
 * features in the order Time, V1..V28, Amount. scaler.json (the training-split
 * mean and std, seed 123) is used here only to generate synthetic rows as
 * mean + z * std. Do not scale again in JS: that would double-normalise.
 */
(function () {
  'use strict';

  var BASE = '/projects/automated-gan-deployment/model/';
  var MODEL_URL = BASE + 'fraud.onnx';
  var SCALER_URL = BASE + 'scaler.json';
  var ORT_VERSION = '1.17.3';
  var ORT_DIST = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@' + ORT_VERSION + '/dist/';
  var ORT_SRC = ORT_DIST + 'ort.wasm.min.js';
  var ORT_SRI = 'sha384-IIbXcAhgJQi54B2BSFW89jOHuticITcB+QZcTVdOax8V9g6V4t9a3y6VoS0Psk+A';
  var THRESHOLD = 0.5; // deployed FRAUD_THRESHOLD

  var FEATURES = ['Time'];
  for (var i = 1; i <= 28; i++) FEATURES.push('V' + i);
  FEATURES.push('Amount');

  // Features exposed as sliders, in standard deviations from the training mean.
  var SLIDERS = ['Amount', 'V12', 'V14', 'V17'];

  var root = document.getElementById('fraud-demo');
  if (!root) return;

  var statusEl = document.getElementById('demo-status');
  var controlsEl = document.getElementById('demo-controls');
  var resultEl = document.getElementById('demo-result');
  var meterEl = document.getElementById('demo-meter-fill');
  var vectorEl = document.getElementById('demo-vector');
  var btnScore = document.getElementById('demo-score');
  var btnRandom = document.getElementById('demo-random');
  var btnReset = document.getElementById('demo-reset');

  var scaler = null;
  var z = new Array(30).fill(0);
  var modelAvailable = false;
  var sessionPromise = null;

  function setStatus(kind, text) {
    statusEl.className = 'demo-status is-' + kind;
    statusEl.textContent = text;
  }

  function idx(name) { return FEATURES.indexOf(name); }

  function rawRow() {
    var row = new Array(30);
    for (var j = 0; j < 30; j++) {
      var v = scaler.mean[j] + z[j] * scaler.std[j];
      // Time (seconds) and Amount cannot be negative in the source data.
      if ((j === 0 || j === 29) && v < 0) v = 0;
      row[j] = v;
    }
    return row;
  }

  function renderVector() {
    var row = rawRow();
    vectorEl.textContent = FEATURES.map(function (n, j) {
      return n + ' = ' + row[j].toFixed(4);
    }).join('\n');
  }

  function syncSliders() {
    SLIDERS.forEach(function (name) {
      var input = document.getElementById('sl-' + name);
      var out = document.getElementById('out-' + name);
      var j = idx(name);
      input.value = String(Math.max(-5, Math.min(5, z[j])));
      out.textContent = (z[j] >= 0 ? '+' : '') + z[j].toFixed(1) + ' sd';
    });
    renderVector();
  }

  function buildSliders() {
    SLIDERS.forEach(function (name) {
      var row = document.createElement('div');
      row.className = 'demo-row';
      var label = document.createElement('label');
      label.htmlFor = 'sl-' + name;
      label.textContent = name;
      var input = document.createElement('input');
      input.type = 'range';
      input.id = 'sl-' + name;
      input.min = '-5';
      input.max = '5';
      input.step = '0.1';
      input.value = '0';
      var out = document.createElement('output');
      out.id = 'out-' + name;
      out.htmlFor = input.id;
      input.addEventListener('input', function () {
        z[idx(name)] = parseFloat(input.value);
        syncSliders();
        clearResult();
      });
      row.appendChild(label);
      row.appendChild(input);
      row.appendChild(out);
      controlsEl.appendChild(row);
    });
  }

  // Box-Muller standard normal draw.
  function randn() {
    var u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function clearResult() {
    resultEl.textContent = modelAvailable
      ? 'Adjust the inputs, then press "Score this transaction".'
      : 'Scoring is disabled until the demo model is published.';
    meterEl.style.width = '0';
  }

  function loadOrt() {
    if (window.ort) return Promise.resolve(window.ort);
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = ORT_SRC;
      s.integrity = ORT_SRI;
      s.crossOrigin = 'anonymous';
      s.onload = function () {
        if (window.ort) resolve(window.ort);
        else reject(new Error('onnxruntime-web did not initialise'));
      };
      s.onerror = function () { reject(new Error('could not load onnxruntime-web from the CDN')); };
      document.head.appendChild(s);
    });
  }

  function getSession() {
    if (!sessionPromise) {
      sessionPromise = loadOrt().then(function (ort) {
        ort.env.wasm.wasmPaths = ORT_DIST;
        ort.env.wasm.numThreads = 1; // no SharedArrayBuffer needed
        ort.env.wasm.proxy = false;
        return ort.InferenceSession.create(MODEL_URL, { executionProviders: ['wasm'] });
      });
      sessionPromise.catch(function () { sessionPromise = null; });
    }
    return sessionPromise;
  }

  function score() {
    if (!modelAvailable) return;
    btnScore.disabled = true;
    resultEl.textContent = 'Loading the runtime and model (first run downloads about 10 MB)...';
    getSession().then(function (session) {
      var feeds = {};
      var inputName = session.inputNames[0];
      feeds[inputName] = new window.ort.Tensor('float32', Float32Array.from(rawRow()), [1, 30]);
      return session.run(feeds).then(function (out) {
        var p = out[session.outputNames[0]].data[0];
        if (!(p >= 0 && p <= 1)) throw new Error('unexpected model output: ' + p);
        var flagged = p >= THRESHOLD;
        resultEl.textContent = 'Fraud probability: ' + p.toFixed(4) + '\n' +
          'Decision at threshold 0.5: ' + (flagged ? 'FLAGGED as fraud' : 'not flagged');
        meterEl.style.width = (p * 100).toFixed(1) + '%';
        setStatus('ready', 'Model loaded. Scoring runs entirely in your browser.');
      });
    }).catch(function (err) {
      setStatus('error', 'The demo hit an error: ' + err.message + '. The rest of this page is unaffected.');
      resultEl.textContent = 'No prediction.';
    }).then(function () {
      btnScore.disabled = !modelAvailable;
    });
  }

  function checkModel() {
    // A missing file on Cloudflare Pages returns 404 (or the HTML 404 page).
    return fetch(MODEL_URL, { method: 'HEAD', cache: 'no-store' }).then(function (r) {
      var type = (r.headers.get('content-type') || '').toLowerCase();
      return r.ok && type.indexOf('text/html') === -1;
    }).catch(function () { return false; });
  }

  function init() {
    fetch(SCALER_URL, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('scaler.json not found');
      return r.json();
    }).then(function (s) {
      if (!s || s.feature_count !== 30 || !Array.isArray(s.mean) || !Array.isArray(s.std) ||
          s.mean.length !== 30 || s.std.length !== 30) {
        throw new Error('scaler.json is not the expected 30-feature file');
      }
      scaler = s;
      buildSliders();
      syncSliders();
      btnRandom.disabled = false;
      btnReset.disabled = false;
      return checkModel();
    }).then(function (available) {
      if (scaler === null) return;
      modelAvailable = available;
      btnScore.disabled = !available;
      if (available) {
        setStatus('ready', 'Demo model found. Press "Score this transaction" to load it.');
      } else {
        setStatus('missing', 'Demo model not yet published. You can still build synthetic inputs below; scoring switches on once fraud.onnx is uploaded.');
      }
      clearResult();
    }).catch(function (err) {
      setStatus('error', 'Demo unavailable: ' + err.message + '.');
      resultEl.textContent = 'No prediction.';
    });

    btnRandom.addEventListener('click', function () {
      for (var j = 0; j < 30; j++) z[j] = randn();
      syncSliders();
      clearResult();
    });
    btnReset.addEventListener('click', function () {
      z = new Array(30).fill(0);
      syncSliders();
      clearResult();
    });
    btnScore.addEventListener('click', score);
  }

  init();
})();
