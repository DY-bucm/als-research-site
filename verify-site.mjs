import { readFile } from "node:fs/promises";

const pages = ["index.html", "articles.html", "detail.html", "briefing.html", "trials.html", "topics.html", "review.html", "quality.html", "export.html", "status.html"];
const requiredAssets = ["assets/styles.css", "data/items.json", "data/articles-recent.json", "data/review-overrides.json", "data/quality-report.json", "data/status.json"];
const failures = [];

for (const page of pages) {
  const html = await readFile(page, "utf8").catch(error => {
    failures.push(`${page}: ${error.message}`);
    return "";
  });
  if (!html) continue;
  if (!html.includes('link rel="stylesheet"')) failures.push(`${page}: missing stylesheet`);
  if (!html.includes("<script")) failures.push(`${page}: missing script`);
}

for (const asset of requiredAssets) {
  await readFile(asset, "utf8").catch(error => failures.push(`${asset}: ${error.message}`));
}

const data = JSON.parse(await readFile("data/items.json", "utf8"));
if (!Array.isArray(data.items) || data.items.length === 0) failures.push("data/items.json: no items");
const articles = JSON.parse(await readFile("data/articles-recent.json", "utf8"));
if (!Array.isArray(articles.articles)) failures.push("data/articles-recent.json: invalid articles");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Verified ${pages.length} pages and ${data.items.length} data items.`);
