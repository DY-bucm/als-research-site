import { writeFile } from "node:fs/promises";

const outputPath = getArg("--output") || "data/items.json";
const daysBack = Number(getArg("--days") || 30);
const maxPerSource = Number(getArg("--limit") || 12);
const now = new Date();
const since = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);

const alsQuery = [
  '"amyotrophic lateral sclerosis"',
  '"motor neuron disease"',
  '"motor neurone disease"',
  '"SOD1 ALS"',
  '"C9orf72 ALS"',
  '"TDP-43 ALS"'
].join(" OR ");

const glossary = new Map([
  ["amyotrophic lateral sclerosis", "肌萎缩侧索硬化症"],
  ["motor neuron disease", "运动神经元病"],
  ["motor neurone disease", "运动神经元病"],
  ["frontotemporal dementia", "额颞叶痴呆"],
  ["neurofilament light chain", "神经丝轻链"],
  ["antisense oligonucleotide", "反义寡核苷酸"],
  ["brain-computer interface", "脑机接口"],
  ["neuroinflammation", "神经炎症"],
  ["biomarker", "生物标志物"],
  ["gene therapy", "基因治疗"],
  ["stem cell", "干细胞"],
  ["mitochondria", "线粒体"],
  ["microglia", "小胶质细胞"],
  ["clinical trial", "临床试验"],
  ["randomized", "随机"],
  ["phase 1", "I 期"],
  ["phase 2", "II 期"],
  ["phase 3", "III 期"]
]);

const categoryRules = [
  { category: "临床试验", terms: ["clinical trial", "phase 1", "phase 2", "phase 3", "randomized", "recruiting", "nct"] },
  { category: "治疗", terms: ["therapy", "therapeutic", "treatment", "drug", "antisense", "oligonucleotide", "gene therapy", "riluzole", "tofersen", "stem cell"] },
  { category: "生物标志物", terms: ["biomarker", "neurofilament", "nfl", "diagnostic", "prognostic", "plasma", "serum", "cerebrospinal"] },
  { category: "遗传", terms: ["sod1", "c9orf72", "fus", "tardbp", "genetic", "mutation", "variant", "repeat expansion"] },
  { category: "机制", terms: ["tdp-43", "rna", "mitochond", "microglia", "neuroinflammation", "protein aggregation", "pathology", "autophagy"] }
];

const tagRules = [
  ["TDP-43", ["tdp-43", "tardbp"]],
  ["SOD1", ["sod1"]],
  ["C9orf72", ["c9orf72"]],
  ["FUS", ["fus"]],
  ["ASO", ["antisense", "oligonucleotide", "aso", "tofersen"]],
  ["NfL", ["neurofilament", "nfl"]],
  ["RNA代谢", ["rna", "splicing", "transcript"]],
  ["神经炎症", ["neuroinflammation", "microglia", "astrocyte", "immune"]],
  ["线粒体", ["mitochond"]],
  ["蛋白稳态", ["proteostasis", "protein aggregation", "autophagy", "ubiquitin"]],
  ["临床试验", ["clinical trial", "recruiting", "phase"]],
  ["生物标志物", ["biomarker", "diagnostic", "prognostic"]],
  ["脑机接口", ["brain-computer", "bci"]]
];

