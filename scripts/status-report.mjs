import { readFile, writeFile } from "node:fs/promises";

const feed = JSON.parse(await readFile("data/items.json", "utf8"));
const quality = await readJson("data/quality-report.json");
const manifest = await readJson("data/archive/manifest.json");
const sourceConfig = await readJson("data/source-config.json");

const status = {
  updatedAt: new Date().toISOString(),
  feedUpdatedAt: feed.updatedAt,
  itemCount: feed.items?.length || 0,
  sourceStatus: feed.meta?.sources || [],
  qualityIssues: quality?.summary?.issueCount ?? null,
  archiveSnapshots: manifest?.snapshots?.length || 0,
  activeSources: sourceConfig?.activeSources?.length || 0,
  plannedSources: sourceConfig?.plannedSources?.length || 0
};

await writeFile("data/status.json", `${JSON.stringify(status, null, 2)}\n`, "utf8");
console.log("Wrote data/status.json");

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}
