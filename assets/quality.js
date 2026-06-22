import { escapeHtml, fetchJson, loadMergedItems, trendCard } from "./shared.js";

const root = document.querySelector("#qualityRoot");
const lead = document.querySelector("#qualityLead");

const { items } = await loadMergedItems();
const report = await fetchJson("data/quality-report.json").catch(() => buildFallbackReport(items));

lead.textContent = `报告时间 ${report.updatedAt || "未生成"}，共 ${report.summary?.totalItems ?? items.length} 条，质量问题 ${report.summary?.issueCount ?? 0} 项。`;

root.innerHTML = `
  <section class="briefing-section wide">
    <h2>质量概览</h2>
    <div class="trend-grid">
      ${trendCard("问题类型", report.issueCounts || {})}
      ${trendCard("来源状态", sourceStatus(report))}
      ${trendCard("复核状态", report.reviewCounts || {})}
      ${trendCard("相关性", report.relevanceCounts || {})}
    </div>
  </section>
  ${section("疑似误收", report.lowRelevance)}
  ${section("缺 DOI / PMID / NCT", report.missingIdentifiers)}
  ${section("缺摘要", report.missingAbstract)}
  ${section("高优先级待复核", report.highPriorityNeedsReview)}
  ${section("来源失败", report.failedSources, "source")}
`;

function section(title, rows = [], mode = "item") {
  return `
    <section class="briefing-section">
      <h2>${escapeHtml(title)}</h2>
      <div class="mini-list">
        ${rows.length ? rows.map(row => mode === "source" ? sourceRow(row) : itemRow(row)).join("") : "<p class='empty-state'>暂无。</p>"}
      </div>
    </section>
  `;
}

function itemRow(item) {
  return `<a href="detail.html?id=${encodeURIComponent(item.id)}"><strong>${escapeHtml(item.titleZh || item.title)}</strong><span>${escapeHtml(item.category)} · ${escapeHtml(item.evidenceLevel)} · 相关性 ${item.relevanceScore ?? "待判定"}</span></a>`;
}

function sourceRow(source) {
  return `<a href="#"><strong>${escapeHtml(source.source)}</strong><span>${escapeHtml(source.error || "失败")}</span></a>`;
}

function sourceStatus(report) {
  return (report.sources || []).reduce((acc, source) => {
    const key = source.ok ? "成功" : "失败";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function buildFallbackReport(rows) {
  return {
    updatedAt: "未生成",
    summary: { totalItems: rows.length, issueCount: 0 },
    lowRelevance: rows.filter(item => item.relevanceFlag === "low"),
    missingIdentifiers: rows.filter(item => !item.doi && !item.pmid && !item.trialId),
    missingAbstract: rows.filter(item => !item.summary || item.summary.includes("no abstract")),
    highPriorityNeedsReview: rows.filter(item => item.priority === "high" && item.needsReview && !item.reviewed),
    failedSources: [],
    issueCounts: {},
    reviewCounts: {},
    relevanceCounts: {}
  };
}
