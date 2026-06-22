import { cleanDisplayText, countBy, escapeHtml, formatDate, loadMergedItems, trendCard } from "./shared.js";

const stats = document.querySelector("#trialStats");
const list = document.querySelector("#trialList");

const { items } = await loadMergedItems();
const trials = items.filter(item => item.trialId || item.category === "临床试验");

stats.innerHTML = [
  trendCard("试验状态", countBy(trials, trialStatus)),
  trendCard("分期", countBy(trials, trialPhase)),
  trendCard("干预方式", countBy(trials, interventionType)),
  trendCard("优先级", countBy(trials, item => item.priority))
].join("");

list.innerHTML = trials.map(item => `
  <article class="item">
    <div class="item-top">
      <div class="meta">
        <span>${formatDate(item.publishedAt)}</span>
        <span>${escapeHtml(item.trialId || "无 NCT")}</span>
        <span>${escapeHtml(trialStatus(item))}</span>
        <span>${escapeHtml(trialPhase(item))}</span>
      </div>
      <div class="badges">
        <span class="badge evidence">${escapeHtml(interventionType(item))}</span>
        <span class="badge relevance">相关性 ${item.relevanceScore}</span>
      </div>
    </div>
    <div class="title-pair">
      <h3>${escapeHtml(item.title || item.titleZh)}</h3>
      <p>${escapeHtml(cleanDisplayText(item.titleZh || item.summaryZh || ""))}</p>
    </div>
    <p class="translation"><strong>中文要点：</strong>${escapeHtml(item.summaryZh)}</p>
    <p class="insight"><strong>下一步关注：</strong>${escapeHtml(item.aiRead?.watchNext || item.insight)}</p>
    <div class="links">
      <a href="detail.html?id=${encodeURIComponent(item.id)}">详情页</a>
      <a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">ClinicalTrials.gov / 原文</a>
    </div>
  </article>
`).join("") || "<p class='empty-state'>当前数据集中暂无临床试验条目。</p>";

function trialStatus(item) {
  if (item.trial?.status) return translateStatus(item.trial.status);
  const text = `${item.summary} ${item.title}`.toLowerCase();
  if (text.includes("recruiting")) return "招募中";
  if (text.includes("completed")) return "已完成";
  if (text.includes("terminated")) return "终止";
  if (text.includes("suspended")) return "暂停";
  if (text.includes("not yet recruiting")) return "尚未招募";
  return "状态待核查";
}

function trialPhase(item) {
  if (item.trial?.phase) return item.trial.phase;
  const text = `${item.summary} ${item.title}`.toLowerCase();
  if (text.includes("phase 3")) return "III 期";
  if (text.includes("phase 2")) return "II 期";
  if (text.includes("phase 1")) return "I 期";
  if (text.includes("phase 4")) return "IV 期";
  return "分期待核查";
}

function interventionType(item) {
  if (item.trial?.interventionTypes?.length) return item.trial.interventionTypes.join(" / ");
  const text = `${item.summary} ${item.title}`.toLowerCase();
  if (text.includes("antisense") || text.includes("tofersen") || text.includes("oligonucleotide")) return "ASO/RNA 疗法";
  if (text.includes("gene")) return "基因治疗";
  if (text.includes("stem cell") || text.includes("cell")) return "细胞治疗";
  if (text.includes("drug") || text.includes("treatment")) return "药物干预";
  if (text.includes("device") || text.includes("brain-computer")) return "器械/辅助技术";
  return "干预待分类";
}

function translateStatus(status) {
  const normalized = String(status).toUpperCase();
  const map = {
    RECRUITING: "招募中",
    COMPLETED: "已完成",
    TERMINATED: "终止",
    SUSPENDED: "暂停",
    NOT_YET_RECRUITING: "尚未招募",
    ACTIVE_NOT_RECRUITING: "进行中不招募"
  };
  return map[normalized] || status;
}
