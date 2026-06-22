const root = document.querySelector("#detailRoot");
const id = new URLSearchParams(location.search).get("id");

boot();

async function boot() {
  const feed = await fetchJson("data/items.json");
  const overrides = await fetchJson("data/review-overrides.json").catch(() => ({ items: {} }));
  const items = (feed.items || []).map(item => normalizeItem(applyOverride(item, overrides.items?.[item.id])));
  const item = items.find(row => row.id === id);

  if (!item) {
    root.innerHTML = '<p class="empty-state">没有找到这条记录，请从首页重新进入。</p>';
    return;
  }

  const related = relatedItems(item, items);
  root.innerHTML = renderDetail(item, related);
}

function renderDetail(item, related) {
  const links = [
    `<a href="${escapeAttribute(item.url)}" target="_blank" rel="noreferrer">原文链接</a>`,
    item.doi ? `<a href="https://doi.org/${encodeURIComponent(item.doi)}" target="_blank" rel="noreferrer">DOI</a>` : "",
    item.pmid ? `<a href="https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(item.pmid)}/" target="_blank" rel="noreferrer">PubMed</a>` : "",
    item.trialId ? `<a href="https://clinicaltrials.gov/study/${encodeURIComponent(item.trialId)}" target="_blank" rel="noreferrer">${escapeHtml(item.trialId)}</a>` : ""
  ].filter(Boolean).join("");

  return `
    <article class="detail-article">
      <div class="detail-hero">
        <div>
          <p class="eyebrow">${escapeHtml(item.category)} · ${escapeHtml(item.evidenceLevel)} · 相关性 ${item.relevanceScore ?? "待判定"}</p>
          <h1>${escapeHtml(item.titleZh)}</h1>
          <p class="lead">${escapeHtml(item.summaryZh)}</p>
        </div>
        <div class="detail-facts">
          <span><strong>日期</strong>${formatDate(item.publishedAt)}</span>
          <span><strong>来源</strong>${escapeHtml(item.source)}</span>
          <span><strong>优先级</strong>${escapeHtml(item.priority)}</span>
          <span><strong>状态</strong>${item.reviewed ? "已复核" : "待复核"}</span>
        </div>
      </div>

      <section class="detail-section">
        <h2>结构化精读</h2>
        ${renderAiRead(item)}
      </section>

      <section class="detail-section">
        <h2>为什么重要</h2>
        <p>${escapeHtml(item.insight)}</p>
      </section>

      <section class="detail-section">
        <h2>英文原文摘要</h2>
        <p class="english">${escapeHtml(item.title)}. ${escapeHtml(item.summary)}</p>
      </section>

      <section class="detail-section">
        <h2>标签与链接</h2>
        <div class="meta">${(item.tags || []).map(tag => `<span class="badge">${escapeHtml(tag)}</span>`).join("")}</div>
        <div class="links">${links}</div>
      </section>

      <section class="detail-section">
        <h2>相关条目</h2>
        <div class="related-list">
          ${related.map(row => `<a href="detail.html?id=${encodeURIComponent(row.id)}"><strong>${escapeHtml(row.titleZh)}</strong><span>${escapeHtml(row.category)} · ${escapeHtml(row.evidenceLevel)}</span></a>`).join("") || "<p class='empty-state'>暂无相关条目。</p>"}
        </div>
      </section>
    </article>
  `;
}

function renderAiRead(item) {
  const ai = item.aiRead || {};
  const rows = [
    ["研究类型", ai.studyType || item.evidenceLevel],
    ["关键发现", ai.keyFinding],
    ["局限性", ai.limitation],
    ["下一步关注", ai.watchNext]
  ];
  return `<dl class="ai-read detail-read">${rows.map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v || "待补充")}</dd></div>`).join("")}</dl>`;
}

function relatedItems(item, items) {
  const tags = new Set(item.tags || []);
  return items
    .filter(row => row.id !== item.id)
    .map(row => ({
      ...row,
      relation: (row.tags || []).filter(tag => tags.has(tag)).length + (row.category === item.category ? 1 : 0)
    }))
    .filter(row => row.relation > 0)
    .sort((a, b) => b.relation - a.relation)
    .slice(0, 5);
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function applyOverride(item, override) {
  if (!override) return item;
  return {
    ...item,
    ...["titleZh", "summaryZh", "insight", "category", "priority", "evidenceLevel"].reduce((acc, key) => {
      if (override[key]) acc[key] = override[key];
      return acc;
    }, {}),
    aiRead: override.aiRead || item.aiRead,
    reviewed: Boolean(override.reviewed),
    featured: Boolean(override.featured),
    needsReview: override.reviewed ? false : item.needsReview
  };
}

function normalizeItem(item) {
  return {
    ...item,
    tags: item.tags || [],
    evidenceLevel: item.evidenceLevel || "待人工判定",
    relevanceScore: item.relevanceScore ?? 0,
    aiRead: item.aiRead || {}
  };
}

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
