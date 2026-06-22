import { fetchJson, trendCard } from "./shared.js";

const lead = document.querySelector("#statusLead");
const root = document.querySelector("#statusRoot");

const feed = await fetchJson("data/items.json");
const quality = await fetchJson("data/quality-report.json").catch(() => null);
const manifest = await fetchJson("data/archive/manifest.json").catch(() => ({ snapshots: [] }));
const sources = feed.meta?.sources || [];

lead.textContent = `最近更新 ${feed.updatedAt}，当前 ${feed.items?.length || 0} 条，归档快照 ${manifest.snapshots?.length || 0} 个。`;

root.innerHTML = [
  trendCard("来源状态", countSources(sources)),
  trendCard("质量问题", quality?.issueCounts || {}),
  trendCard("复核状态", quality?.reviewCounts || {}),
  trendCard("相关性", quality?.relevanceCounts || {})
].join("");

function countSources(rows) {
  return rows.reduce((acc, row) => {
    const key = row.ok ? `${row.source} 成功` : `${row.source} 失败`;
    acc[key] = row.count ?? 0;
    return acc;
  }, {});
}
