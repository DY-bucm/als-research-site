import { writeFile } from "node:fs/promises";

const outputPath = getArg("--output") || "data/articles-recent.json";
const daysBack = Number(getArg("--days") || 10);
const now = new Date();
const since = new Date(now.getTime() - Math.max(0, daysBack - 1) * 86400000);
const query = [
  '"amyotrophic lateral sclerosis"[Title/Abstract]',
  '"motor neuron disease"[Title/Abstract]',
  '"motor neurone disease"[Title/Abstract]'
].join(" OR ");

const term = `(${query}) AND ("${dateOnly(since)}"[Date - Publication] : "${dateOnly(now)}"[Date - Publication])`;
const ids = await searchPubMed(term);
const articles = [];

for (let offset = 0; offset < ids.length; offset += 100) {
  const batch = ids.slice(offset, offset + 100);
  articles.push(...await fetchPubMedBatch(batch));
}

const unique = dedupe(articles)
  .filter(article => article.title)
  .filter(article => article.publishedAt >= dateOnly(since) && article.publishedAt <= dateOnly(now))
  .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt) || a.title.localeCompare(b.title));

const payload = {
  updatedAt: new Date().toISOString(),
  period: {
    days: daysBack,
    from: dateOnly(since),
    to: dateOnly(now)
  },
  source: "PubMed",
  query,
  count: unique.length,
  articles: unique
};

await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`Wrote ${unique.length} PubMed articles to ${outputPath}`);

async function searchPubMed(searchTerm) {
  const url = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi");
  url.search = new URLSearchParams({
    db: "pubmed",
    term: searchTerm,
    retmode: "json",
    retmax: "10000",
    sort: "pub date"
  });
  const data = await getJson(url);
  const result = data.esearchresult || {};
  const ids = result.idlist || [];
  const total = Number(result.count || ids.length);
  if (total > ids.length) {
    throw new Error(`PubMed returned ${ids.length} of ${total} records; increase retrieval support.`);
  }
  return ids;
}

async function fetchPubMedBatch(ids) {
  if (!ids.length) return [];
  const url = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi");
  url.search = new URLSearchParams({
    db: "pubmed",
    id: ids.join(","),
    retmode: "xml"
  });
  const xml = await getText(url);
  return splitArticles(xml).map(parseArticle);
}

function parseArticle(article) {
  const pmid = text(article, "PMID");
  const title = cleanup(text(article, "ArticleTitle"));
  const abstract = cleanup(
    [...article.matchAll(/<AbstractText(?:\s[^>]*)?>([\s\S]*?)<\/AbstractText>/g)]
      .map(match => stripTags(match[1]))
      .join(" ")
  );
  const journal = cleanup(text(article, "Title")) || "PubMed";
  const doi = doiFromXml(article);
  const authors = parseAuthors(article);
  const publicationTypes = [...article.matchAll(/<PublicationType(?:\s[^>]*)?>([\s\S]*?)<\/PublicationType>/g)]
    .map(match => cleanup(stripTags(match[1])))
    .filter(Boolean);

  return {
    id: `pmid-${pmid}`,
    pmid,
    doi,
    title,
    abstract,
    journal,
    authors,
    publicationTypes,
    publishedAt: clampFutureDate(pubMedDate(article)),
    url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`
  };
}

function parseAuthors(article) {
  const authorList = article.match(/<AuthorList(?:\s[^>]*)?>([\s\S]*?)<\/AuthorList>/)?.[1] || "";
  return [...authorList.matchAll(/<Author(?:\s[^>]*)?>([\s\S]*?)<\/Author>/g)]
    .map(match => {
      const block = match[1];
      const collective = cleanup(text(block, "CollectiveName"));
      if (collective) return collective;
      const last = cleanup(text(block, "LastName"));
      const initials = cleanup(text(block, "Initials"));
      return [last, initials].filter(Boolean).join(" ");
    })
    .filter(Boolean);
}

function dedupe(articles) {
  const seen = new Set();
  return articles.filter(article => {
    const key = article.pmid || article.doi || article.title.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function getJson(url) {
  const response = await fetch(url, { headers: { "User-Agent": "ALS-frontier-site/0.5 (research monitoring)" } });
  if (!response.ok) throw new Error(`${url.hostname} returned HTTP ${response.status}`);
  return response.json();
}

async function getText(url) {
  const response = await fetch(url, { headers: { "User-Agent": "ALS-frontier-site/0.5 (research monitoring)" } });
  if (!response.ok) throw new Error(`${url.hostname} returned HTTP ${response.status}`);
  return response.text();
}

function splitArticles(xml) {
  return [...xml.matchAll(/<PubmedArticle\b[\s\S]*?<\/PubmedArticle>/g)].map(match => match[0]);
}

function text(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`));
  return match ? stripTags(match[1]) : "";
}

function stripTags(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function doiFromXml(article) {
  const match = article.match(/<ArticleId IdType="doi">([\s\S]*?)<\/ArticleId>/);
  return match ? cleanup(stripTags(match[1])) : "";
}

function pubMedDate(article) {
  const articleDate = article.match(/<ArticleDate(?:\s[^>]*)?>([\s\S]*?)<\/ArticleDate>/)?.[1];
  const pubDate = articleDate || article.match(/<PubDate>([\s\S]*?)<\/PubDate>/)?.[1] || "";
  const year = text(pubDate, "Year") || String(now.getFullYear());
  const month = monthNumber(text(pubDate, "Month") || "01");
  const day = String(text(pubDate, "Day") || "01").padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthNumber(value) {
  const months = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12"
  };
  if (/^\d+$/.test(value)) return String(value).padStart(2, "0");
  return months[String(value).slice(0, 3).toLowerCase()] || "01";
}

function clampFutureDate(value) {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date > now ? dateOnly(now) : value;
}

function cleanup(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function dateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function getArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}
