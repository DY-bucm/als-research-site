const state = {
  items: [],
  activeCategory: "全部",
  activeEvidence: "全部",
  activeSource: "全部",
  query: "",
  featuredOnly: false,
  readingFilter: "",
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
  keywordCloud: document.querySelector(".keyword-cloud"),
  categoryFilters: document.querySelector("#categoryFilters"),
  evidenceFilter: document.querySelector("#evidenceFilter"),
  sourceFilter: document.querySelector("#sourceFilter"),
  hideLowRelevance: document.querySelector("#hideLowRelevance"),
  topicList: document.querySelector("#topicList"),
  priorityList: document.querySelector("#priorityList"),
  clinicalPulse: document.querySelector("#clinicalPulse"),
  dailyDigest: document.querySelector("#dailyDigest"),
  digestMeta: document.querySelector("#digestMeta"),
  trendGrid: document.querySelector("#trendGrid"),
  trendMeta: document.querySelector("#trendMeta"),
  feedList: document.querySelector("#feedList"),
  emptyState: document.querySelector("#emptyState"),
  resetButton: document.querySelector("#resetButton"),
  featuredButton: document.querySelector("#featuredButton"),
  favoriteButton: document.querySelector("#favoriteButton"),
  laterButton: document.querySelector("#laterButton")
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
    const reading = state.readingState[item.id] || {};
    const readingOk = !state.readingFilter || Boolean(reading[state.readingFilter]);
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
    return relevanceOk && featuredOk && readingOk && categoryOk && evidenceOk && sourceOk && haystack.includes(state.query.toLowerCase().trim());
  });

  if (nodes.metricTotal) nodes.metricTotal.textContent = state.items.length;
  if (nodes.metricHigh) nodes.metricHigh.textContent = state.items.filter(item => item.priority === "high").length;
  if (nodes.metricClinical) nodes.metricClinical.textContent = state.items.filter(item => ["临床试验", "治疗"].includes(item.category)).length;

  const topicCounts = countTopics(state.items);
  nodes.topicList.innerHTML = Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([topic, count]) => `<div class="topic"><strong>${escapeHtml(topic)}</strong><span>${count} 条</span></div>`)
    .join("");

  nodes.feedList.innerHTML = filtered.map(renderItem).join("");
  nodes.emptyState.hidden = filtered.length > 0;
  nodes.featuredButton.classList.toggle("active", state.featuredOnly);
  nodes.favoriteButton.classList.toggle("active", state.readingFilter === "favorite");
  nodes.laterButton.classList.toggle("active", state.readingFilter === "later");
  renderPriorityList();
  renderClinicalPulse();
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
  const featured = item.featured ? '<span class="badge featured">精选</span>' : "";
  const evidence = item.evidenceLevel ? `<span class="badge evidence">${escapeHtml(item.evidenceLevel)}</span>` : "";
  const relevance = item.relevanceFlag === "low" ? '<span class="badge lowrel">疑似误收</span>' : `<span class="badge relevance">相关性 ${escapeHtml(item.relevanceScore ?? "待判定")}</span>`;
  const credibility = credibilityFor(item);
  const conclusion = `<span class="badge credibility">${escapeHtml(conclusionLabel(credibility.conclusionStrength))}</span>`;
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
        <div class="badges">${priority}${featured}${evidence}${relevance}${conclusion}</div>
      </div>
      ${renderTitleBlock(item)}
      <p class="translation"><strong>中文要点：</strong>${escapeHtml(item.summaryZh)}</p>
      <p class="english"><strong>英文摘要：</strong> ${escapeHtml(item.summary)}</p>
      <p class="insight"><strong>文章重点：</strong>${escapeHtml(item.aiRead?.keyFinding || item.insight)}</p>
      ${renderCredibilitySummary(item)}
      <p class="frontier-note"><strong>前沿依据：</strong>${escapeHtml(frontierSummary(item))}</p>
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

function renderCredibilitySummary(item) {
  const credibility = credibilityFor(item);
  return `
    <div class="credibility-summary">
      <strong>可信度判读：</strong>
      <span>${escapeHtml(credibility.studyStage)}</span>
      <span>${escapeHtml(credibility.clinicalImplication)}</span>
      <em>${escapeHtml(credibility.riskNote)}</em>
    </div>
  `;
}

function renderTitleBlock(item) {
  return `
    <div class="title-pair">
      <h3>${escapeHtml(item.title || cleanDisplayTitle(item.titleZh) || "Untitled")}</h3>
      <p>${escapeHtml(cleanDisplayTitle(item.titleZh || item.summaryZh || ""))}</p>
    </div>
  `;
}

function cleanDisplayTitle(value) {
  return String(value || "")
    .replace(/^待复核翻译[:：]\s*/, "")
    .trim();
}

function frontierSummary(item) {
  if (item.trialId || item.origin === "ClinicalTrials.gov") return "临床试验或注册信息有更新，可继续追踪入组、终点和结果。";
  if (item.category === "治疗") return "涉及潜在治疗策略或干预方向，具有转化跟踪价值。";
  if (item.category === "生物标志物") return "涉及诊断、分层、监测或疗效评估相关指标。";
  if (item.category === "遗传") return "涉及 ALS 遗传机制、风险基因或基因型-表型关联。";
  return "属于近期 ALS 相关机制、模型、病理或研究工具进展。";
}

