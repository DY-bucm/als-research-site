export async function loadMergedItems() {
  const feed = await fetchJson("data/items.json");
  const overrides = await fetchJson("data/review-overrides.json").catch(() => ({ items: {} }));
  return {
    feed,
    items: (feed.items || []).map(item => normalizeItem(applyOverride(item, overrides.items?.[item.id])))
  };
}

export async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export function applyOverride(item, override) {
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

export function normalizeItem(item) {
  return {
    ...item,
    tags: item.tags || [],
    evidenceLevel: item.evidenceLevel || "待人工判定",
    relevanceScore: item.relevanceScore ?? 0,
    relevanceFlag: item.relevanceFlag || "medium",
    aiRead: item.aiRead || {}
  };
}

export function countBy(items, getter) {
  return items.reduce((acc, item) => {
    const key = getter(item) || "未分类";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

export function evidenceWeight(level) {
  if (!level) return 0;
  if (level.includes("随机")) return 5;
  if (level.includes("临床试验")) return 4;
  if (level.includes("观察")) return 3;
  if (level.includes("综述")) return 2;
  if (level.includes("注册")) return 2;
  return 1;
}

export function itemScore(item) {
  const priorityScore = { high: 4, medium: 2, low: 0 }[item.priority] || 0;
  return priorityScore + evidenceWeight(item.evidenceLevel) + (item.featured ? 5 : 0) + (item.reviewed ? 2 : 0) + Math.min(item.relevanceScore || 0, 6) / 3;
}

export function formatDate(value) {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

export function trendCard(title, counts) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const max = Math.max(...entries.map(([, count]) => count), 1);
  return `
    <article class="trend-card">
      <h3>${escapeHtml(title)}</h3>
      <div class="trend-bars">
        ${entries.map(([label, count]) => `
          <div class="trend-row">
            <span>${escapeHtml(label)}</span>
            <div><i style="width:${Math.max(8, Math.round(count / max * 100))}%"></i></div>
            <b>${count}</b>
          </div>
        `).join("")}
      </div>
    </article>
  `;
}

export function compactCard(item) {
  return `
    <article class="digest-card">
      <div class="meta">
        <span>${formatDate(item.publishedAt)}</span>
        <span>${escapeHtml(item.category)}</span>
        <span>${escapeHtml(item.evidenceLevel)}</span>
      </div>
      <div class="title-pair">
        <h3>${escapeHtml(item.title || item.titleZh)}</h3>
        <p>${escapeHtml(cleanDisplayText(item.titleZh || item.summaryZh || ""))}</p>
      </div>
      <p><strong>中文要点：</strong>${escapeHtml(item.summaryZh || item.aiRead?.keyFinding || item.insight)}</p>
      <a href="detail.html?id=${encodeURIComponent(item.id)}">进入详情</a>
    </article>
  `;
}

export function cleanDisplayText(value) {
  return String(value || "")
    .replace(/^待复核翻译[:：]\s*/, "")
    .trim();
}
