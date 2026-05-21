/**
 * Dashboard Handler — AEB Web Console
 * Returns a self-contained HTML dashboard for monitoring the Agent Energy Bridge.
 */

const fs = require('fs');
const path = require('path');

// Inline dashboard HTML — zero external dependencies
const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Agent Energy Bridge — Dashboard</title>
  <style>
    :root {
      --bg: #0d1117;
      --bg-card: #161b22;
      --bg-hover: #1c2128;
      --border: #30363d;
      --text: #c9d1d9;
      --text-muted: #8b949e;
      --accent: #58a6ff;
      --accent-glow: rgba(88, 166, 255, 0.15);
      --success: #3fb950;
      --warning: #d29922;
      --danger: #f85149;
      --info: #a371f7;
      --font-mono: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
      --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--font-sans);
      font-size: 14px;
      line-height: 1.5;
      min-height: 100vh;
    }
    header {
      background: var(--bg-card);
      border-bottom: 1px solid var(--border);
      padding: 16px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      z-index: 10;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand-icon {
      width: 32px; height: 32px;
      background: linear-gradient(135deg, var(--accent), var(--info));
      border-radius: 8px;
      display: flex; align-items: center; justify-content: center;
      font-weight: bold; font-size: 16px;
      color: #fff;
    }
    .brand-text h1 {
      font-size: 16px; font-weight: 600; letter-spacing: -0.3px;
    }
    .brand-text span {
      font-size: 12px; color: var(--text-muted);
    }
    .status-pill {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 4px 12px; border-radius: 12px;
      font-size: 12px; font-weight: 500;
      background: var(--bg-hover); border: 1px solid var(--border);
    }
    .status-pill .dot {
      width: 8px; height: 8px; border-radius: 50%;
      background: var(--text-muted);
      animation: pulse 2s infinite;
    }
    .status-pill.online .dot { background: var(--success); }
    .status-pill.offline .dot { background: var(--danger); animation: none; }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
    .refresh-btn {
      background: var(--bg-hover); border: 1px solid var(--border);
      color: var(--text); padding: 6px 14px; border-radius: 6px;
      font-size: 12px; cursor: pointer; transition: all 0.2s;
      display: flex; align-items: center; gap: 6px;
    }
    .refresh-btn:hover { background: var(--border); }
    .refresh-btn:active { transform: scale(0.97); }
    .refresh-btn.spinning svg { animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    main { padding: 24px; max-width: 1400px; margin: 0 auto; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 16px;
      margin-bottom: 16px;
    }
    .card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    .card:hover {
      border-color: var(--accent);
      box-shadow: 0 0 0 3px var(--accent-glow);
    }
    .card-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 16px;
    }
    .card-title {
      font-size: 13px; font-weight: 600; color: var(--text-muted);
      text-transform: uppercase; letter-spacing: 0.5px;
    }
    .card-value {
      font-size: 28px; font-weight: 700; font-family: var(--font-mono);
      margin-bottom: 4px;
    }
    .card-sub {
      font-size: 12px; color: var(--text-muted);
    }
    .card-value.success { color: var(--success); }
    .card-value.warning { color: var(--warning); }
    .card-value.danger { color: var(--danger); }
    .card-value.accent { color: var(--accent); }

    .table-wrap {
      overflow-x: auto;
      margin-top: 12px;
    }
    table {
      width: 100%; border-collapse: collapse;
      font-size: 12px;
    }
    th {
      text-align: left; padding: 8px 12px;
      color: var(--text-muted); font-weight: 500;
      border-bottom: 1px solid var(--border);
      white-space: nowrap;
    }
    td {
      padding: 8px 12px; border-bottom: 1px solid var(--border);
      white-space: nowrap;
    }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: var(--bg-hover); }
    .tag {
      display: inline-block; padding: 2px 8px; border-radius: 4px;
      font-size: 11px; font-weight: 500;
      background: var(--bg-hover); border: 1px solid var(--border);
    }
    .tag.green { background: rgba(63,185,80,0.15); color: var(--success); border-color: rgba(63,185,80,0.3); }
    .tag.yellow { background: rgba(210,153,34,0.15); color: var(--warning); border-color: rgba(210,153,34,0.3); }
    .tag.red { background: rgba(248,81,73,0.15); color: var(--danger); border-color: rgba(248,81,73,0.3); }
    .tag.purple { background: rgba(163,113,247,0.15); color: var(--info); border-color: rgba(163,113,247,0.3); }
    .tag.blue { background: rgba(88,166,255,0.15); color: var(--accent); border-color: rgba(88,166,255,0.3); }

    .model-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 12px;
      margin-top: 12px;
    }
    .model-card {
      background: var(--bg-hover); border: 1px solid var(--border);
      border-radius: 8px; padding: 14px;
    }
    .model-card h4 {
      font-size: 13px; font-weight: 600; margin-bottom: 6px;
      display: flex; align-items: center; justify-content: space-between;
    }
    .model-card p {
      font-size: 11px; color: var(--text-muted); margin-bottom: 4px;
    }
    .model-card .caps {
      display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px;
    }
    .cap-tag {
      font-size: 10px; padding: 2px 6px; border-radius: 3px;
      background: var(--bg); color: var(--text-muted);
    }

    .progress-bar {
      width: 100%; height: 6px; background: var(--bg-hover);
      border-radius: 3px; margin-top: 8px; overflow: hidden;
    }
    .progress-fill {
      height: 100%; border-radius: 3px;
      background: linear-gradient(90deg, var(--accent), var(--info));
      transition: width 0.5s ease;
    }

    .endpoint-list {
      margin-top: 12px;
    }
    .endpoint-item {
      display: flex; align-items: center; gap: 10px;
      padding: 6px 0; border-bottom: 1px solid var(--border);
      font-size: 12px; font-family: var(--font-mono);
    }
    .endpoint-item:last-child { border-bottom: none; }
    .endpoint-method {
      padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 600;
      min-width: 48px; text-align: center;
    }
    .method-get { background: rgba(88,166,255,0.15); color: var(--accent); }
    .method-post { background: rgba(63,185,80,0.15); color: var(--success); }

    .error-state {
      text-align: center; padding: 40px 20px; color: var(--text-muted);
    }
    .error-state svg {
      width: 48px; height: 48px; margin-bottom: 12px;
      stroke: var(--danger);
    }
    .loading {
      display: flex; align-items: center; justify-content: center;
      gap: 8px; padding: 40px; color: var(--text-muted);
    }
    .loading::after {
      content: ''; width: 16px; height: 16px;
      border: 2px solid var(--border);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    footer {
      text-align: center; padding: 24px;
      color: var(--text-muted); font-size: 12px;
      border-top: 1px solid var(--border);
      margin-top: 24px;
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <div class="brand-icon">⚡</div>
      <div class="brand-text">
        <h1>Agent Energy Bridge</h1>
        <span>AI Gateway Energy Monitor</span>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:12px;">
      <span id="conn-status" class="status-pill offline">
        <span class="dot"></span>
        <span id="conn-text">Connecting...</span>
      </span>
      <button class="refresh-btn" id="refresh-btn" onclick="refreshAll()">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="23 4 23 10 17 10"></polyline>
          <polyline points="1 20 1 14 7 14"></polyline>
          <path d="M3.51 9a9 9 0 0114.13-3.36L23 10M1 14l5.36 4.36A9 9 0 0020.49 15"></path>
        </svg>
        Refresh
      </button>
    </div>
  </header>

  <main>
    <div class="grid" id="overview-grid">
      <div class="card">
        <div class="card-header"><div class="card-title">Available Balance</div></div>
        <div class="card-value accent" id="balance-val">—</div>
        <div class="card-sub" id="balance-sub">Loading...</div>
        <div class="progress-bar"><div class="progress-fill" id="balance-bar" style="width:0%"></div></div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">Daily Spent</div></div>
        <div class="card-value" id="spent-val">—</div>
        <div class="card-sub" id="spent-sub">Loading...</div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">Hourly Tokens</div></div>
        <div class="card-value" id="tokens-val">—</div>
        <div class="card-sub" id="tokens-sub">Loading...</div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">Auto-Refuel</div></div>
        <div class="card-value" id="refuel-val">—</div>
        <div class="card-sub" id="refuel-sub">Loading...</div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">Routes Health</div></div>
        <div class="card-value" id="routes-val">—</div>
        <div class="card-sub" id="routes-sub">Loading...</div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">Notifications</div></div>
        <div class="card-value" id="notify-val">—</div>
        <div class="card-sub" id="notify-sub">Loading...</div>
      </div>
    </div>

    <div class="grid" style="grid-template-columns: 1fr 1fr;">
      <div class="card">
        <div class="card-header">
          <div class="card-title">Model Capabilities</div>
          <span class="tag blue" id="model-count">—</span>
        </div>
        <div id="models-container" class="loading"></div>
      </div>
      <div class="card">
        <div class="card-header">
          <div class="card-title">Route Health Check</div>
          <span class="tag" id="route-badge">—</span>
        </div>
        <div id="routes-container" class="loading"></div>
      </div>
    </div>

    <div class="grid" style="grid-template-columns: 1fr 1fr;">
      <div class="card">
        <div class="card-header">
          <div class="card-title">Refuel Status</div>
          <span class="tag" id="refuel-badge">—</span>
        </div>
        <div id="refuel-container" class="loading"></div>
      </div>
      <div class="card">
        <div class="card-header">
          <div class="card-title">Notification Channels</div>
          <span class="tag" id="channel-badge">—</span>
        </div>
        <div id="notify-container" class="loading"></div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <div class="card-title">API Endpoints</div>
        <span class="tag blue">REST API</span>
      </div>
      <div class="endpoint-list" id="endpoint-list"></div>
    </div>
  </main>

  <footer>
    Agent Energy Bridge v0.1.0 · Zero External Dependencies · MIT License
  </footer>

  <script>
    const API_PREFIX = '/agent/v1';
    let autoRefresh = null;

    async function fetchJSON(path) {
      try {
        const res = await fetch(path);
        if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
        return await res.json();
      } catch (e) {
        return { success: false, error: e.message };
      }
    }

    function setStatus(online, text) {
      const el = document.getElementById('conn-status');
      const txt = document.getElementById('conn-text');
      el.className = 'status-pill ' + (online ? 'online' : 'offline');
      txt.textContent = text;
    }

    function fmtNum(n) {
      if (n === null || n === undefined) return '—';
      if (n >= 1000000) return (n/1000000).toFixed(1) + 'M';
      if (n >= 1000) return (n/1000).toFixed(1) + 'K';
      return n.toString();
    }

    function fmtUsd(n) {
      if (n === null || n === undefined) return '—';
      return '$' + Number(n).toFixed(2);
    }

    async function loadHealth() {
      const data = await fetchJSON(API_PREFIX + '/health');
      if (data.success) {
        setStatus(true, data.status === 'ok' ? 'Online' : 'Degraded');
        return data;
      } else {
        setStatus(false, 'Offline');
        return null;
      }
    }

    async function loadBalance() {
      const data = await fetchJSON(API_PREFIX + '/balance');
      if (data.success && data.balance) {
        const b = data.balance;
        document.getElementById('balance-val').textContent = fmtUsd(b.availableUsd);
        document.getElementById('balance-sub').textContent = 'Balance: ' + fmtUsd(b.balanceUsd);
        const pct = Math.min(100, Math.max(0, (b.availableUsd / Math.max(b.balanceUsd, 1)) * 100));
        document.getElementById('balance-bar').style.width = pct + '%';
      } else {
        document.getElementById('balance-val').textContent = 'Error';
      }
    }

    async function loadUsage() {
      const data = await fetchJSON(API_PREFIX + '/usage/summary');
      if (data.success && data.usage) {
        const u = data.usage;
        document.getElementById('spent-val').textContent = fmtUsd(u.dailySpentUsd);
        document.getElementById('spent-sub').textContent = u.autoPurchasedUsdToday > 0
          ? 'Auto-refueled $' + u.autoPurchasedUsdToday + ' today'
          : 'No auto-refuel today';
        document.getElementById('tokens-val').textContent = fmtNum(u.hourlyTokensUsed);
        document.getElementById('tokens-sub').textContent = 'Hourly usage';
        document.getElementById('refuel-val').textContent = u.autoRefuelsToday;
        document.getElementById('refuel-sub').textContent = u.autoRefuelsToday > 0
          ? 'Refuels performed today'
          : 'No refuels today';
      }
    }

    async function loadModels() {
      const data = await fetchJSON(API_PREFIX + '/models/capabilities');
      const container = document.getElementById('models-container');
      if (data.success && data.models) {
        document.getElementById('model-count').textContent = data.count + ' models';
        let html = '<div class="model-grid">';
        data.models.forEach(m => {
          const tierClass = m.budgetTier === 'free' ? 'green' : m.budgetTier === 'premium' ? 'purple' : 'blue';
          html += '<div class="model-card">';
          html += '<h4>' + escapeHtml(m.label) + '<span class="tag ' + tierClass + '">' + m.budgetTier + '</span></h4>';
          html += '<p>' + m.provider + ' · ' + fmtUsd(m.pricePer1kUsd * 1000) + '/1M tokens</p>';
          html += '<div class="caps">';
          (m.capabilities || []).forEach(c => {
            html += '<span class="cap-tag">' + escapeHtml(c) + '</span>';
          });
          html += '</div></div>';
        });
        html += '</div>';
        container.innerHTML = html;
      } else {
        container.innerHTML = '<div class="error-state">Failed to load models</div>';
      }
    }

    async function loadRoutes() {
      const health = await loadHealth();
      const container = document.getElementById('routes-container');
      if (health && health.routes && health.routes.routes) {
        const routes = health.routes.routes;
        const healthy = routes.filter(r => r.status === 'healthy').length;
        const unhealthy = routes.filter(r => r.status === 'unhealthy').length;
        document.getElementById('routes-val').textContent = healthy + '/' + routes.length;
        document.getElementById('routes-sub').textContent = unhealthy > 0
          ? unhealthy + ' unhealthy route(s)'
          : 'All routes healthy';
        document.getElementById('route-badge').textContent = healthy + '/' + routes.length;
        document.getElementById('route-badge').className = 'tag ' + (unhealthy > 0 ? 'yellow' : 'green');

        let html = '<table><thead><tr><th>Name</th><th>Status</th><th>Latency</th><th>Success</th></tr></thead><tbody>';
        routes.forEach(r => {
          const statusClass = r.status === 'healthy' ? 'green' : r.status === 'unhealthy' ? 'red' : 'yellow';
          html += '<tr>';
          html += '<td>' + escapeHtml(r.name) + '</td>';
          html += '<td><span class="tag ' + statusClass + '">' + r.status + '</span></td>';
          html += '<td>' + (r.latencyMs ? r.latencyMs + 'ms' : '—') + '</td>';
          html += '<td>' + (typeof r.successRate === 'number' ? (r.successRate * 100).toFixed(0) + '%' : '—') + '</td>';
          html += '</tr>';
        });
        html += '</tbody></table>';
        container.innerHTML = html;
      } else {
        container.innerHTML = '<div class="error-state">No routes configured</div>';
      }
    }

    async function loadRefuel() {
      const data = await fetchJSON(API_PREFIX + '/refuel/status');
      const container = document.getElementById('refuel-container');
      if (data.stats) {
        const s = data.stats;
        const degraded = s.degraded;
        document.getElementById('refuel-badge').textContent = degraded ? 'Degraded' : 'Active';
        document.getElementById('refuel-badge').className = 'tag ' + (degraded ? 'red' : 'green');

        let html = '<table><tbody>';
        html += '<tr><td>Total Refueled</td><td>' + fmtUsd(s.totalRefueledUsd) + '</td></tr>';
        html += '<tr><td>Refuel Count</td><td>' + s.refuelCount + '</td></tr>';
        html += '<tr><td>Threshold</td><td>' + fmtUsd(s.threshold || 5) + '</td></tr>';
        html += '<tr><td>Max/Hour</td><td>' + s.maxRefuelsPerHour + '</td></tr>';
        html += '<tr><td>Cooldown</td><td>' + (s.cooldownMs / 1000) + 's</td></tr>';
        html += '<tr><td>Remaining Codes</td><td>' + (s.remainingRefuelCodes ?? '—') + '</td></tr>';
        html += '</tbody></table>';

        if (data.alertLog && data.alertLog.length > 0) {
          html += '<div style="margin-top:12px;"><div class="card-title">Recent Alerts</div>';
          html += '<table><thead><tr><th>Type</th><th>Time</th></tr></thead><tbody>';
          data.alertLog.slice(0, 5).forEach(a => {
            html += '<tr><td><span class="tag ' + (a.type.includes('success') ? 'green' : 'yellow') + '">' + a.type + '</span></td>';
            html += '<td>' + new Date(a.timestamp).toLocaleTimeString() + '</td></tr>';
          });
          html += '</tbody></table></div>';
        }
        container.innerHTML = html;
      } else {
        container.innerHTML = '<div class="error-state">Refuel not configured</div>';
      }
    }

    async function loadNotify() {
      const data = await fetchJSON(API_PREFIX + '/notify/config');
      const container = document.getElementById('notify-container');
      if (data.availableChannels) {
        const configured = data.configuredChannels || [];
        document.getElementById('notify-val').textContent = configured.length;
        document.getElementById('notify-sub').textContent = configured.length > 0
          ? configured.join(', ') + ' active'
          : 'No channels configured';
        document.getElementById('channel-badge').textContent = configured.length + '/' + data.availableChannels.length;
        document.getElementById('channel-badge').className = 'tag ' + (configured.length > 0 ? 'green' : 'yellow');

        let html = '<table><thead><tr><th>Channel</th><th>Status</th></tr></thead><tbody>';
        data.availableChannels.forEach(ch => {
          const active = configured.includes(ch);
          html += '<tr><td>' + ch + '</td><td><span class="tag ' + (active ? 'green' : 'red') + '">' + (active ? 'ON' : 'OFF') + '</span></td></tr>';
        });
        html += '</tbody></table>';
        html += '<div style="margin-top:8px;font-size:11px;color:var(--text-muted);">Dedup window: ' + (data.dedupWindowMs / 1000) + 's</div>';
        container.innerHTML = html;
      } else {
        container.innerHTML = '<div class="error-state">Notification service not configured</div>';
      }
    }

    function renderEndpoints() {
      const endpoints = [
        { m: 'GET',  p: '/agent/v1/health',            d: 'Health check' },
        { m: 'GET',  p: '/agent/v1/balance',            d: 'Query balance' },
        { m: 'GET',  p: '/agent/v1/usage/summary',      d: 'Usage summary' },
        { m: 'GET',  p: '/agent/v1/models/capabilities', d: 'Model list' },
        { m: 'POST', p: '/agent/v1/recommend',          d: 'Model recommendation' },
        { m: 'POST', p: '/agent/v1/optimize',           d: 'Budget optimization' },
        { m: 'POST', p: '/agent/v1/refuel/redeem',      d: 'Redeem code' },
        { m: 'POST', p: '/agent/v1/keys/issue',         d: 'Issue API key' },
        { m: 'POST', p: '/agent/v1/session/report',     d: 'Report session' },
        { m: 'GET',  p: '/agent/v1/ops/snapshot',       d: 'Ops snapshot' },
        { m: 'GET',  p: '/agent/v1/ops/report',         d: 'Ops report' },
        { m: 'GET',  p: '/agent/v1/notify/config',      d: 'Notify config' },
        { m: 'POST', p: '/agent/v1/notify/test',        d: 'Test notification' },
        { m: 'GET',  p: '/agent/v1/refuel/status',      d: 'Refuel status' },
      ];
      let html = '';
      endpoints.forEach(ep => {
        html += '<div class="endpoint-item">';
        html += '<span class="endpoint-method method-' + ep.m.toLowerCase() + '">' + ep.m + '</span>';
        html += '<span>' + ep.p + '</span>';
        html += '<span style="margin-left:auto;color:var(--text-muted);">' + ep.d + '</span>';
        html += '</div>';
      });
      document.getElementById('endpoint-list').innerHTML = html;
    }

    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    async function refreshAll() {
      const btn = document.getElementById('refresh-btn');
      btn.classList.add('spinning');
      btn.disabled = true;

      await Promise.all([
        loadHealth(),
        loadBalance(),
        loadUsage(),
        loadModels(),
        loadRoutes(),
        loadRefuel(),
        loadNotify(),
      ]);

      btn.classList.remove('spinning');
      btn.disabled = false;
    }

    // Initial load
    renderEndpoints();
    refreshAll();

    // Auto refresh every 10s
    autoRefresh = setInterval(refreshAll, 10000);
  </script>
</body>
</html>
`;

function getDashboard(request, response, context) {
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-cache, no-store, must-revalidate',
  });
  response.end(DASHBOARD_HTML);
}

module.exports = { getDashboard };
