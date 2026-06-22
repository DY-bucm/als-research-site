import { mkdir, readFile, writeFile } from "node:fs/promises";

const inputPath = process.argv[2] || "data/items.json";
const outputDir = process.argv[3] || "exports";
const payload = JSON.parse(await readFile(inputPath, "utf8"));
const items = payload.items || [];

await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(`${outputDir}/daily-briefing.md`, markdownBriefing(items), "utf8"),
  writeFile(`${outputDir}/items.csv`, csv(items), "utf8"),
  writeFile(`${outputDir}/references.bib`, bibtex(items), "utf8"),
  writeFile(`${outputDir}/review-tasks.md`, reviewTasks(items), "utf8")
]);
console.log(`Exported ${items.length} items to ${outputDir}`);

function markdownBriefing(rows) {
  const top = [...rows].filter(item => item.relevanceFlag !== "low").sort((a, b) => score(b) - score(a)).slice(0, 8);
  return [
    `# ALS 每日简报`,
    ``,
    `更新时间：${payload.updatedAt}`,
    ``,
    ...top.map((item, index) => `${index + 1}. **${item.titleZh || item.title}**\n   - ${item.category} / ${item.evidenceLevel} / ${item.priority}\n   - ${item.aiRead?.keyFinding || item.insight || ""}\n   - ${item.url}`)
  ].join("\n");
}

function csv(rows) {
  const header = ["id", "date", "category", "evidenceLevel", "priority", "relevanceScore", "title", "titleZh", "url", "doi", "pmid", "trialId"];
  return [header.join(","), ...rows.map(item => header.map(key => quote(item[key] ?? item.publishedAt ?? "")).join(","))].join("\n");
}

function bibtex(rows) {
  return rows.filter(item => item.doi || item.pmid).map(item => {
    const key = (item.pmid && `pmid${item.pmid}`) || (item.doi || item.id).replace(/\W+/g, "");
    return `@article{${key},\n  title = {${cleanBib(item.title)}},\n  year = {${String(item.publishedAt || "").slice(0, 4)}},\n  journal = {${cleanBib(item.source || "")}},\n  doi = {${cleanBib(item.doi || "")}},\n  url = {${cleanBib(item.url || "")}}\n}`;
  }).join("\n\n");
}

function reviewTasks(rows) {
  const tasks = rows.filter(item => item.needsReview || item.priority === "high" || item.relevanceFlag === "low");
  return [
    "# 复核任务清单",
    "",
    ...tasks.map(item => `- [ ] ${item.relevanceFlag === "low" ? "[疑似误收] " : ""}${item.priority === "high" ? "[高优先级] " : ""}${item.titleZh || item.title} (${item.id})\n  - ${item.url}`)
  ].join("\n");
}

function score(item) {
  return ({ high: 4, medium: 2, low: 0 }[item.priority] || 0) + (item.reviewed ? 2 : 0) + (item.featured ? 4 : 0) + Math.min(item.relevanceScore || 0, 6) / 2;
}

function quote(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function cleanBib(value) {
  return String(value || "").replace(/[{}]/g, "");
}
