import { readFile, writeFile } from "node:fs/promises";

const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL || "gpt-5.2";
const inputPath = process.argv[2] || "data/items.json";
const outputPath = process.argv[3] || "data/items.json";
const limit = Number(process.env.AI_ENRICH_LIMIT || 10);
const force = process.env.AI_ENRICH_FORCE === "1";

if (!apiKey) {
  console.error("OPENAI_API_KEY is required for AI enrichment.");
  process.exit(1);
}

const payload = JSON.parse(await readFile(inputPath, "utf8"));
const items = payload.items || [];
const candidates = items.filter(item => force || needsTranslation(item)).slice(0, limit);

for (const item of candidates) {
  const enriched = await withRetry(() => enrichItem(item), 2);
  item.titleZh = enriched.titleZh || item.titleZh;
  item.abstractZh = enriched.abstractZh || item.abstractZh;
  item.summaryZh = enriched.summaryZh || item.summaryZh;
  item.insight = enriched.insight || item.insight;
  item.evidenceLevel = enriched.evidenceLevel || item.evidenceLevel;
  item.priority = enriched.priority || item.priority;
  item.frontierRationale = enriched.frontierRationale || item.frontierRationale;
  item.aiRead = enriched.aiRead || item.aiRead;
  item.aiReviewedAt = new Date().toISOString();
  item.translationStatus = "ai-translated-draft";
  item.needsReview = true;
}

await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`AI-translated ${candidates.length} item(s) in ${outputPath}`);

function needsTranslation(item) {
  if (!item.title || !item.summary) return false;
  if (!item.abstractZh) return true;
  if (item.translationStatus !== "ai-translated-draft" && item.translationStatus !== "human-reviewed") return true;
  return false;
}

async function enrichItem(item) {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      titleZh: { type: "string" },
      abstractZh: { type: "string" },
      summaryZh: { type: "string" },
      insight: { type: "string" },
      evidenceLevel: { type: "string" },
      priority: { type: "string", enum: ["low", "medium", "high"] },
      frontierRationale: { type: "string" },
      aiRead: {
        type: "object",
        additionalProperties: false,
        properties: {
          studyType: { type: "string" },
          keyFinding: { type: "string" },
          limitation: { type: "string" },
          watchNext: { type: "string" }
        },
        required: ["studyType", "keyFinding", "limitation", "watchNext"]
      }
    },
    required: ["titleZh", "abstractZh", "summaryZh", "insight", "evidenceLevel", "priority", "frontierRationale", "aiRead"]
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: [
            "你是严谨的 ALS 和神经退行性疾病科研编辑。",
            "请把英文科研条目处理成中文网站可展示内容，必须严格区分准确翻译和解读。",
            "titleZh：准确翻译英文标题，不要中英文混杂。",
            "abstractZh：忠实翻译英文摘要或临床试验登记摘要，只翻译原文已有信息，不添加外部信息。",
            "summaryZh：给中文读者看的简洁要点，不要求逐句对应，但不能与原文矛盾。",
            "insight：解释这篇/这项试验为什么值得 ALS 研究者跟踪。",
            "frontierRationale：用一句话说明其前沿性，必须包含新近性、ALS 相关性或转化价值之一。",
            "临床试验登记不能写成疗效已经证实；机制、动物或细胞研究不能写成临床突破。",
            "如果原文没有摘要，abstractZh 应忠实说明原始来源只提供了题名/登记字段。",
            "输出必须是合法 JSON，并符合给定 schema。"
          ].join("\n")
        },
        {
          role: "user",
          content: JSON.stringify({
            id: item.id,
            title: item.title,
            abstract: item.summary,
            category: item.category,
            evidenceLevel: item.evidenceLevel,
            source: item.source,
            origin: item.origin,
            publishedAt: item.publishedAt,
            url: item.url,
            doi: item.doi,
            pmid: item.pmid,
            trialId: item.trialId,
            trial: item.trial || null,
            tags: item.tags || []
          })
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "als_research_translation",
          schema,
          strict: true
        }
      }
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI API HTTP ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  const text = extractOutputText(data);
  return JSON.parse(text);
}

async function withRetry(fn, retries) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(1000 * (attempt + 1));
    }
  }
  throw lastError;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractOutputText(data) {
  if (data.output_text) return data.output_text;
  const parts = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (content.text) parts.push(content.text);
    }
  }
  return parts.join("\n");
}
