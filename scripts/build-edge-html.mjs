import { readFile, writeFile } from "node:fs/promises";

const [items, overrides, quality, status, topics, css] = await Promise.all([
  readJson("data/items.json"),
  readJson("data/review-overrides.json"),
  readJson("data/quality-report.json"),
  readJson("data/status.json"),
  readJson("data/topic-hubs.json"),
  readFile("assets/styles.css", "utf8")
]);

const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>ALS 前沿研究进展情报站 Edge 直开版</title>
    <style>${css}</style>
    <style>
      .edge-tabs { display:flex; flex-wrap:wrap; gap:8px; margin:18px 0; }
      .edge-tabs button { border-radius:8px; }
      .edge-tabs button.active { background:var(--accent); color:#fff; border-color:var(--accent); }
      .edge-view { display:none; }
      .edge-view.active { display:block; }
      .edge-note { margin:16px 0; padding:12px; border:1px solid var(--line); border-radius:8px; background:#fff; color:var(--muted); }
    </style>
  </head>
  <body>
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark">ALS</span>
        <div>
          <strong>ALS 前沿研究进展</strong>
          <span>Edge 直开版 · 无需本地服务 · 数据已内嵌</span>
        </div>
      </div>
      <div class="status-pill">数据日期：${escapeHtml(items.updatedAt || "")}</div>
    </header>
    <main>
      <section class="dashboard">
        <div class="intro">
          <p class="eyebrow">可直接用 Edge 打开</p>
          <h1>ALS 前沿研究进展情报站</h1>
          <p class="lead">这是单文件版本，适合直接双击打开预览。正式部署版仍建议使用 GitHub Pages 或本地服务。</p>
        </div>
        <div class="metrics">
          <div><span id="metricTotal">0</span><small>条进展</small></div>
          <div><span id="metricHigh">0</span><small>重点关注</small></div>
          <div><span id="metricIssues">0</span><small>质量问题</small></div>
        </div>
      </section>

      <section class="controls">
        <label class="searchbox">
          <span>搜索</span>
          <input id="searchInput" type="search" placeholder="TDP-43、SOD1、C9orf72、ASO、NfL...">
        </label>
        <div class="edge-tabs">
          <button class="active" data-view="home">最新进展</button>
          <button data-view="briefing">每日简报</button>
          <button data-view="trials">临床试验</button>
          <button data-view="topics">专题</button>
          <button data-view="quality">质量</button>
          <button data-view="status">状态</button>
        </div>
      </section>

      <p class="edge-note">提示：这个文件不会自动每日更新。需要更新时，在项目里运行更新脚本后重新生成 Edge 版。</p>

      <section id="home" class="edge-view active"></section>
      <section id="briefing" class="edge-view"></section>
      <section id="trials" class="edge-view"></section>
      <section id="topics" class="edge-view"></section>
      <section id="quality" class="edge-view"></section>
      <section id="status" class="edge-view"></section>
    </main>
    <script type="application/json" id="als-data">${safeJson({ items, overrides, quality, status, topics })}</script>
    <script>
      const DATA = JSON.parse(document.querySelector("#als-data").textContent);
      const overrides = DATA.overrides.items || {};
      const items = (DATA.items.items || []).map(item => ({ ...item, ...(overrides[item.id] || {}) }));
      const state = { query: "" };
      const $ = s => document.querySelector(s);
      const esc = v => String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
      const fmt = d => new Intl.DateTimeFormat("zh-CN", { year:"numeric", month:"2-digit", day:"2-digit" }).format(new Date(d));
      const score = item => ({high:4,medium:2,low:0}[item.priority] || 0) + Math.min(item.relevanceScore || 0, 6) / 2 + (item.featured ? 4 : 0) + (item.reviewed ? 2 : 0);
      const filter = rows => rows.filter(item => [item.title,item.titleZh,item.summary,item.summaryZh,item.insight,(item.tags||[]).join(" ")].join(" ").toLowerCase().includes(state.query.toLowerCase()));

      function card(item) {
        return \`<article class="item">
          <div class="item-top"><div class="meta"><span>\${fmt(item.publishedAt)}</span><span>\${esc(item.source)}</span><span>\${esc(item.category)}</span></div><div class="badges"><span class="badge evidence">\${esc(item.evidenceLevel || "待判定")}</span><span class="badge relevance">相关性 \${esc(item.relevanceScore ?? "待判定")}</span></div></div>
          <h3>\${esc(item.titleZh || item.title)}</h3>
          <p class="translation">\${esc(item.summaryZh || "")}</p>
          <dl class="ai-read"><div><dt>研究类型</dt><dd>\${esc(item.aiRead?.studyType || item.evidenceLevel || "")}</dd></div><div><dt>关键发现</dt><dd>\${esc(item.aiRead?.keyFinding || item.insight || "")}</dd></div><div><dt>局限性</dt><dd>\${esc(item.aiRead?.limitation || "待复核")}</dd></div><div><dt>下一步关注</dt><dd>\${esc(item.aiRead?.watchNext || "")}</dd></div></dl>
          <p class="english"><strong>Original:</strong> \${esc(item.title)}. \${esc(item.summary)}</p>
          <div class="links"><a href="\${esc(item.url)}" target="_blank" rel="noreferrer">原文链接</a></div>
        </article>\`;
      }
      function countBy(rows, fn) { return rows.reduce((a, x) => { const k = fn(x) || "未分类"; a[k] = (a[k] || 0) + 1; return a; }, {}); }
      function trend(title, counts) {
        const entries = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,8);
        const max = Math.max(1, ...entries.map(x=>x[1]));
        return \`<article class="trend-card"><h3>\${esc(title)}</h3><div class="trend-bars">\${entries.map(([k,v])=>\`<div class="trend-row"><span>\${esc(k)}</span><div><i style="width:\${Math.max(8, Math.round(v/max*100))}%"></i></div><b>\${v}</b></div>\`).join("")}</div></article>\`;
      }
      function renderHome() {
        $("#home").innerHTML = \`<section class="feed-list">\${filter(items).map(card).join("")}</section>\`;
      }
      function renderBriefing() {
        const top = filter(items).filter(x => x.relevanceFlag !== "low").sort((a,b)=>score(b)-score(a)).slice(0,5);
        $("#briefing").innerHTML = \`<section class="digest"><div class="section-head"><div><p class="eyebrow">精选日报</p><h2>优先阅读</h2></div></div><div class="digest-grid">\${top.map(x => \`<article class="digest-card"><div class="meta"><span>\${fmt(x.publishedAt)}</span><span>\${esc(x.category)}</span></div><h3>\${esc(x.titleZh || x.title)}</h3><p>\${esc(x.aiRead?.keyFinding || x.insight || "")}</p><a href="\${esc(x.url)}" target="_blank">原文</a></article>\`).join("")}</div></section>\`;
      }
      function renderTrials() {
        const rows = filter(items).filter(x => x.trialId || x.category === "临床试验");
        $("#trials").innerHTML = \`<section class="trend-grid">\${trend("试验状态", countBy(rows, x => x.trial?.status || "待核查"))}\${trend("分期", countBy(rows, x => x.trial?.phase || "待核查"))}</section><section class="feed-list trial-feed">\${rows.map(card).join("") || "<p class='empty-state'>暂无临床试验。</p>"}</section>\`;
      }
      function renderTopics() {
        const topicRows = DATA.topics.topics || [];
        $("#topics").innerHTML = topicRows.map(topic => {
          const rows = filter(items).filter(item => [item.title,item.titleZh,item.summary,item.summaryZh,item.insight,(item.tags||[]).join(" ")].join(" ").toLowerCase().includes((topic.terms || []).find(term => [item.title,item.titleZh,item.summary,item.summaryZh,item.insight,(item.tags||[]).join(" ")].join(" ").toLowerCase().includes(term.toLowerCase()))?.toLowerCase() || "\\u0000")).slice(0,5);
          return \`<section class="topic-hub"><div class="section-head"><div><p class="eyebrow">\${rows.length} 条相关</p><h2>\${esc(topic.name)}</h2></div><span>\${esc(topic.intro)}</span></div><div class="topic-knowledge"><div><strong>关键术语</strong><p>\${esc((topic.keyTerms||[]).join(" · "))}</p></div><div><strong>代表性关注点</strong><p>\${esc((topic.representativeStudies||[]).join("；"))}</p></div></div><div class="digest-grid">\${rows.map(x => \`<article class="digest-card"><h3>\${esc(x.titleZh || x.title)}</h3><p>\${esc(x.insight || "")}</p><a href="\${esc(x.url)}" target="_blank">原文</a></article>\`).join("") || "<p class='empty-state'>暂无。</p>"}</div></section>\`;
        }).join("");
      }
      function renderQuality() {
        const q = DATA.quality;
        $("#quality").innerHTML = \`<section class="trend-grid">\${trend("问题类型", q.issueCounts || {})}\${trend("复核状态", q.reviewCounts || {})}\${trend("相关性", q.relevanceCounts || {})}</section><section class="briefing-section"><h2>疑似误收</h2><div class="mini-list">\${(q.lowRelevance||[]).map(x=>\`<a href="\${esc(x.url)}" target="_blank"><strong>\${esc(x.titleZh || x.title)}</strong><span>相关性 \${esc(x.relevanceScore)}</span></a>\`).join("") || "<p class='empty-state'>暂无。</p>"}</div></section>\`;
      }
      function renderStatus() {
        const s = DATA.status;
        $("#status").innerHTML = \`<section class="trend-grid">\${trend("状态", {"数据条目":s.itemCount||0,"质量问题":s.qualityIssues||0,"归档快照":s.archiveSnapshots||0,"启用数据源":s.activeSources||0})}</section>\`;
      }
      function renderAll() {
        $("#metricTotal").textContent = items.length;
        $("#metricHigh").textContent = items.filter(x => x.priority === "high").length;
        $("#metricIssues").textContent = DATA.quality.summary?.issueCount || 0;
        renderHome(); renderBriefing(); renderTrials(); renderTopics(); renderQuality(); renderStatus();
      }
      document.querySelectorAll("[data-view]").forEach(btn => btn.addEventListener("click", () => {
        document.querySelectorAll("[data-view]").forEach(x => x.classList.toggle("active", x === btn));
        document.querySelectorAll(".edge-view").forEach(x => x.classList.toggle("active", x.id === btn.dataset.view));
      }));
      $("#searchInput").addEventListener("input", e => { state.query = e.target.value; renderAll(); });
      renderAll();
    </script>
  </body>
</html>`;

await writeFile("ALS网站-Edge直开版.html", html, "utf8");
console.log("Wrote ALS网站-Edge直开版.html");

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function safeJson(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
