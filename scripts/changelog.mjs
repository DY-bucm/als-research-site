import { readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const currentPath = process.argv[2] || "data/items.json";
const archiveDir = "data/archive";
const outputPath = process.argv[3] || "data/changelog.json";

const current = JSON.parse(await readFile(currentPath, "utf8"));
const previousPath = await findPreviousSnapshot();
const previous = previousPath ? JSON.parse(await readFile(previousPath, "utf8")) : { items: [] };

const currentMap = toMap(current.items || []);
const previousMap = toMap(previous.items || []);
const added = [...currentMap.keys()].filter(id => !previousMap.has(id)).map(id => currentMap.get(id));
const removed = [...previousMap.keys()].filter(id => !currentMap.has(id)).map(id => previousMap.get(id));
const changed = [...currentMap.keys()]
  .filter(id => previousMap.has(id))
  .map(id => diffItem(previousMap.get(id), currentMap.get(id)))
  .filter(Boolean);

const changelog = {
  updatedAt: new Date().toISOString(),
  previousSnapshot: previousPath || "",
  current: currentPath,
  summary: {
    added: added.length,
    removed: removed.length,
    changed: changed.length
  },
  added: slim(added),
  removed: slim(removed),
  changed
};

await writeFile(outputPath, `${JSON.stringify(changelog, null, 2)}\n`, "utf8");
console.log(`Wrote changelog to ${outputPath}`);

async function findPreviousSnapshot() {
  if (!existsSync(archiveDir)) return "";
  const files = (await readdir(archiveDir)).filter(file => /^\d{4}-\d{2}-\d{2}\.json$/.test(file)).sort();
  if (files.length < 2) return files.length === 1 ? `${archiveDir}/${files[0]}` : "";
  return `${archiveDir}/${files[files.length - 2]}`;
}

function toMap(rows) {
  return new Map(rows.map(item => [item.id, item]));
}

function diffItem(before, after) {
  const fields = ["priority", "category", "evidenceLevel", "relevanceFlag"];
  const changes = fields.filter(field => before[field] !== after[field]).map(field => ({ field, before: before[field], after: after[field] }));
  const beforeTrial = before.trial || {};
  const afterTrial = after.trial || {};
  for (const field of ["status", "phase", "enrollment", "completionDate"]) {
    if (beforeTrial[field] !== afterTrial[field]) changes.push({ field: `trial.${field}`, before: beforeTrial[field], after: afterTrial[field] });
  }
  return changes.length ? { id: after.id, titleZh: after.titleZh, changes } : null;
}

function slim(rows) {
  return rows.map(item => ({ id: item.id, titleZh: item.titleZh, category: item.category, priority: item.priority, url: item.url }));
}
