interface Env {
  DB: D1Database;
  AI: Ai;
}

interface Feedback {
  id: number;
  source: string;
  source_id: string | null;
  author: string;
  content: string;
  created_at: string;
  urgency: string | null;
  sentiment: string | null;
  category: string | null;
  triage_status: string | null;
  triaged_at: string | null;
  resolved_at: string | null;
}

type TriageStatus = 'escalate' | 'backlog' | 'duplicate' | 'noise';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // API Routes
    if (path === '/api/queue' && request.method === 'GET') {
      return handleQueue(env);
    }
    if (path === '/api/triage' && request.method === 'POST') {
      return handleTriage(request, env);
    }
    if (path === '/api/stats' && request.method === 'GET') {
      return handleStats(env);
    }
    if (path === '/api/triaged' && request.method === 'GET') {
      return handleTriaged(url, env);
    }
    if (path === '/api/resolve' && request.method === 'POST') {
      return handleResolve(request, env);
    }

    // Serve pages
    if (path === '/review') {
      return new Response(REVIEW_HTML, {
        headers: { 'Content-Type': 'text/html' },
      });
    }

    return new Response(HTML, {
      headers: { 'Content-Type': 'text/html' },
    });
  },
} satisfies ExportedHandler<Env>;

// GET /api/queue - Fetch next untriaged feedback item
async function handleQueue(env: Env): Promise<Response> {
  const result = await env.DB.prepare(`
    SELECT * FROM feedback
    WHERE triage_status IS NULL
    ORDER BY
      CASE urgency
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        WHEN 'low' THEN 4
        ELSE 5
      END,
      created_at ASC
    LIMIT 1
  `).first<Feedback>();

  if (!result) {
    return Response.json({ item: null, remaining: 0 });
  }

  // Get remaining count
  const countResult = await env.DB.prepare(`
    SELECT COUNT(*) as count FROM feedback WHERE triage_status IS NULL
  `).first<{ count: number }>();

  return Response.json({
    item: result,
    remaining: countResult?.count || 0,
  });
}

// POST /api/triage - Record a triage decision
async function handleTriage(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as { id: number; status: TriageStatus };

  if (!body.id || !body.status) {
    return Response.json({ error: 'Missing id or status' }, { status: 400 });
  }

  const validStatuses: TriageStatus[] = ['escalate', 'backlog', 'duplicate', 'noise'];
  if (!validStatuses.includes(body.status)) {
    return Response.json({ error: 'Invalid status' }, { status: 400 });
  }

  await env.DB.prepare(`
    UPDATE feedback
    SET triage_status = ?, triaged_at = datetime('now')
    WHERE id = ?
  `).bind(body.status, body.id).run();

  return Response.json({ success: true });
}

// GET /api/stats - Return triage stats and emerging themes
async function handleStats(env: Env): Promise<Response> {
  // Triaged today
  const todayResult = await env.DB.prepare(`
    SELECT COUNT(*) as count FROM feedback
    WHERE triaged_at >= date('now')
  `).first<{ count: number }>();

  // By decision type
  const byDecision = await env.DB.prepare(`
    SELECT triage_status, COUNT(*) as count
    FROM feedback
    WHERE triage_status IS NOT NULL
    GROUP BY triage_status
  `).all<{ triage_status: string; count: number }>();

  // Pending count
  const pendingResult = await env.DB.prepare(`
    SELECT COUNT(*) as count FROM feedback WHERE triage_status IS NULL
  `).first<{ count: number }>();

  // Emerging themes (top categories from recent untriaged + escalated)
  const themes = await env.DB.prepare(`
    SELECT category, COUNT(*) as count
    FROM feedback
    WHERE (triage_status IS NULL OR triage_status = 'escalate')
      AND category IS NOT NULL
    GROUP BY category
    ORDER BY count DESC
    LIMIT 5
  `).all<{ category: string; count: number }>();

  // Source breakdown
  const bySources = await env.DB.prepare(`
    SELECT source, COUNT(*) as count
    FROM feedback
    WHERE triage_status IS NULL
    GROUP BY source
  `).all<{ source: string; count: number }>();

  return Response.json({
    triaged_today: todayResult?.count || 0,
    pending: pendingResult?.count || 0,
    by_decision: byDecision.results || [],
    emerging_themes: themes.results || [],
    by_source: bySources.results || [],
  });
}

