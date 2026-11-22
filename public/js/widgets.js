/* Small interactive figures for the writing pages. Every figure is an illustrative mock.
   No network calls, no storage. Each block runs only if its figure is on the page. */
(function () {
  'use strict';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SVG = 'http://www.w3.org/2000/svg';
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function svg(tag, attrs) { var e = document.createElementNS(SVG, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }
  function press(group, btn) { group.forEach(function (b) { b.setAttribute('aria-pressed', b === btn ? 'true' : 'false'); }); }

  /* ---------- Lay of the land: terminal + chart ---------- */
  (function () {
    var root = $('lotl-demo'); if (!root) return;
    var RUNS = {
      day: {
        metric: 'CPU %, web tier (past 24h)',
        axis: ['10:00', '16:00', '22:00', '04:00', '10:00'],
        data: [31,33,30,35,58,89,91,72,48,38,34,33,31,30,29,28,30,29,28,30,32,34,33,31,32],
        release: 3.67, alerts: [4, 5],
        out: [
          '$ lotl --past-day',
          'Window   09 Nov 10:00 to 10 Nov 10:00',
          'Sources  New Relic, PagerDuty, Rollbar, GitHub',
          '',
          'INCIDENTS (2)',
          '  14:02  High CPU, web tier            New Relic   P2',
          '  14:05  Error rate 4.1% on /checkout  Rollbar',
          '',
          'LIKELY LINKED TO',
          '  Release web-api v2.31 at 13:40       GitHub',
          '  Path   PHP -> web servers',
          '  Why    spike began 22 min after release;',
          '         same shape seen twice in the past 14 days',
          '',
          'CONFIDENCE  medium (3 events, 1 release in window)',
          'NOT LINKED  03:10 disk alert, backup host (no overlap)',
          '',
          'Sent to #ops-daily'
        ]
      },
      '3h': {
        metric: 'Memory %, Redis (past 3h)',
        axis: ['07:00', '07:45', '08:30', '09:15', '10:00'],
        data: [44,45,45,46,47,47,48,49,50,50,51,52,53,53,54,55,56,57,58,60,61,63,66,71,79,88,90,86,70,58,52,49,48,47,47,46,46],
        release: null, alerts: [25],
        out: [
          '$ lotl --3h',
          'Window   10 Nov 07:00 to 10:00',
          'Sources  New Relic, PagerDuty, Rollbar, GitHub',
          '',
          'INCIDENTS (1)',
          '  09:05  Redis memory above 85%        PagerDuty   P3',
          '',
          'LIKELY LINKED TO',
          '  Path   Redis -> back end',
          '  Why    slow climb from 07:00, then a sharp rise;',
          '         no release in this window',
          '',
          'CONFIDENCE  low (pattern not seen before)',
          'NEXT STEP   check key growth on the back end'
        ]
      }
    };
    var out = $('lotl-out'), chart = $('lotl-chart'), axis = $('lotl-axis'), metric = $('lotl-metric');
    var tabs = Array.prototype.slice.call(root.querySelectorAll('[data-run]'));
    var timer = 0;

    function draw(r) {
      while (chart.firstChild) chart.removeChild(chart.firstChild);
      var W = 600, H = 160, pad = 8, n = r.data.length;
      function x(i) { return pad + i * (W - 2 * pad) / (n - 1); }
      function y(v) { return H - pad - v / 100 * (H - 2 * pad); }
      [25, 50, 75].forEach(function (v) { chart.appendChild(svg('line', { x1: pad, x2: W - pad, y1: y(v), y2: y(v), 'class': 'c-grid' })); });
      chart.appendChild(svg('line', { x1: pad, x2: W - pad, y1: y(85), y2: y(85), 'class': 'c-thresh' }));
      var pts = r.data.map(function (v, i) { return x(i).toFixed(1) + ',' + y(v).toFixed(1); });
      chart.appendChild(svg('path', { d: 'M' + x(0) + ',' + (H - pad) + ' L' + pts.join(' L') + ' L' + x(n - 1) + ',' + (H - pad) + ' Z', 'class': 'c-area' }));
      var line = svg('polyline', { points: pts.join(' '), 'class': 'c-line' });
      chart.appendChild(line);
      if (r.release != null) chart.appendChild(svg('line', { x1: x(r.release), x2: x(r.release), y1: pad, y2: H - pad, 'class': 'c-deploy' }));
      r.alerts.forEach(function (i) { chart.appendChild(svg('circle', { cx: x(i), cy: y(r.data[i]), r: 4.5, 'class': 'c-alert' })); });
      if (!reduce && line.getTotalLength) {
        var len = line.getTotalLength();
        line.style.strokeDasharray = len; line.style.strokeDashoffset = len;
        line.getBoundingClientRect();
        line.style.transition = 'stroke-dashoffset 1.2s ease';
        line.style.strokeDashoffset = '0';
      }
      axis.textContent = '';
      r.axis.forEach(function (t) { axis.appendChild(el('span', null, t)); });
      metric.textContent = r.metric;
    }

    function run(key) {
      var r = RUNS[key]; clearTimeout(timer);
      draw(r);
      if (reduce) { out.textContent = r.out.join('\n'); return; }
      var i = 0; out.textContent = '';
      (function next() {
        out.textContent += (i ? '\n' : '') + r.out[i]; i++;
        if (i < r.out.length) timer = setTimeout(next, i === 1 ? 420 : 70);
      })();
    }

    tabs.forEach(function (b) { b.addEventListener('click', function () { press(tabs, b); run(b.getAttribute('data-run')); }); });
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) { if (es[0].isIntersecting) { io.disconnect(); run('day'); } }, { threshold: .3 });
      io.observe(root);
    } else run('day');
  })();

  /* ---------- Guardrails as code: role switcher ---------- */
  (function () {
    var root = $('gr-demo'); if (!root) return;
    var SERVERS = ['docs', 'github', 'newrelic', 'database', 'helpdesk', 'finance-reports'];
    var LABEL = { rw: 'read-write', ro: 'read', no: 'blocked' };
    var ROLES = {
      engineer: { access: { docs: 'ro', github: 'rw', newrelic: 'ro', database: 'ro', helpdesk: 'no', 'finance-reports': 'no' },
        rules: ['no customer data in prompts', 'changes to main need a reviewed PR'] },
      support: { access: { docs: 'ro', github: 'no', newrelic: 'no', database: 'no', helpdesk: 'rw', 'finance-reports': 'no' },
        rules: ['never paste card numbers or ID documents', 'no actions outside the helpdesk'] },
      finance: { access: { docs: 'ro', github: 'no', newrelic: 'no', database: 'no', helpdesk: 'no', 'finance-reports': 'ro' },
        rules: ['no customer-level exports', 'reports are read-only'] }
    };
    var REQS = [
      { t: "Summarise yesterday's error spikes", s: 'newrelic', need: 'ro' },
      { t: "Find this customer's open tickets", s: 'helpdesk', need: 'ro' },
      { t: 'Push my fix straight to main', s: 'github', need: 'rw', review: true },
      { t: 'Delete old rows from the users table', s: 'database', need: 'rw' },
      { t: "Pull last quarter's revenue report", s: 'finance-reports', need: 'ro' }
    ];
    var role = 'engineer', where = 'laptop';
    var roleBtns = Array.prototype.slice.call(root.querySelectorAll('[data-role]'));
    var whereBtns = Array.prototype.slice.call(root.querySelectorAll('[data-where]'));
    var file = $('gr-file'), list = $('gr-servers'), lock = $('gr-lock'), reqs = $('gr-reqs'), verdict = $('gr-verdict');

    function render() {
      var r = ROLES[role], lines = [];
      lines.push(where === 'laptop' ? '# managed by IT, read-only for you' : '# .ai/policy.yaml, cloned with the repo');
      lines.push('role: ' + role, 'mcp:');
      SERVERS.forEach(function (s) { lines.push('  ' + s + ': ' + LABEL[r.access[s]]); });
      lines.push('rules:');
      r.rules.forEach(function (x) { lines.push('  - ' + x); });
      file.textContent = lines.join('\n');
      list.textContent = '';
      SERVERS.forEach(function (s) {
        var li = el('li', 'lv-' + r.access[s]);
        li.appendChild(el('span', null, s)); li.appendChild(el('b', null, LABEL[r.access[s]]));
        list.appendChild(li);
      });
      lock.textContent = where === 'laptop'
        ? 'Locked. Installed by the company; the user cannot edit it.'
        : 'Travels with git clone, but anyone can edit their local copy.';
      lock.className = 'gr-lock ' + where;
      verdict.textContent = 'Pick a request.'; verdict.className = 'gr-verdict';
    }

    function ask(q) {
      var have = ROLES[role].access[q.s], ok = have === 'rw' || (have === 'ro' && q.need === 'ro');
      var msg, cls;
      if (ok && q.review) { cls = 'warn'; msg = 'Allowed with review: the assistant opens a PR instead of pushing. Rule: changes to main need a reviewed PR.'; }
      else if (ok) { cls = 'ok'; msg = 'Allowed: ' + role + ' has ' + LABEL[have] + ' access to ' + q.s + '.'; }
      else { cls = 'no'; msg = 'Blocked: ' + role + (have === 'no' ? ' has no access to ' + q.s : ' has read-only access to ' + q.s) + '.';
        if (where === 'repo') msg += ' (In repo mode the user could edit the file and remove this block.)'; }
      verdict.textContent = msg; verdict.className = 'gr-verdict ' + cls;
    }

    REQS.forEach(function (q) { var b = el('button', 'chip', q.t); b.type = 'button'; b.addEventListener('click', function () { ask(q); }); reqs.appendChild(b); });
    roleBtns.forEach(function (b) { b.addEventListener('click', function () { press(roleBtns, b); role = b.getAttribute('data-role'); render(); }); });
    whereBtns.forEach(function (b) { b.addEventListener('click', function () { press(whereBtns, b); where = b.getAttribute('data-where'); render(); }); });
    render();
  })();

  /* ---------- Prompt book + Anti ---------- */
  (function () {
    var root = $('pb-demo'); if (!root) return;
    var BOOK = [
      { f: 'prompts/debug-flaky-test.md', by: 'John', t: 'Find why a test is flaky',
        p: 'Run the checkout tests 20 times and list which ones fail only sometimes. For each, show the failing assertion and any state shared between tests. Do not change code yet.' },
      { f: 'prompts/explain-a-service.md', by: 'Amaka', t: 'Explain an unfamiliar service',
        p: "I'm new to the billing service. Walk me through how a request goes from the API to the database, naming the files involved. Keep it under 300 words." },
      { f: 'prompts/plan-a-migration.md', by: 'Sam', t: 'Plan a database migration',
        p: 'Draft a migration that adds an index on orders.created_at. Explain the locking risk on a large table and include a rollback step.' }
    ];
    var ANTI = [
      { re: /\b(drop|truncate)\b[\s\w]*\btable\b|\bdelete\s+from\b/i, lv: 'no', m: 'anti/destructive-sql.md: no destructive SQL. Ask for a migration plan instead.' },
      { re: /\b(api[\s_-]?key|password|secret|token)\b/i, lv: 'no', m: 'anti/secrets.md: never paste credentials into a prompt.' },
      { re: /\b(restart|deploy|scale|redeploy)\b[\s\w]{0,20}\bprod(uction)?\b|\bprod(uction)?\b[\s\w]{0,20}\b(restart|deploy)\b/i, lv: 'warn', m: 'anti/production.md: production changes go through the release process. Plan it, do not run it.' }
    ];
    var search = $('pb-search'), list = $('pb-list'), text = $('pb-text'), anti = $('pb-anti');

    function check() {
      var v = text.value, hits = ANTI.filter(function (a) { return a.re.test(v); });
      anti.textContent = '';
      if (!v.trim()) { anti.className = 'pb-anti'; anti.textContent = 'Pick a prompt from the book.'; return; }
      if (!hits.length) { anti.className = 'pb-anti ok'; anti.textContent = 'Anti: no rules matched.'; return; }
      var worst = hits.some(function (h) { return h.lv === 'no'; }) ? 'no' : 'warn';
      anti.className = 'pb-anti ' + worst;
      anti.appendChild(el('strong', null, worst === 'no' ? 'Anti would block this.' : 'Anti flags this.'));
      hits.forEach(function (h) { anti.appendChild(el('span', null, h.m)); });
    }
    function show() {
      var q = search.value.trim().toLowerCase();
      list.textContent = '';
      BOOK.filter(function (b) { return !q || (b.t + ' ' + b.p + ' ' + b.f).toLowerCase().indexOf(q) > -1; }).forEach(function (b) {
        var li = el('li'), btn = el('button', 'pb-item'); btn.type = 'button';
        btn.appendChild(el('span', 'pb-t', b.t)); btn.appendChild(el('span', 'pb-f', b.f + ' · ' + b.by));
        btn.addEventListener('click', function () { text.value = b.p; check(); text.focus(); });
        li.appendChild(btn); list.appendChild(li);
      });
      if (!list.firstChild) list.appendChild(el('li', 'pb-none', 'Nothing yet. Write it and add it to the book.'));
    }
    search.addEventListener('input', show);
    text.addEventListener('input', check);
    Array.prototype.forEach.call(root.querySelectorAll('[data-add]'), function (b) {
      b.addEventListener('click', function () { if (!text.value) text.value = BOOK[0].p; text.value += b.getAttribute('data-add'); check(); });
    });
    show(); text.value = BOOK[0].p; check();
  })();

  /* ---------- Shorthand: typed vs sent ---------- */
  (function () {
    var root = $('sh-demo'); if (!root) return;
    var SH = [
      { k: '/incident-summary', x: 'Summarise incidents from the last 24 hours. Use the monitoring and paging tools only, read-only. Group alerts by service and time. For each group, list the evidence (alert, timestamp, release) and say how confident you are. Do not restart, deploy or change anything. Keep it under 200 words and end with open questions.' },
      { k: '/review-pr', x: 'Review the current pull request. Check for correctness bugs first, then security issues such as secrets, injection and missing auth checks, then test coverage. Quote the file and line for each finding, rank them by severity, and suggest a fix. Do not push, merge or comment on the PR.' }
    ];
    var btns = Array.prototype.slice.call(root.querySelectorAll('[data-sh]'));
    function show(i) {
      var s = SH[i];
      $('sh-typed').textContent = s.k.length + ' characters';
      $('sh-sent').textContent = s.x.length + ' characters, about ' + Math.round(s.x.length / 4) + ' tokens';
      $('sh-exp').textContent = s.x;
    }
    btns.forEach(function (b) { b.addEventListener('click', function () { press(btns, b); show(+b.getAttribute('data-sh')); }); });
    show(0);
  })();
})();
