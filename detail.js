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
          <h1>${escapeHtml(item.title || displayTitle(item))}</h1>
          <p class="title-cn">${escapeHtml(displayTitle(item))}</p>
          <p class="lead">${escapeHtml(item.summaryZh || item.insight || "")}</p>
        </div>
        <div class="detail-facts">
          <span><strong>日期</strong>${formatDate(item.publishedAt)}</span>
          <span><strong>来源</strong>${escapeHtml(item.source)}</span>
          <span><strong>优先级</strong>${escapeHtml(priorityLabel(item.priority))}</span>
          <span><strong>结论强度</strong>${escapeHtml(conclusionLabel(credibilityFor(item).conclusionStrength))}</span>
        </div>
      </div>

      <section class="detail-section">
        <h2>文章重点</h2>
        <p>${escapeHtml(articleFocus(item))}</p>
      </section>

      <section class="detail-section credibility-panel">
        <h2>可信度判读</h2>
        ${renderCredibility(item)}
      </section>

      <section class="detail-section">
        <h2>为什么判定为前沿</h2>
        <ul class="frontier-reasons">
          ${frontierReasons(item).map(reason => `<li>${escapeHtml(reason)}</li>`).join("")}
        </ul>
      </section>

      <section class="detail-section abstract-block">
        <h2>英文原文摘要</h2>
        <p class="english">${escapeHtml([item.title, item.summary].filter(Boolean).join(". "))}</p>
        ${renderChineseAbstract(item)}
      </section>

      <section class="detail-section">
        <h2>标签与链接</h2>
        <div class="meta">${(item.tags || []).map(tag => `<span class="badge">${escapeHtml(tag)}</span>`).join("")}</div>
        <div class="links">${links}</div>
      </section>

      <section class="detail-section">
        <h2>相关条目</h2>
        <div class="related-list">
          ${related.map(row => `<a href="detail.html?id=${encodeURIComponent(row.id)}"><strong>${escapeHtml(row.title || displayTitle(row))}</strong><span>${escapeHtml(displayTitle(row))}</span><span>${escapeHtml(row.category)} · ${escapeHtml(row.evidenceLevel)}</span></a>`).join("") || "<p class='empty-state'>暂无相关条目。</p>"}
        </div>
      </section>
    </article>
  `;
}

function displayTitle(item) {
  const titleZh = String(item.titleZh || "").trim();
  if (!titleZh || /^待复核翻译[:：]/.test(titleZh)) return item.title || "未命名条目";
  return titleZh.replace(/^待复核翻译[:：]\s*/, "");
}

function articleFocus(item) {
  return item.aiRead?.keyFinding || item.insight || item.summaryZh || item.summary || "暂无文章重点。";
}

function renderChineseAbstract(item) {
  if (item.abstractZh) {
    return `<h3>中文翻译</h3><p>${escapeHtml(item.abstractZh)}</p>`;
  }
  return `<h3>中文要点</h3><p>${escapeHtml(item.summaryZh || "这条记录暂时只有英文原文，中文要点将在后续更新中补充。")}</p><p class="translation-note">说明：本段是中文要点，不是逐句对应的摘要翻译。</p>`;
}

function priorityLabel(value) {
  const labels = { high: "重点关注", medium: "常规关注", low: "低优先级" };
  return labels[value] || value || "待判定";
}

function frontierReasons(item) {
  const text = `${item.title || ""} ${item.summary || ""} ${(item.tags || []).join(" ")}`.toLowerCase();
  const reasons = [];
  reasons.push(frontierWindowReason(item));
  if (text.includes("amyotrophic lateral sclerosis") || /\bals\b/.test(text) || text.includes("motor neuron disease") || text.includes("motor neurone disease")) {
    reasons.push("ALS 专属性：题名、摘要或关键词直接指向 ALS / motor neuron disease。");
  }
  if (item.trialId || item.origin === "ClinicalTrials.gov") {
    reasons.push("临床转化价值：来自临床试验登记或包含试验号，可追踪干预、入组状态和终点。");
  } else if (item.category === "治疗") {
    reasons.push("治疗相关增量：涉及药物、基因/RNA 疗法、细胞治疗或其他潜在干预方向。");
  } else if (item.category === "生物标志物") {
    reasons.push("诊断/分层价值：涉及生物标志物、患者分层、疾病监测或疗效评估。");
  } else if (item.category === "遗传") {
    reasons.push("遗传机制价值：涉及 ALS 风险基因、致病变异或基因型-表型关联。");
  } else {
    reasons.push("科学增量：提供机制、模型、病理过程或研究工具方面的新信息。");
  }
  if (item.pmid || item.doi || item.trialId || item.url) {
    reasons.push("可追溯性：保留 PMID、DOI、试验登记号或原文链接，便于回到原始来源核查。");
  }
  return reasons;
}

function frontierWindowReason(item) {
  const days = daysSince(item.publishedAt);
  const windowDays = item.trialId || item.origin === "ClinicalTrials.gov" ? 180 : 30;
  const type = windowDays === 180 ? "临床试验登记/状态更新" : "论文、预印本或报道";
  const status = days <= windowDays ? "落在本站前沿时间窗口内" : "已超过本站默认前沿时间窗口，建议作为背景或长期追踪条目阅读";
  return `时间窗口：${type}采用近 ${windowDays} 天标准；本条日期为 ${formatDate(item.publishedAt)}，距今约 ${days} 天，${status}。`;
}

function daysSince(value) {
  const start = new Date(value);
  if (Number.isNaN(start.getTime())) return 0;
  const diff = Date.now() - start.getTime();
  return Math.max(0, Math.floor(diff / 86400000));
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
    ...["titleZh", "summaryZh", "abstractZh", "insight", "category", "priority", "evidenceLevel"].reduce((acc, key) => {
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
  return {
    ...item,
    tags: item.tags || [],
    category: cleanText(item.category || "未分类"),
    titleZh: cleanText(item.titleZh || ""),
    summaryZh: cleanText(item.summaryZh || ""),
    insight: cleanText(item.insight || ""),
    evidenceLevel: cleanText(item.evidenceLevel || "待判定"),
    relevanceScore: item.relevanceScore ?? 0,
    aiRead: item.aiRead || {}
  };
}

function renderCredibility(item) {
  const credibility = credibilityFor(item);
  const fields = [
    ["研究阶段", credibility.studyStage],
    ["结论强度", conclusionLabel(credibility.conclusionStrength)],
    ["临床含义", credibility.clinicalImplication],
    ["误读风险", credibility.riskNote],
    ["判读把握", confidenceLabel(credibility.confidence)]
  ];
  return `
    <dl class="credibility-grid">
      ${fields.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}
    </dl>
  `;
}

function credibilityFor(item) {
  if (item.credibility) return item.credibility;
  const level = item.evidenceLevel || "";
  if (item.trialId || item.origin === "ClinicalTrials.gov" || level.includes("注册")) {
    return {
      studyStage: "临床试验登记/状态更新",
      conclusionStrength: "registered-trial",
      clinicalImplication: "说明相关干预或观察项目进入临床登记和追踪阶段，但不等于疗效已经得到证实。",
      riskNote: "最容易误读为治疗有效；实际仍需等待结果、样本量、终点和安全性数据。",
      confidence: "medium"
    };
  }
  if (level.includes("随机")) {
    return {
      studyStage: "随机对照临床研究",
      conclusionStrength: "clinical-evidence",
      clinicalImplication: "可作为较强临床证据阅读，但仍需核查主要终点、效应量、安全性和发表质量。",
      riskNote: "不能只看结论，需要回到原文核查人群、终点、统计方法和不良事件。",
      confidence: "medium"
    };
  }
  if (level.includes("观察")) {
    return {
      studyStage: "观察性临床研究",
      conclusionStrength: "observational",
      clinicalImplication: "可提示关联、分层或预测价值，但通常不能单独证明因果或疗效。",
      riskNote: "混杂因素、样本选择和外部验证是主要风险。",
      confidence: "medium"
    };
  }
  if (level.includes("动物") || level.includes("细胞") || level.includes("机制")) {
    return {
      studyStage: level,
      conclusionStrength: level.includes("动物") || level.includes("细胞") ? "preclinical" : "hypothesis",
      clinicalImplication: "目前主要提供机制线索或前临床依据，不能直接外推到患者治疗效果。",
      riskNote: "模型和患者疾病之间可能存在差异，需要独立队列、患者样本或临床研究验证。",
      confidence: "medium"
    };
  }
  if (level.includes("综述")) {
    return {
      studyStage: "综述/证据整理",
      conclusionStrength: "review",
      clinicalImplication: "适合了解领域脉络和证据缺口，但不是新增原始实验结果。",
      riskNote: "需区分作者观点、纳入研究质量和是否存在选择性引用。",
      confidence: "medium"
    };
  }
  return {
    studyStage: "待人工判定",
    conclusionStrength: "hypothesis",
    clinicalImplication: "当前只能作为线索阅读，临床意义需要回到原文确认。",
    riskNote: "证据等级尚未充分判定，避免据此形成治疗或诊断结论。",
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

function confidenceLabel(value) {
  const labels = { high: "高", medium: "中", low: "低" };
  return labels[value] || value || "待判定";
}

function cleanText(value) {
  return String(value ?? "")
    .replaceAll("鐢熺墿鏍囧織鐗?", "生物标志物")
    .replaceAll("鏈哄埗", "机制")
    .replaceAll("鍔ㄧ墿/缁嗚優瀹為獙", "动物/细胞实验")
    .replaceAll("寰呭鏍哥炕璇戯細", "待复核翻译：")
    .replaceAll("寰呬汉宸ュ垽瀹?", "待判定");
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
