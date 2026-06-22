import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";

const source = process.argv[2] || "data/items.json";
const date = new Date().toISOString().slice(0, 10);
const target = `data/archive/${date}.json`;
const manifestPath = "data/archive/manifest.json";

await mkdir(dirname(target), { recursive: true });
await copyFile(source, target);

const manifest = existsSync(manifestPath)
  ? JSON.parse(await readFile(manifestPath, "utf8"))
  : { updatedAt: date, snapshots: [] };

const current = JSON.parse(await readFile(source, "utf8"));
const entry = {
  date,
  path: target.replaceAll("\\", "/"),
  count: current.items?.length || 0,
  sources: current.meta?.sources || []
};

manifest.updatedAt = date;
manifest.snapshots = [entry, ...(manifest.snapshots || []).filter(item => item.date !== date)].slice(0, 120);
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Archived ${source} to ${target}`);
