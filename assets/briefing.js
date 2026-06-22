import { compactCard, countBy, escapeHtml, itemScore, loadMergedItems, trendCard } from "./shared.js";

const root = document.querySelector("#briefingRoot");
const lead = document.querySelector("#briefingLead");

const { feed, items } = await loadMergedItems();
const relevant = items.filter(item => item.relevanceFlag !== "low");
const top = [...relevant].sort((a, b) => itemScore(b) - itemScore(a)).slice(0, 5);
const trials = relevant.filter(item => item.category === "临床试验" || item.trialId).slice(0, 5);
const low = items.filter(item => item.relevanceFlag === "low");
const review = relevant.filter(item => item.needsReview && !item.reviewed).slice(0, 8);

lead.textContent = `最近更新 ${feed.updatedAt}，当前数据 ${items.length} 条，其中 ${relevant.length} 条通过相关性过滤，${low.length} 条疑似误收。`;

root.innerHTML = `
  <section class="briefing-section wide">
    <h2>今日最值得看</h2>
    <div class="digest-grid">${top.map(compactCard).join("")}</div>
  </section>
  <section class="briefing-section">
    <h2>新增/更新临床试验</h2>
    <div class="mini-list">${listRows(trials)}</div>
  </section>
  <section class="briefing-section">
    <h2>待人工复核</h2>
    <div class="mini-list">${listRows(review)}</div>
  </section>
  <section class="briefing-section">
    <h2>疑似误收</h2>
    <div class="mini-list">${listRows(low)}</div>
  </section>
  <section class="briefing-section wide">
    <h2>简报统计</h2>
    <div class="trend-grid">
      ${trendCard("分类", countBy(relevant, item => item.category))}
      ${trendCard("证据等级", countBy(relevant, item => item.evidenceLevel))}
      ${trendCard("来源", countBy(relevant, item => item.origin || item.source))}
      ${trendCard("复核状态", countBy(items, item => item.reviewed ? "已复核" : item.needsReview ? "待复核" : "未标记"))}
    </div>
  </section>
`;

function listRows(rows) {
  return rows.length
    ? rows.map(item => `<a href="detail.html?id=${encodeURIComponent(item.id)}"><strong>${escapeHtml(item.titleZh)}</strong><span>${escapeHtml(item.category)} · ${escapeHtml(item.evidenceLevel)} · 相关性 ${item.relevanceScore}</span></a>`).join("")
    : "<p class='empty-state'>暂无条目。</p>";
}