function credibilityFor(item) {
  if (item.credibility) return item.credibility;
  const level = item.evidenceLevel || "";
  if (item.trialId || item.origin === "ClinicalTrials.gov" || level.includes("注册")) {
    return {
      studyStage: "临床试验登记/状态更新",
      conclusionStrength: "registered-trial",
      clinicalImplication: "已进入临床登记或状态追踪，但不等于疗效已经证实。",
      riskNote: "需等待结果、终点和安全性数据。",
      confidence: "medium"
    };
  }
  if (level.includes("随机")) {
    return {
      studyStage: "随机对照临床研究",
      conclusionStrength: "clinical-evidence",
      clinicalImplication: "证据强度较高，但仍需核查终点、效应量和安全性。",
      riskNote: "不要只看摘要结论。",
      confidence: "medium"
    };
  }
  if (level.includes("观察")) {
    return {
      studyStage: "观察性临床研究",
      conclusionStrength: "observational",
      clinicalImplication: "提示关联或分层价值，通常不能单独证明因果。",
      riskNote: "混杂因素和外部验证是重点。",
      confidence: "medium"
    };
  }
  if (level.includes("动物") || level.includes("细胞") || level.includes("机制")) {
    return {
      studyStage: level,
      conclusionStrength: level.includes("动物") || level.includes("细胞") ? "preclinical" : "hypothesis",
      clinicalImplication: "主要提供机制或前临床线索，不能直接外推为患者疗效。",
      riskNote: "需要患者样本或临床研究验证。",
      confidence: "medium"
    };
  }
  if (level.includes("综述")) {
    return {
      studyStage: "综述/证据整理",
      conclusionStrength: "review",
      clinicalImplication: "适合了解领域脉络，不是新增原始实验结果。",
      riskNote: "需核查纳入研究质量。",
      confidence: "medium"
    };
  }
  return {
    studyStage: "待人工判定",
    conclusionStrength: "hypothesis",
    clinicalImplication: "当前只能作为线索阅读。",
    riskNote: "避免据此形成治疗或诊断结论。",
    confidence: "low"
  };
}

function conclusionLabel(value) {
  const labels = {
    hypothesis: "机制假说/早期线索",
    preclinical: "前临床证据",
    observational: "临床观察关联",
    "registered-trial": "临床试验登记",
    "clinical-signal": "初步临床信号",
    "clinical-evidence": "临床研究证据",
    review: "综述性证据"
  };
  return labels[value] || value || "待判定";
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
      ${renderTitleBlock(item)}
      <p><strong>中文要点：</strong>${escapeHtml(item.summaryZh || item.aiRead?.keyFinding || item.insight)}</p>
      <a href="detail.html?id=${encodeURIComponent(item.id)}">进入详情</a>
    </article>
  `).join("");
}

function renderPriorityList() {
  const rows = [...state.items]
    .filter(item => item.relevanceFlag !== "low")
    .sort(compareDigestPriority)
    .slice(0, 3);

  nodes.priorityList.innerHTML = rows.map((item, index) => `
    <article class="priority-card ${index === 0 ? "lead-card" : ""}">
      <div class="priority-rank">0${index + 1}</div>
      <div>
        <div class="meta">
          <span>${formatDate(item.publishedAt)}</span>
          <span>${escapeHtml(item.category)}</span>
          <span>${escapeHtml(item.evidenceLevel || "待判定")}</span>
        </div>
        ${renderTitleBlock(item)}
        <p><strong>中文要点：</strong>${escapeHtml(item.summaryZh || item.aiRead?.keyFinding || item.insight || "")}</p>
        <div class="links">
          <a href="detail.html?id=${encodeURIComponent(item.id)}">精读详情</a>
          <a href="${escapeAttribute(item.url)}" target="_blank" rel="noreferrer">原文</a>
        </div>
      </div>
    </article>
  `).join("");
}

function renderClinicalPulse() {
  const trials = state.items
    .filter(item => item.trialId || item.category === "临床试验" || item.category === "治疗")
    .filter(item => item.relevanceFlag !== "low")
    .sort(compareDigestPriority)
    .slice(0, 4);

  nodes.clinicalPulse.innerHTML = trials.length
    ? trials.map(item => `
      <a class="clinical-chip" href="detail.html?id=${encodeURIComponent(item.id)}">
        <strong>${escapeHtml(item.trial?.status || item.priority || "关注")}</strong>
        <span>${escapeHtml(item.title)}</span>
        <small>${escapeHtml(cleanDisplayTitle(item.titleZh || item.summaryZh || ""))}</small>
      </a>
    `).join("")
    : "<p class='empty-state'>当前数据集中暂无临床/治疗条目。</p>";
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
  state.readingFilter = "";
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

nodes.favoriteButton.addEventListener("click", () => {
  state.readingFilter = state.readingFilter === "favorite" ? "" : "favorite";
  render();
});

nodes.laterButton.addEventListener("click", () => {
  state.readingFilter = state.readingFilter === "later" ? "" : "later";
  render();
});

nodes.keywordCloud?.addEventListener("click", event => {
  const button = event.target.closest("[data-keyword]");
  if (!button) return;
  state.query = button.dataset.keyword;
  nodes.searchInput.value = state.query;
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
    credibility: override.credibility || item.credibility,
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