async function main() {
  const results = await Promise.allSettled([
    fetchPubMed(),
    fetchEuropePmc(),
    fetchClinicalTrials()
  ]);

  const sourceResults = results.map((result, index) => {
    const source = ["PubMed", "Europe PMC", "ClinicalTrials.gov"][index];
    if (result.status === "fulfilled") {
      return { source, ok: true, count: result.value.length, items: result.value };
    }
    return { source, ok: false, count: 0, error: result.reason?.message || String(result.reason), items: [] };
  });

  const items = dedupe(sourceResults.flatMap(result => result.items))
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
    .slice(0, maxPerSource * 3);

  const payload = {
    updatedAt: dateOnly(now),
    generatedBy: "scripts/update-feed.mjs",
    query: alsQuery,
    meta: {
      daysBack,
      needsReview: items.filter(item => item.needsReview).length,
      sources: sourceResults.map(({ source, ok, count, error }) => ({ source, ok, count, error }))
    },
    items
  };

  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote ${items.length} items to ${outputPath}`);
  for (const source of payload.meta.sources) {
    console.log(`${source.ok ? "OK" : "FAIL"} ${source.source}: ${source.count}${source.error ? ` (${source.error})` : ""}`);
  }
}

async function fetchPubMed() {
  const term = `(${alsQuery}) AND ("${dateOnly(since)}"[Date - Publication] : "${dateOnly(now)}"[Date - Publication])`;
  const searchUrl = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi");
  searchUrl.search = new URLSearchParams({
    db: "pubmed",
    term,
    retmode: "json",
    retmax: String(maxPerSource),
    sort: "pub date"
  });

  const search = await getJson(searchUrl);
  const ids = search.esearchresult?.idlist || [];
  if (ids.length === 0) return [];

  const fetchUrl = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi");
  fetchUrl.search = new URLSearchParams({
    db: "pubmed",
    id: ids.join(","),
    retmode: "xml"
  });

  const xml = await getText(fetchUrl);
  return splitArticles(xml).map(article => {
    const pmid = text(article, "PMID");
    const title = cleanup(text(article, "ArticleTitle"));
    const abstract = cleanup([...article.matchAll(/<AbstractText(?:\s[^>]*)?>([\s\S]*?)<\/AbstractText>/g)].map(match => stripTags(match[1])).join(" "));
    const journal = cleanup(text(article, "Title")) || "PubMed";
    const date = pubMedDate(article);
    const doi = doiFromXml(article);

    return enrichItem({
      id: `pmid-${pmid}`,
      publishedAt: clampFutureDate(date),
      source: journal,
      title,
      summary: abstract || "PubMed record found, but no abstract was available in the fetched metadata.",
      url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      doi,
      pmid,
      trialId: "",
      origin: "PubMed"
    });
  }).filter(item => item.title);
}

async function fetchEuropePmc() {
  const query = `(${alsQuery}) AND FIRST_PDATE:[${dateOnly(since)} TO ${dateOnly(now)}]`;
  const url = new URL("https://www.ebi.ac.uk/europepmc/webservices/rest/search");
  url.search = new URLSearchParams({
    query,
    format: "json",
    pageSize: String(maxPerSource),
    sort: "FIRST_PDATE_D desc"
  });

  const data = await getJson(url);
  const results = data.resultList?.result || [];
  return results.map(record => {
    const pmid = record.pmid || "";
    const doi = record.doi || "";
    const url = doi
      ? `https://doi.org/${doi}`
      : pmid
        ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`
        : `https://europepmc.org/article/${record.source || "MED"}/${record.id}`;

    return enrichItem({
      id: `epmc-${record.source || "src"}-${record.id}`,
      publishedAt: clampFutureDate(normalizeDate(record.firstPublicationDate || record.pubYear || dateOnly(now))),
      source: record.journalTitle || `Europe PMC / ${record.source || "record"}`,
      title: cleanup(record.title || ""),
      summary: cleanup(record.abstractText || "Europe PMC record found, but no abstract was available in the fetched metadata."),
      url,
      doi,
      pmid,
      trialId: "",
      origin: "Europe PMC"
    });
  }).filter(item => item.title);
}

async function fetchClinicalTrials() {
  const url = new URL("https://clinicaltrials.gov/api/v2/studies");
  url.search = new URLSearchParams({
    "query.cond": "Amyotrophic Lateral Sclerosis",
    pageSize: String(maxPerSource),
    format: "json"
  });

  const data = await getJson(url);
  const studies = data.studies || [];
  return studies.map(study => {
    const protocol = study.protocolSection || {};
    const identification = protocol.identificationModule || {};
    const status = protocol.statusModule || {};
    const design = protocol.designModule || {};
    const conditions = protocol.conditionsModule || {};
    const arms = protocol.armsInterventionsModule || {};
    const outcomes = protocol.outcomesModule || {};
    const sponsor = protocol.sponsorCollaboratorsModule || {};
    const nctId = identification.nctId || "";
    const briefTitle = identification.briefTitle || identification.officialTitle || "";
    const phase = (design.phases || []).join(", ");
    const enrollment = design.enrollmentInfo?.count ? `Enrollment: ${design.enrollmentInfo.count}.` : "";
    const overallStatus = status.overallStatus ? `Status: ${status.overallStatus}.` : "";
    const conditionText = (conditions.conditions || []).join("; ");

    return enrichItem({
      id: `trial-${nctId}`,
      publishedAt: clampFutureDate(normalizeDate(status.lastUpdatePostDateStruct?.date || status.studyFirstPostDateStruct?.date || dateOnly(now))),
      source: "ClinicalTrials.gov",
      category: "临床试验",
      title: briefTitle,
      summary: cleanup([overallStatus, phase ? `Phase: ${phase}.` : "", enrollment, conditionText ? `Condition: ${conditionText}.` : ""].join(" ")),
      url: `https://clinicaltrials.gov/study/${nctId}`,
      doi: "",
      pmid: "",
      trialId: nctId,
      origin: "ClinicalTrials.gov",
      trial: {
        status: status.overallStatus || "",
        phase: phase || "",
        enrollment: design.enrollmentInfo?.count || null,
        startDate: status.startDateStruct?.date || "",
        completionDate: status.completionDateStruct?.date || "",
        primaryOutcomes: (outcomes.primaryOutcomes || []).map(outcome => outcome.measure).filter(Boolean),
        interventionTypes: (arms.interventions || []).map(intervention => intervention.type).filter(Boolean),
        interventions: (arms.interventions || []).map(intervention => intervention.name).filter(Boolean),
        sponsor: sponsor.leadSponsor?.name || ""
      }
    });
  }).filter(item => item.title && item.trialId);
}

