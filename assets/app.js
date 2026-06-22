const state = {
  items: [],
  activeCategory: "全部",
  activeEvidence: "全部",
  activeSource: "全部",
  query: "",
  featuredOnly: false,
  hideLowRelevance: true,
  readingState: loadReadingState()
};

const categoryLabels = ["全部", "机制", "遗传", "治疗", "临床试验", "生物标志物", "报道"];

const nodes = {
  updateStatus: document.querySelector("#updateStatus"),
  metricTotal: document.querySelector("#metricTotal"),
  metricHigh: document.querySelector("#metricHigh"),
  metricClinical: document.querySelector("#metricClinical"),
  searchInput: document.querySelector("#searchInput"),
  categoryFilters: document.querySelector("#categoryFilters"),
  evidenceFilter: document.querySelector("#evidenceFilter"),
  sourceFilter: document.querySelector("#sourceFilter"),
  hideLowRelevance: document.querySelector("#hideLowRelevance"),
  topicList: document.querySelector("#topicList"),
  dailyDigest: document.querySelector("#dailyDigest"),
  digestMeta: document.querySelector("#digestMeta"),
  trendGrid: document.querySelector("#trendGrid"),
  trendMeta: document.querySelector("#trendMeta"),
  feedList: document.querySelector("#feedList"),
  emptyState: document.querySelector("#emptyState"),
  resetButton: document.querySelector("#resetButton"),
  featuredButton: document.querySelector("#featuredButton")
};

async function loadFeed() {
  try {
    const response = await fetch("data/items.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const overrides = await loadOverrides();
    state.items = payload.items
      .map(item => normalizeItem(applyOverride(item, overrides.items?.[item.id])))
      .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
    const sourceText = payload.meta?.sources
      ? payload.meta.sources.map(source => `${source.source} ${source.ok ? source.count : "失败"}`).join(" · ")
      : `${payload.items.length} 条`;
    nodes.updateStatus.textContent = `最近更新：${payload.updatedAt} · ${sourceText}`;
  } catch (error) {
    nodes.updateStatus.textContent = "读取本地数据失败，请检查 data/items.json";
    state.items = [];
  }

  renderFilters();
  renderSelectFilters();
  render();
}

function renderFilters() {
  nodes.categoryFilters.innerHTML = categoryLabels
    .map(label => `<button class="chip${label === state.activeCategory ? " active" : ""}" type="button" data-category="${label}">${label}</button>`)
    .join("");
}

function render() {
  const filtered = state.items.filter(item => {
    const categoryOk = state.activeCategory === "全部" || item.category === state.activeCategory;
    const evidenceOk = state.activeEvidence === "全部" || item.evidenceLevel === state.activeEvidence;
    const sourceOk = state.activeSource === "全部" || (item.origin || item.source) === state.activeSource;
    const featuredOk = !state.featuredOnly || item.featured;
    const relevanceOk = !state.hideLowRelevance || item.relevanceFlag !== "low";
    const haystack = [
      item.title,
      item.titleZh,
      item.summary,
      item.summaryZh,
      item.insight,
      item.source,
      item.tags.join(" ")
    ].join(" ").toLowerCase();
    return relevanceOk && featuredOk && categoryOk && evidenceOk && sourceOk && haystack.includes(state.query.toLowerCase().trim());
  });

  nodes.metricTotal.textContent = state.items.length;
  nodes.metricHigh.textContent = state.items.filter(item => item.priority === "high").length;
  nodes.metricClinical.textContent = state.items.filter(item => ["临床试验", "治疗"].includes(item.category)).length;

  const topicCounts = countTopics(state.items);
  nodes.topicList.innerHTML = Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([topic, count]) => `<div class="topic"><strong>${escapeHtml(topic)}</strong><span>${count} 条</span></div>`)
    .join("");

  nodes.feedList.innerHTML = filtered.map(renderItem).join("");
  nodes.emptyState.hidden = filtered.length > 0;
  nodes.featuredButton.classList.toggle("active", state.featuredOnly);
  renderDigest();
  renderTrends();
}

