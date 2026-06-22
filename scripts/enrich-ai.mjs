import { readFile, writeFile } from "node:fs/promises";

const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL || "gpt-5.2";
const inputPath = process.argv[2] || "data/items.json";
const outputPath = process.argv[3] || "data/items.json";
const limit = Number(process.env.AI_ENRICH_LIMIT || 10);

if (!apiKey) {
  console.error("OPENAI_API_KEY is required for AI enrichment.");
  process.exit(1);
}

const payload = JSON.parse(await readFile(inputPath, "utf8"));
const items = payload.items || [];

for (const item of items.slice(0, limit)) {
  const enriched = await enrichItem(item);
  item.titleZh = enriched.titleZh || item.titleZh;
  item.summaryZh = enriched.summaryZh || item.summaryZh;
  item.insight = enriched.insight || item.insight;
  item.evidenceLevel = enriched.evidenceLevel || item.evidenceLevel;
  item.priority = enriched.priority || item.priority;
  item.aiRead = enriched.aiRead || item.aiRead;
  item.aiReviewedAt = new Date().toISOString();
  item.translationStatus = "ai-draft";
}

await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`AI-enriched ${Math.min(limit, items.length)} items in ${outputPath}`);

async function enrichItem(item) {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      titleZh: { type: "string" },
      summaryZh: { type: "string" },
      insight: { type: "string" },
      evidenceLevel: { type: "string" },
      priority: { type: "string", enum: ["low", "medium", "high"] },
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
    required: ["titleZh", "summaryZh", "insight", "evidenceLevel", "priority", "aiRead"]
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
          content: "你是严谨的神经退行性疾病科研编辑。请忠实翻译和精读 ALS 相关英文条目，不夸大疗效，不把早期机制研究写成临床突破。输出必须是中文 JSON。"
        },
        {
          role: "user",
          content: JSON.stringify({
            title: item.title,
            abstract: item.summary,
            category: item.category,
            evidenceLevel: item.evidenceLevel,
            source: item.source,
            url: item.url
          })
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "als_research_readout",
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