function enrichItem(base) {
  const textForRules = `${base.title} ${base.summary}`.toLowerCase();
  const category = base.category || classify(textForRules);
  const tags = tagsFor(textForRules, category);
  const priority = scorePriority(textForRules, category, base.origin);
  const translatedTitle = termAwareTitle(base.title);
  const evidenceLevel = inferEvidenceLevel(textForRules, category, base.origin, base.trialId);
  const relevance = inferRelevance(base, textForRules);

  return {
    ...base,
    category,
    priority,
    evidenceLevel,
    relevanceScore: relevance.score,
    relevanceFlag: relevance.flag,
    titleZh: translatedTitle,
    summaryZh: chineseSummary(base.summary, category),
    insight: insightFor(textForRules, category, base.origin),
    aiRead: aiReadFor(base.summary, category, evidenceLevel),
    tags,
    needsReview: true,
    translationStatus: "machine-assisted-draft"
  };
}

function classify(value) {
  for (const rule of categoryRules) {
    if (rule.terms.some(term => value.includes(term))) return rule.category;
  }
  return "机制";
}

function tagsFor(value, category) {
  const tags = [];
  for (const [tag, terms] of tagRules) {
    if (terms.some(term => value.includes(term))) tags.push(tag);
  }
  if (!tags.includes(category)) tags.push(category);
  if (!tags.includes("ALS")) tags.unshift("ALS");
  return tags.slice(0, 6);
}

function scorePriority(value, category, origin) {
  let score = 0;
  if (["临床试验", "治疗"].includes(category)) score += 2;
  if (origin === "ClinicalTrials.gov") score += 1;
  for (const term of ["phase 2", "phase 3", "randomized", "tofersen", "sod1", "c9orf72", "tdp-43", "neurofilament"]) {
    if (value.includes(term)) score += 1;
  }
  return score >= 3 ? "high" : score >= 1 ? "medium" : "low";
}

function termAwareTitle(title) {
  let output = title;
  for (const [source, target] of glossary) {
    output = output.replace(new RegExp(source, "ig"), target);
  }
  return output === title ? `待复核翻译：${title}` : output;
}

function chineseSummary(summary, category) {
  const first = sentence(summary);
  const terms = [];
  const lower = summary.toLowerCase();
  for (const [source, target] of glossary) {
    if (lower.includes(source)) terms.push(`${source}=${target}`);
  }
  const termText = terms.length ? `涉及术语：${terms.slice(0, 5).join("；")}。` : "未识别到核心术语，需要人工补充中文摘要。";
  return `自动抓取条目，分类为“${category}”。英文摘要首句：${first} ${termText}`;
}

function insightFor(value, category, origin) {
  if (category === "临床试验") return "该条目来自临床试验注册库，重点关注入组状态、分期、干预方式、终点和最近更新时间，不能等同于疗效已经证实。";
  if (category === "治疗") return "该条目涉及潜在治疗策略，应区分动物实验、早期临床和确证性临床结果，并优先核查原文终点和样本量。";
  if (category === "生物标志物") return "该条目可能影响 ALS 诊断、分层或疗效评估，建议关注样本来源、队列规模和是否经过外部验证。";
  if (category === "遗传") return "该条目有助于理解遗传分型和精准治疗方向，建议同时关注适用人群比例和机制证据强度。";
  if (value.includes("tdp-43")) return "TDP-43 相关内容常连接 ALS 共同病理机制、RNA 代谢和治疗靶点，是长期追踪重点。";
  return `${origin} 新近记录，建议复核摘要、研究设计和原文结论后进入精选列表。`;
}