function renderSelectFilters() {
  fillSelect(nodes.evidenceFilter, uniqueValues(state.items, item => item.evidenceLevel), state.activeEvidence);
  fillSelect(nodes.sourceFilter, uniqueValues(state.items, item => item.origin || item.source), state.activeSource);
}

function fillSelect(node, values, active) {
  node.innerHTML = ["全部", ...values]
    .map(value => `<option value="${escapeAttribute(value)}"${value === active ? " selected" : ""}>${escapeHtml(value)}</option>`)
    .join("");
}

function uniqueValues(items, getter) {
  return [...new Set(items.map(getter).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
}

function renderItem(item) {
  const priority = item.priority === "high" ? '<span class="badge high">重点关注</span>' : "";
  const review = item.reviewed ? '<span class="badge reviewed">已复核</span>' : item.needsReview ? '<span class="badge review">待复核</span>' : "";
  const featured = item.featured ? '<span class="badge featured">精选</span>' : "";
  const evidence = item.evidenceLevel ? `<span class="badge evidence">${escapeHtml(item.evidenceLevel)}</span>` : "";
  const relevance = item.relevanceFlag === "low" ? '<span class="badge lowrel">疑似误收</span>' : `<span class="badge relevance">相关性 ${escapeHtml(item.relevanceScore ?? "待判定")}</span>`;
  const tags = item.tags.map(tag => `<span class="badge">${escapeHtml(tag)}</span>`).join("");
  const reading = state.readingState[item.id] || {};
  const doi = item.doi ? `<a href="https://doi.org/${encodeURIComponent(item.doi)}" target="_blank" rel="noreferrer">DOI</a>` : "";
  const pmid = item.pmid ? `<a href="https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(item.pmid)}/" target="_blank" rel="noreferrer">PubMed</a>` : "";
  const trial = item.trialId ? `<a href="https://clinicaltrials.gov/study/${encodeURIComponent(item.trialId)}" target="_blank" rel="noreferrer">${escapeHtml(item.trialId)}</a>` : "";

  return `
    <article class="item">
      <div class="item-top">
        <div class="meta">
          <span>${formatDate(item.publishedAt)}</span>
          <span>${escapeHtml(item.source)}</span>
          <span>${escapeHtml(item.category)}</span>
        </div>
        <div class="badges">${priority}${featured}${evidence}${relevance}${review}</div>
      </div>
      <h3>${escapeHtml(item.titleZh)}</h3>
      <p class="translation">${escapeHtml(item.summaryZh)}</p>
      ${renderAiRead(item)}
      <p class="english"><strong>Original:</strong> ${escapeHtml(item.title)}. ${escapeHtml(item.summary)}</p>
      <p class="insight"><strong>为什么重要：</strong>${escapeHtml(item.insight)}</p>
      <div class="meta">${tags}</div>
      <div class="links">
        <a href="detail.html?id=${encodeURIComponent(item.id)}">详情页</a>
        <a href="${escapeAttribute(item.url)}" target="_blank" rel="noreferrer">原文链接</a>
        ${doi}
        ${pmid}
        ${trial}
      </div>
      <div class="reading-actions" data-reading-id="${escapeAttribute(item.id)}">
        <button type="button" data-reading-action="read" class="${reading.read ? "active" : ""}">已读</button>
        <button type="button" data-reading-action="favorite" class="${reading.favorite ? "active" : ""}">收藏</button>
        <button type="button" data-reading-action="later" class="${reading.later ? "active" : ""}">稍后看</button>
      </div>
    </article>
  `;
}

function renderAiRead(item) {
  if (!item.aiRead) return "";
  const fields = [
    ["研究类型", item.aiRead.studyType],
    ["关键发现", item.aiRead.keyFinding],
    ["局限性", item.aiRead.limitation],
    ["下一步关注", item.aiRead.watchNext]
  ].filter(([, value]) => value);

  return `
    <dl class="ai-read">
      ${fields.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}
    </dl>
  `;
}

function renderDigest() {
  const candidates = [...state.items].filter(item => item.relevanceFlag !== "low").sort(compareDigestPriority).slice(0, 5);
  nodes.digestMeta.textContent = `${candidates.length} 条 · ${new Date().toLocaleDateString("zh-CN")}`;
  nodes.dailyDigest.innerHTML = candidates.map(item => `
    <article class="digest-card">
      <div class="meta">
        <span>${formatDate(item.publishedAt)}</span>
        <span>${escapeHtml(item.category)}</span>
        <span>${escapeHtml(item.evidenceLevel || "待判定")}</span>
      </div>
      <h3>${escapeHtml(item.titleZh)}</h3>
      <p>${escapeHtml(item.aiRead?.keyFinding || item.insight)}</p>
      <a href="detail.html?id=${encodeURIComponent(item.id)}">进入详情</a>
    </article>
  `).join("");
}

function renderTrends() {
  const relevantItems = state.items.filter(item => item.relevanceFlag !== "low");
  const categoryCounts = countBy(relevantItems, item => item.category);
  const evidenceCounts = countBy(relevantItems, item => item.evidenceLevel || "待判定");
  const sourceCounts = countBy(relevantItems, item => item.origin || item.source);
  const lowCount = state.items.length - relevantItems.length;

  nodes.trendMeta.textContent = `${relevantItems.length} 条相关 · ${lowCount} 条疑似误收`;
  nodes.trendGrid.innerHTML = [
    renderTrendCard("分类分布", categoryCounts),
    renderTrendCard("证据等级", evidenceCounts),
    renderTrendCard("来源分布", sourceCounts),
    renderTrendCard("高频主题", countTopics(relevantItems))
  ].join("");
}

function renderTrendCard(title, counts) {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);
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

function compareDigestPriority(a, b) {
  const score = item => {
    const priorityScore = { high: 4, medium: 2, low: 0 }[item.priority] || 0;
    const evidenceScore = evidenceWeight(item.evidenceLevel);
    return priorityScore + evidenceScore + (item.featured ? 5 : 0) + (item.reviewed ? 2 : 0);
  };
  return score(b) - score(a) || new Date(b.publishedAt) - new Date(a.publishedAt);
}

function evidenceWeight(level) {
  if (!level) return 0;
  if (level.includes("随机")) return 5;
  if (level.includes("临床试验")) return 4;
  if (level.includes("观察")) return 3;
  if (level.includes("综述")) return 2;
  if (level.includes("临床试验注册")) return 2;
  return 1;
}

function countTopics(items) {
  return items.reduce((acc, item) => {
    item.tags.forEach(tag => {
      acc[tag] = (acc[tag] || 0) + 1;
    });
    return acc;
  }, {});
}

function countBy(items, getter) {
  return items.reduce((acc, item) => {
    const key = getter(item) || "未分类";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function formatDate(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

nodes.searchInput.addEventListener("input", event => {
  state.query = event.target.value;
  render();
});

nodes.categoryFilters.addEventListener("click", event => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  state.activeCategory = button.dataset.category;
  renderFilters();
  render();
});

nodes.resetButton.addEventListener("click", () => {
  state.activeCategory = "全部";
  state.activeEvidence = "全部";
  state.activeSource = "全部";
  state.query = "";
  state.featuredOnly = false;
  state.hideLowRelevance = true;
  nodes.searchInput.value = "";
  nodes.hideLowRelevance.checked = true;
  renderFilters();
  renderSelectFilters();
  render();
});

nodes.featuredButton.addEventListener("click", () => {
  state.featuredOnly = !state.featuredOnly;
  render();
});

nodes.evidenceFilter.addEventListener("change", event => {
  state.activeEvidence = event.target.value;
  render();
});

nodes.sourceFilter.addEventListener("change", event => {
  state.activeSource = event.target.value;
  render();
});

nodes.hideLowRelevance.addEventListener("change", event => {
  state.hideLowRelevance = event.target.checked;
  render();
});

nodes.feedList.addEventListener("click", event => {
  const button = event.target.closest("[data-reading-action]");
  if (!button) return;
  const container = button.closest("[data-reading-id]");
  const id = container?.dataset.readingId;
  if (!id) return;
  const current = state.readingState[id] || {};
  const action = button.dataset.readingAction;
  state.readingState[id] = { ...current, [action]: !current[action] };
  saveReadingState(state.readingState);
  render();
});

async function loadOverrides() {
  try {
    const response = await fetch("data/review-overrides.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  } catch {
    return { items: {} };
  }
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
  const text = `${item.title} ${item.summary}`.toLowerCase();
  const evidenceLevel = item.evidenceLevel || inferEvidenceLevel(text, item.category, item.origin, item.trialId);
  const relevance = inferRelevance(item, text);
  return {
    ...item,
    tags: item.tags || [],
    evidenceLevel,
    relevanceScore: item.relevanceScore ?? relevance.score,
    relevanceFlag: item.relevanceFlag || relevance.flag,
    aiRead: item.aiRead || buildAiRead(item, evidenceLevel)
  };
}

function inferRelevance(item, text) {
  let score = 0;
  if (text.includes("amyotrophic lateral sclerosis")) score += 5;
  if (text.includes("motor neuron disease") || text.includes("motor neurone disease")) score += 4;
  if (item.trialId || item.origin === "ClinicalTrials.gov") score += 4;
  if (/\bals\b/.test(text)) score += 2;
  for (const term of ["tdp-43", "sod1", "c9orf72", "fus", "tardbp", "neurofilament", "tofersen"]) {
    if (text.includes(term)) score += 2;
  }
  for (const term of ["alcohol", "altitude", "advanced life support", "area-level", "alkali", "aluminum"]) {
    if (text.includes(term) && !text.includes("amyotrophic lateral sclerosis")) score -= 3;
  }
  return { score: Math.max(0, score), flag: score < 3 ? "low" : score < 6 ? "medium" : "high" };
}

function inferEvidenceLevel(text, category, origin, trialId) {
  if (trialId || origin === "ClinicalTrials.gov") return "临床试验注册";
  if (text.includes("randomized") || text.includes("placebo") || text.includes("double-blind")) return "随机对照试验";
  if (text.includes("phase 1") || text.includes("phase 2") || text.includes("phase 3") || text.includes("clinical trial")) return "临床试验研究";
  if (text.includes("cohort") || text.includes("case-control") || text.includes("patients")) return "观察性临床研究";
  if (text.includes("review") || text.includes("meta-analysis")) return "综述/荟萃分析";
  if (text.includes("mouse") || text.includes("mice") || text.includes("cell") || text.includes("in vitro")) return "动物/细胞实验";
  if (category === "机制") return "机制研究";
  return "待人工判定";
}

function buildAiRead(item, evidenceLevel) {
  const firstSentence = item.summary.split(/(?<=[.!?])\s+/)[0] || item.summary;
  return {
    studyType: evidenceLevel,
    keyFinding: firstSentence.length > 180 ? `${firstSentence.slice(0, 177)}...` : firstSentence,
    limitation: item.needsReview ? "机器初筛结果，研究设计、样本量、终点和结论强度仍需人工复核。" : "已人工复核，仍建议结合原文方法和结果表格阅读。",
    watchNext: watchNextFor(item.category)
  };
}

function watchNextFor(category) {
  if (category === "临床试验") return "关注入组状态、主要终点、结果发布日期和是否有同类药物对照。";
  if (category === "治疗") return "关注是否进入人体试验、疗效终点、样本量和安全性信号。";
  if (category === "生物标志物") return "关注外部验证、检测平台稳定性和能否预测进展或疗效。";
  if (category === "遗传") return "关注变异人群比例、功能证据和是否能转化为分型治疗。";
  return "关注是否从机制假说推进到动物模型、患者样本或治疗干预证据。";
}

function loadReadingState() {
  try {
    return JSON.parse(localStorage.getItem("als-reading-state") || "{}");
  } catch {
    return {};
  }
}

function saveReadingState(value) {
  localStorage.setItem("als-reading-state", JSON.stringify(value));
}

loadFeed();
