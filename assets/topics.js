import { compactCard, escapeHtml, fetchJson, loadMergedItems } from "./shared.js";

const root = document.querySelector("#topicRoot");
const { items } = await loadMergedItems();
const topicConfig = await fetchJson("data/topic-hubs.json").catch(() => ({ topics: [] }));

const topics = topicConfig.topics || [];

root.innerHTML = topics.map(topic => {
  const rows = items
    .filter(item => matchesTopic(item, topic))
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .slice(0, 5);
  const reviewRows = rows.filter(item => item.needsReview && !item.reviewed).slice(0, 3);
  return `
    <section class="topic-hub">
      <div class="section-head">
        <div>
          <p class="eyebrow">${rows.length} 条相关</p>
          <h2>${escapeHtml(topic.name)}</h2>
        </div>
        <span>${escapeHtml(topic.intro || topic.desc)}</span>
      </div>
      <div class="topic-knowledge">
        <div>
          <strong>关键术语</strong>
          <p>${(topic.keyTerms || topic.terms || []).map(escapeHtml).join(" · ")}</p>
        </div>
        <div>
          <strong>代表性关注点</strong>
          <p>${escapeHtml((topic.representativeStudies || []).join("；") || "待补充")}</p>
        </div>
        <div>
          <strong>待复核</strong>
          <p>${reviewRows.length ? reviewRows.map(item => item.titleZh || item.title).map(escapeHtml).join("；") : "暂无"}</p>
        </div>
      </div>
      <div class="digest-grid">${rows.length ? rows.map(compactCard).join("") : "<p class='empty-state'>当前数据集中暂无相关条目。</p>"}</div>
    </section>
  `;
}).join("");

function matchesTopic(item, topic) {
  const haystack = [item.title, item.titleZh, item.summary, item.summaryZh, item.insight, ...(item.tags || [])].join(" ").toLowerCase();
  return topic.terms.some(term => haystack.includes(term.toLowerCase()));
}