function inferEvidenceLevel(value, category, origin, trialId) {
  if (trialId || origin === "ClinicalTrials.gov") return "临床试验注册";
  if (value.includes("randomized") || value.includes("placebo") || value.includes("double-blind")) return "随机对照试验";
  if (value.includes("phase 1") || value.includes("phase 2") || value.includes("phase 3") || value.includes("clinical trial")) return "临床试验研究";
  if (value.includes("cohort") || value.includes("case-control") || value.includes("patients")) return "观察性临床研究";
  if (value.includes("review") || value.includes("meta-analysis")) return "综述/荟萃分析";
  if (value.includes("mouse") || value.includes("mice") || value.includes("cell") || value.includes("in vitro")) return "动物/细胞实验";
  if (category === "机制") return "机制研究";
  return "待人工判定";
}

function inferRelevance(item, value) {
  let score = 0;
  if (value.includes("amyotrophic lateral sclerosis")) score += 5;
  if (value.includes("motor neuron disease") || value.includes("motor neurone disease")) score += 4;
  if (item.trialId || item.origin === "ClinicalTrials.gov") score += 4;
  if (/\bals\b/.test(value)) score += 2;
  for (const term of ["tdp-43", "sod1", "c9orf72", "fus", "tardbp", "neurofilament", "tofersen"]) {
    if (value.includes(term)) score += 2;
  }
  for (const term of ["alcohol", "altitude", "advanced life support", "area-level", "alkali", "aluminum"]) {
    if (value.includes(term) && !value.includes("amyotrophic lateral sclerosis")) score -= 3;
  }
  return { score: Math.max(0, score), flag: score < 3 ? "low" : score < 6 ? "medium" : "high" };
}

function aiReadFor(summary, category, evidenceLevel) {
  return {
    studyType: evidenceLevel,
    keyFinding: sentence(summary),
    limitation: "机器初筛结果，研究设计、样本量、终点和结论强度仍需人工复核。",
    watchNext: watchNextFor(category)
  };
}

function watchNextFor(category) {
  if (category === "临床试验") return "关注入组状态、主要终点、结果发布日期和是否有同类药物对照。";
  if (category === "治疗") return "关注是否进入人体试验、疗效终点、样本量和安全性信号。";
  if (category === "生物标志物") return "关注外部验证、检测平台稳定性和能否预测进展或疗效。";
  if (category === "遗传") return "关注变异人群比例、功能证据和是否能转化为分型治疗。";
  return "关注是否从机制假说推进到动物模型、患者样本或治疗干预证据。";
}

function dedupe(items) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = item.doi || item.pmid || item.trialId || item.title.toLowerCase().replace(/\W+/g, " ").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

async function getJson(url) {
  const response = await fetch(url, { headers: { "User-Agent": "ALS-frontier-site/0.2 (research monitoring)" } });
  if (!response.ok) throw new Error(`${url.hostname} returned HTTP ${response.status}`);
  return response.json();
}

async function getText(url) {
  const response = await fetch(url, { headers: { "User-Agent": "ALS-frontier-site/0.2 (research monitoring)" } });
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
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function clampFutureDate(value) {
  const date = new Date(value);
  if (!Number.isNaN(date.getTime()) && date > now) return dateOnly(now);
  return value;
}

function cleanup(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function pubMedDate(article) {
  const pubDate = article.match(/<PubDate>([\s\S]*?)<\/PubDate>/)?.[1] || "";
  const year = text(pubDate, "Year") || String(now.getFullYear());
  const monthRaw = text(pubDate, "Month") || "01";
  const day = text(pubDate, "Day") || "01";
  const month = monthNumber(monthRaw);
  return `${year}-${month}-${String(day).padStart(2, "0")}`;
}

function doiFromXml(article) {
  const match = article.match(/<ArticleId IdType="doi">([\s\S]*?)<\/ArticleId>/);
  return match ? cleanup(stripTags(match[1])) : "";
}

function monthNumber(value) {
  const months = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12"
  };
  const normalized = String(value).slice(0, 3).toLowerCase();
  if (/^\d+$/.test(value)) return String(value).padStart(2, "0");
  return months[normalized] || "01";
}

function normalizeDate(value) {
  if (/^\d{4}$/.test(String(value))) return `${value}-01-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? dateOnly(now) : dateOnly(date);
}

function dateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function sentence(value) {
  const first = cleanup(value).split(/(?<=[.!?])\s+/)[0] || "No English abstract sentence available.";
  return first.length > 280 ? `${first.slice(0, 277)}...` : first;
}

function getArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