// GET /api/triaged - Fetch triaged feedback items
async function handleTriaged(url: URL, env: Env): Promise<Response> {
  const status = url.searchParams.get('status');
  const showResolved = url.searchParams.get('resolved') === 'true';

  let query = `
    SELECT * FROM feedback
    WHERE triage_status IS NOT NULL
  `;
  const params: string[] = [];

  if (status) {
    query += ` AND triage_status = ?`;
    params.push(status);
  }

  if (!showResolved) {
    query += ` AND resolved_at IS NULL`;
  }

  query += ` ORDER BY
    CASE triage_status
      WHEN 'escalate' THEN 1
      WHEN 'backlog' THEN 2
      WHEN 'duplicate' THEN 3
      WHEN 'noise' THEN 4
    END,
    triaged_at DESC
  `;

  const stmt = env.DB.prepare(query);
  const result = params.length > 0
    ? await stmt.bind(...params).all<Feedback>()
    : await stmt.all<Feedback>();

  return Response.json({ items: result.results || [] });
}

// POST /api/resolve - Mark feedback as resolved/fixed
async function handleResolve(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as { id: number; resolved: boolean };

  if (!body.id || typeof body.resolved !== 'boolean') {
    return Response.json({ error: 'Missing id or resolved status' }, { status: 400 });
  }

  if (body.resolved) {
    await env.DB.prepare(`
      UPDATE feedback SET resolved_at = datetime('now') WHERE id = ?
    `).bind(body.id).run();
  } else {
    await env.DB.prepare(`
      UPDATE feedback SET resolved_at = NULL WHERE id = ?
    `).bind(body.id).run();
  }

  return Response.json({ success: true });
}

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Feedback Triage Queue</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #09090b;
      color: #e4e4e7;
      min-height: 100vh;
      line-height: 1.5;
    }
    .layout {
      display: grid;
      grid-template-columns: 1fr 320px;
      min-height: 100vh;
    }
    .main-area {
      padding: 48px 56px;
      display: flex;
      flex-direction: column;
    }
    header {
      margin-bottom: 40px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    h1 {
      font-size: 28px;
      font-weight: 600;
      color: #fafafa;
      letter-spacing: -0.5px;
    }
    .subtitle {
      color: #71717a;
      font-size: 14px;
      margin-top: 4px;
    }
    .nav-link {
      color: #71717a;
      text-decoration: none;
      font-size: 14px;
      padding: 8px 16px;
      border-radius: 8px;
      background: #18181b;
      border: 1px solid #27272a;
      transition: all 0.15s;
    }
    .nav-link:hover { background: #27272a; color: #e4e4e7; }
    .feedback-card {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 16px;
      padding: 32px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2);
    }
    .meta {
      display: flex;
      gap: 10px;
      margin-bottom: 24px;
      flex-wrap: wrap;
    }
    .badge {
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .source { background: #1e3a5f; color: #60a5fa; }
    .urgency-critical { background: #450a0a; color: #fca5a5; border: 1px solid #7f1d1d; }
    .urgency-high { background: #431407; color: #fdba74; }
    .urgency-medium { background: #422006; color: #fcd34d; }
    .urgency-low { background: #14532d; color: #86efac; }
    .sentiment-positive { background: #14532d; color: #86efac; }
    .sentiment-neutral { background: #27272a; color: #a1a1aa; }
    .sentiment-negative { background: #450a0a; color: #fca5a5; }
    .category { background: #2e1065; color: #c4b5fd; }
    .author {
      font-size: 13px;
      color: #71717a;
      margin-bottom: 16px;
      font-weight: 500;
    }
    .content {
      font-size: 18px;
      line-height: 1.7;
      color: #e4e4e7;
    }
    .timestamp {
      font-size: 12px;
      color: #52525b;
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid #27272a;
    }
    .actions {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 16px;
      margin-top: 32px;
    }
    .btn {
      padding: 20px 24px;
      border: none;
      border-radius: 12px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    }
    .btn:hover { transform: translateY(-2px); box-shadow: 0 4px 16px rgba(0,0,0,0.4); }
    .btn:active { transform: translateY(0); }
    .btn:disabled { opacity: 0.4; cursor: not-allowed; transform: none; box-shadow: none; }
    .btn-escalate { background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: white; }
    .btn-escalate:hover:not(:disabled) { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); }
    .btn-backlog { background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: white; }
    .btn-backlog:hover:not(:disabled) { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); }
    .btn-duplicate { background: linear-gradient(135deg, #d97706 0%, #b45309 100%); color: white; }
    .btn-duplicate:hover:not(:disabled) { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); }
    .btn-noise { background: linear-gradient(135deg, #3f3f46 0%, #27272a 100%); color: #a1a1aa; }
    .btn-noise:hover:not(:disabled) { background: linear-gradient(135deg, #52525b 0%, #3f3f46 100%); color: #d4d4d8; }
    .btn-label { font-size: 15px; }
    .kbd {
      background: rgba(0,0,0,0.3);
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-family: ui-monospace, monospace;
      font-weight: 700;
      letter-spacing: 1px;
    }
    .sidebar {
      background: #111113;
      border-left: 1px solid #27272a;
      padding: 32px 24px;
      display: flex;
      flex-direction: column;
      gap: 28px;
    }
    .stat-card {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    }
    h2 {
      font-size: 11px;
      font-weight: 700;
      color: #52525b;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 16px;
    }
    .stat-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 0;
      border-bottom: 1px solid #27272a;
    }
    .stat-row:last-child { border-bottom: none; }
    .stat-label { color: #a1a1aa; font-size: 13px; }
    .stat-value { font-weight: 700; font-size: 15px; color: #fafafa; }
    .stat-value.pending { color: #fbbf24; font-size: 20px; }
    .stat-value.escalate { color: #f87171; }
    .stat-value.backlog { color: #60a5fa; }
    .stat-value.duplicate { color: #fbbf24; }
    .stat-value.noise { color: #71717a; }
    .theme-list { list-style: none; }
    .theme-item {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      font-size: 13px;
    }
    .theme-name { color: #c4b5fd; font-weight: 500; }
    .theme-count {
      color: #52525b;
      background: #27272a;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
    }
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px 0;
      color: #52525b;
    }
    .empty-state svg {
      width: 64px;
      height: 64px;
      margin-bottom: 16px;
      opacity: 0.4;
    }
    .empty-state span { font-size: 16px; }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(12px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .fade-in { animation: fadeIn 0.25s ease-out; }
    .queue-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #27272a;
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 12px;
      color: #a1a1aa;
      margin-left: 12px;
    }
    .queue-badge strong { color: #fbbf24; font-size: 14px; }
  </style>
</head>
<body>
  <div class="layout">
    <div class="main-area">
      <header>
        <div>
          <h1>Feedback Triage<span class="queue-badge"><strong id="header-pending">-</strong> in queue</span></h1>
          <p class="subtitle">Review and categorize customer feedback</p>
        </div>
        <a href="/review" class="nav-link">Review Issues</a>
      </header>

      <div class="feedback-card" id="feedback-card">
        <div class="empty-state" id="empty-state">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <span>Loading...</span>
        </div>
        <div id="feedback-content" style="display: none;"></div>
      </div>

      <div class="actions">
        <button class="btn btn-escalate" id="btn-escalate" disabled>
          <span class="btn-label">Escalate</span>
          <span class="kbd">E</span>
        </button>
        <button class="btn btn-backlog" id="btn-backlog" disabled>
          <span class="btn-label">Backlog</span>
          <span class="kbd">B</span>
        </button>
        <button class="btn btn-duplicate" id="btn-duplicate" disabled>
          <span class="btn-label">Duplicate</span>
          <span class="kbd">D</span>
        </button>
        <button class="btn btn-noise" id="btn-noise" disabled>
          <span class="btn-label">Noise</span>
          <span class="kbd">N</span>
        </button>
      </div>
    </div>

    <div class="sidebar">
      <div class="stat-card">
        <h2>Queue Status</h2>
        <div class="stat-row">
          <span class="stat-label">Pending</span>
          <span class="stat-value pending" id="stat-pending">-</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Triaged Today</span>
          <span class="stat-value" id="stat-today">-</span>
        </div>
      </div>

      <div class="stat-card">
        <h2>Decisions</h2>
        <div class="stat-row">
          <span class="stat-label">Escalated</span>
          <span class="stat-value escalate" id="stat-escalate">0</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Backlog</span>
          <span class="stat-value backlog" id="stat-backlog">0</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Duplicate</span>
          <span class="stat-value duplicate" id="stat-duplicate">0</span>
        </div>
        <div class="stat-row">
          <span class="stat-label">Noise</span>
          <span class="stat-value noise" id="stat-noise">0</span>
        </div>
      </div>

      <div class="stat-card">
        <h2>Emerging Themes</h2>
        <ul class="theme-list" id="themes-list">
          <li class="theme-item"><span class="theme-name">Loading...</span></li>
        </ul>
      </div>

      <div class="stat-card">
        <h2>By Source</h2>
        <div id="sources-list"></div>
      </div>
    </div>
  </div>

  <script>
    let currentItem = null;

    async function loadQueue() {
      const res = await fetch('/api/queue');
      const data = await res.json();
      currentItem = data.item;
      renderFeedback(data.item, data.remaining);
    }

    async function loadStats() {
      const res = await fetch('/api/stats');
      const data = await res.json();
      renderStats(data);
    }

    function renderFeedback(item, remaining) {
      const emptyState = document.getElementById('empty-state');
      const content = document.getElementById('feedback-content');
      const buttons = document.querySelectorAll('.actions .btn');

      if (!item) {
        emptyState.innerHTML = \`
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
          </svg>
          <span>All caught up!</span>
        \`;
        emptyState.style.display = 'flex';
        content.style.display = 'none';
        buttons.forEach(b => b.disabled = true);
        return;
      }

      emptyState.style.display = 'none';
      content.style.display = 'block';
      content.className = 'fade-in';
      buttons.forEach(b => b.disabled = false);

      const sourceIcon = {
        discord: '💬',
        twitter: '🐦',
        github: '🐙',
        support: '🎫'
      }[item.source] || '📝';

      content.innerHTML = \`
        <div class="meta">
          <span class="badge source">\${sourceIcon} \${item.source}</span>
          \${item.urgency ? \`<span class="badge urgency-\${item.urgency}">\${item.urgency}</span>\` : ''}
          \${item.sentiment ? \`<span class="badge sentiment-\${item.sentiment}">\${item.sentiment}</span>\` : ''}
          \${item.category ? \`<span class="badge category">\${item.category.replace('_', ' ')}</span>\` : ''}
        </div>
        <div class="author">@\${item.author}</div>
        <div class="content">\${escapeHtml(item.content)}</div>
        <div class="timestamp">\${new Date(item.created_at).toLocaleString()} · \${remaining} remaining</div>
      \`;
    }

    function renderStats(data) {
      document.getElementById('stat-pending').textContent = data.pending;
      document.getElementById('header-pending').textContent = data.pending;
      document.getElementById('stat-today').textContent = data.triaged_today;

      const decisions = { escalate: 0, backlog: 0, duplicate: 0, noise: 0 };
      data.by_decision.forEach(d => {
        decisions[d.triage_status] = d.count;
      });
      document.getElementById('stat-escalate').textContent = decisions.escalate;
      document.getElementById('stat-backlog').textContent = decisions.backlog;
      document.getElementById('stat-duplicate').textContent = decisions.duplicate;
      document.getElementById('stat-noise').textContent = decisions.noise;

      const themesList = document.getElementById('themes-list');
      if (data.emerging_themes.length === 0) {
        themesList.innerHTML = '<li class="theme-item"><span class="theme-name" style="color: #666">No themes yet</span></li>';
      } else {
        themesList.innerHTML = data.emerging_themes.map(t => \`
          <li class="theme-item">
            <span class="theme-name">\${t.category.replace('_', ' ')}</span>
            <span class="theme-count">\${t.count}</span>
          </li>
        \`).join('');
      }

      const sourcesList = document.getElementById('sources-list');
      sourcesList.innerHTML = data.by_source.map(s => \`
        <div class="stat-row">
          <span class="stat-label">\${s.source}</span>
          <span class="stat-value">\${s.count}</span>
        </div>
      \`).join('') || '<div class="stat-row"><span class="stat-label" style="color: #666">None pending</span></div>';
    }

    async function triage(status) {
      if (!currentItem) return;

      const buttons = document.querySelectorAll('.actions .btn');
      buttons.forEach(b => b.disabled = true);

      await fetch('/api/triage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: currentItem.id, status })
      });

      await Promise.all([loadQueue(), loadStats()]);
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // Button handlers
    document.getElementById('btn-escalate').onclick = () => triage('escalate');
    document.getElementById('btn-backlog').onclick = () => triage('backlog');
    document.getElementById('btn-duplicate').onclick = () => triage('duplicate');
    document.getElementById('btn-noise').onclick = () => triage('noise');

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (!currentItem) return;

      switch(e.key.toLowerCase()) {
        case 'e': triage('escalate'); break;
        case 'b': triage('backlog'); break;
        case 'd': triage('duplicate'); break;
        case 'n': triage('noise'); break;
      }
    });

    // Initial load
    loadQueue();
    loadStats();
  </script>
</body>
</html>`;

const REVIEW_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Review Triaged Issues</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #09090b;
      color: #e4e4e7;
      min-height: 100vh;
      line-height: 1.5;
    }
    .container {
      max-width: 1000px;
      margin: 0 auto;
      padding: 48px 32px;
    }
    header {
      margin-bottom: 32px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    h1 {
      font-size: 28px;
      font-weight: 600;
      color: #fafafa;
      letter-spacing: -0.5px;
    }
    .nav-link {
      color: #71717a;
      text-decoration: none;
      font-size: 14px;
      padding: 8px 16px;
      border-radius: 8px;
      transition: all 0.15s;
    }
    .nav-link:hover { background: #27272a; color: #e4e4e7; }
    .filters {
      display: flex;
      gap: 12px;
      margin-bottom: 24px;
      flex-wrap: wrap;
    }
    .filter-btn {
      padding: 8px 16px;
      border: 1px solid #27272a;
      background: #18181b;
      color: #a1a1aa;
      border-radius: 8px;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .filter-btn:hover { border-color: #3f3f46; color: #e4e4e7; }
    .filter-btn.active { background: #27272a; border-color: #3f3f46; color: #fafafa; }
    .filter-btn.escalate.active { background: #450a0a; border-color: #7f1d1d; color: #fca5a5; }
    .filter-btn.backlog.active { background: #1e3a5f; border-color: #1d4ed8; color: #60a5fa; }
    .filter-btn.duplicate.active { background: #422006; border-color: #b45309; color: #fcd34d; }
    .filter-btn.noise.active { background: #27272a; border-color: #3f3f46; color: #a1a1aa; }
    .toggle-resolved {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: #71717a;
    }
    .toggle-resolved input { cursor: pointer; }
    .issues-list {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .issue-card {
      background: #18181b;
      border: 1px solid #27272a;
      border-radius: 12px;
      padding: 20px 24px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      transition: all 0.15s;
    }
    .issue-card.resolved {
      opacity: 0.5;
      border-style: dashed;
    }
    .issue-card:hover { border-color: #3f3f46; }
    .issue-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 12px;
      gap: 16px;
    }
    .issue-meta {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .badge {
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .status-escalate { background: #450a0a; color: #fca5a5; }
    .status-backlog { background: #1e3a5f; color: #60a5fa; }
    .status-duplicate { background: #422006; color: #fcd34d; }
    .status-noise { background: #27272a; color: #71717a; }
    .source { background: #27272a; color: #a1a1aa; }
    .urgency-critical { background: #450a0a; color: #fca5a5; }
    .urgency-high { background: #431407; color: #fdba74; }
    .urgency-medium { background: #422006; color: #fcd34d; }
    .urgency-low { background: #14532d; color: #86efac; }
    .issue-author {
      font-size: 12px;
      color: #71717a;
      margin-bottom: 8px;
    }
    .issue-content {
      font-size: 15px;
      line-height: 1.6;
      color: #d4d4d8;
      margin-bottom: 12px;
    }
    .issue-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 12px;
      border-top: 1px solid #27272a;
    }
    .issue-date {
      font-size: 12px;
      color: #52525b;
    }
    .resolve-btn {
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
    }
    .resolve-btn.mark-fixed {
      background: #14532d;
      color: #86efac;
    }
    .resolve-btn.mark-fixed:hover { background: #166534; }
    .resolve-btn.mark-unfixed {
      background: #27272a;
      color: #a1a1aa;
    }
    .resolve-btn.mark-unfixed:hover { background: #3f3f46; }
    .empty-state {
      text-align: center;
      padding: 64px 32px;
      color: #52525b;
    }
    .empty-state svg {
      width: 48px;
      height: 48px;
      margin-bottom: 16px;
      opacity: 0.4;
    }
    .count-badge {
      background: #27272a;
      color: #71717a;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      margin-left: 6px;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Review Issues</h1>
      <a href="/" class="nav-link">Back to Triage</a>
    </header>

    <div class="filters">
      <button class="filter-btn active" data-status="">All</button>
      <button class="filter-btn escalate" data-status="escalate">Escalated</button>
      <button class="filter-btn backlog" data-status="backlog">Backlog</button>
      <button class="filter-btn duplicate" data-status="duplicate">Duplicate</button>
      <button class="filter-btn noise" data-status="noise">Noise</button>
      <label class="toggle-resolved">
        <input type="checkbox" id="show-resolved"> Show resolved
      </label>
    </div>

    <div class="issues-list" id="issues-list">
      <div class="empty-state">Loading...</div>
    </div>
  </div>

  <script>
    let currentStatus = '';
    let showResolved = false;

    async function loadIssues() {
      const params = new URLSearchParams();
      if (currentStatus) params.set('status', currentStatus);
      if (showResolved) params.set('resolved', 'true');

      const res = await fetch('/api/triaged?' + params.toString());
      const data = await res.json();
      renderIssues(data.items);
    }

    function renderIssues(items) {
      const list = document.getElementById('issues-list');

      if (items.length === 0) {
        list.innerHTML = \`
          <div class="empty-state">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <p>No issues found</p>
          </div>
        \`;
        return;
      }

      list.innerHTML = items.map(item => \`
        <div class="issue-card \${item.resolved_at ? 'resolved' : ''}" data-id="\${item.id}">
          <div class="issue-header">
            <div class="issue-meta">
              <span class="badge status-\${item.triage_status}">\${item.triage_status}</span>
              <span class="badge source">\${item.source}</span>
              \${item.urgency ? \`<span class="badge urgency-\${item.urgency}">\${item.urgency}</span>\` : ''}
            </div>
          </div>
          <div class="issue-author">@\${item.author}</div>
          <div class="issue-content">\${escapeHtml(item.content)}</div>
          <div class="issue-footer">
            <span class="issue-date">
              Triaged \${new Date(item.triaged_at).toLocaleDateString()}
              \${item.resolved_at ? ' · Resolved ' + new Date(item.resolved_at).toLocaleDateString() : ''}
            </span>
            <button class="resolve-btn \${item.resolved_at ? 'mark-unfixed' : 'mark-fixed'}"
                    onclick="toggleResolved(\${item.id}, \${!item.resolved_at})">
              \${item.resolved_at ? 'Mark Unresolved' : 'Mark Fixed'}
            </button>
          </div>
        </div>
      \`).join('');
    }

    async function toggleResolved(id, resolved) {
      await fetch('/api/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, resolved })
      });
      loadIssues();
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentStatus = btn.dataset.status;
        loadIssues();
      });
    });

    // Show resolved toggle
    document.getElementById('show-resolved').addEventListener('change', (e) => {
      showResolved = e.target.checked;
      loadIssues();
    });

    // Initial load
    loadIssues();
  </script>
</body>
</html>`;
