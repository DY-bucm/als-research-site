import { readFile, writeFile } from "node:fs/promises";

const inputPath = process.argv[2] || "data/items.json";
const rulesPath = process.argv[3] || "data/exclusion-rules.json";
const outputPath = process.argv[4] || inputPath;

const payload = JSON.parse(await readFile(inputPath, "utf8"));
const rules = JSON.parse(await readFile(rulesPath, "utf8"));
const ids = new Set(rules.ids || []);
const titleKeywords = (rules.titleKeywords || []).map(item => item.toLowerCase());
const sourceKeywords = (rules.sourceKeywords || []).map(item => item.toLowerCase());

for (const item of payload.items || []) {
  const text = `${item.title} ${item.summary}`.toLowerCase();
  const source = String(item.source || "").toLowerCase();
  const hasDiseaseContext = text.includes("amyotrophic lateral sclerosis") || text.includes("motor neuron disease") || text.includes("motor neurone disease");
  const matchedId = ids.has(item.id) || ids.has(item.pmid) || ids.has(item.doi) || ids.has(item.trialId);
  const matchedTitle = !hasDiseaseContext && titleKeywords.some(keyword => text.includes(keyword));
  const matchedSource = sourceKeywords.some(keyword => source.includes(keyword));
  if (matchedId || matchedTitle || matchedSource) {
    item.excluded = true;
    item.relevanceFlag = "low";
    item.exclusionReason = matchedId ? "matched-id" : matchedSource ? "matched-source" : "matched-title-keyword";
  }
}

await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`Applied exclusions to ${outputPath}`);
