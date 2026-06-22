import { readFile, writeFile } from "node:fs/promises";

const inputPath = process.argv[2] || "data/items.json";
const outputPath = process.argv[3] || "data/quality-report.json";
const payload = JSON.parse(await readFile(inputPath, "utf8"));
const items = payload.items || [];

const report = {
  updatedAt: new Date().toISOString(),
  summary: {
    totalItems: items.length,
    issueCount: 0
  },
  sources: payload.meta?.sources || [],
  lowRelevance: slim(items.filter(item => item.relevanceFlag === "low")),
  missingIdentifiers: slim(items.filter(item => !item.doi && !item.pmid && !item.trialId)),
  missingAbstract: slim(items.filter(item => !item.summary || /no abstract|not available/i.test(item.summary))),
  highPriorityNeedsReview: slim(items.filter(item => item.priority === "high" && item.needsReview)),
  failedSources: (payload.meta?.sources || []).filter(source => !source.ok),
  issueCounts: {},
  reviewCounts: countBy(items, item => item.reviewed ? "已复核" : item.needsReview ? "待复核" : "未标记"),
  relevanceCounts: countBy(items, item => item.relevanceFlag || "未判定")
};

report.issueCounts = {
  "疑似误收": report.lowRelevance.length,
  "缺标识符": report.missingIdentifiers.length,
  "缺摘要": report.missingAbstract.length,
  "高优先级待复核": report.highPriorityNeedsReview.length,
  "来源失败": report.failedSources.length
};
report.summary.issueCount = Object.values(report.issueCounts).reduce((sum, count) => sum + count, 0);

await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Wrote quality report to ${outputPath}`);

function slim(rows) {
  return rows.map(item => ({
    id: item.id,
    title: item.title,
    titleZh: item.titleZh,
    category: item.category,
    evidenceLevel: item.evidenceLevel,
    relevanceScore: item.relevanceScore,
    relevanceFlag: item.relevanceFlag,
    priority: item.priority,
    url: item.url
  }));
}

function countBy(rows, getter) {
  return rows.reduce((acc, row) => {
    const key = getter(row) || "未分类";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}
