# ALS 前沿研究进展情报站

这是一个静态优先的 ALS 前沿研究情报站，用于追踪肌萎缩侧索硬化症（ALS）的最新论文、临床试验、治疗管线和国际报道。当前版本包含真实数据抓取、自动分类、重要性评分、中文草稿解读和人工复核覆盖层。

## 打开方式

推荐直接双击：

```text
打开ALS网站.cmd
```

它会自动启动本地服务，并用 Edge 打开：

```text
http://127.0.0.1:5173/
```

不要直接用 Edge 打开 `file:///.../index.html`，因为浏览器可能限制页面读取 `data/*.json`。

如果浏览器限制本地 `fetch`，可在当前目录启动一个静态服务器。推荐用项目内置脚本：

```powershell
node .\scripts\serve.mjs
```

然后访问：

```text
http://localhost:5173
```

## 数据结构

页面读取 `data/items.json`。每条内容保留：

- 英文标题和英文摘要
- 中文标题和中文解读
- 原文链接
- DOI、PMID 或临床试验号
- 分类、标签和重点程度

## 第二版：真实数据更新

第二版提供 `scripts/update-feed.mjs`，会同时抓取：

- PubMed：近期 ALS 论文和综述。
- Europe PMC：开放全文、预印本和补充元数据。
- ClinicalTrials.gov：ALS 临床试验注册和状态更新。

在 Windows PowerShell 中运行：

```powershell
.\scripts\update-daily.ps1 -DaysBack 30 -Limit 12
```

或直接用 Node：

```powershell
node .\scripts\update-feed.mjs --days 30 --limit 12 --output data/items.json
```

脚本会写入 `data/items.json`，页面刷新后自动读取新数据。

## 自动处理内容

当前脚本会自动完成：

1. 按日期抓取新条目。
2. 基于 DOI、PMID、NCT 号和标题去重。
3. 按机制、遗传、治疗、临床试验、生物标志物分类。
4. 识别 TDP-43、SOD1、C9orf72、ASO、NfL 等标签。
5. 生成重要性等级、证据等级和中文结构化解读。
6. 标记 `needsReview: true`，提醒人工复核医学结论。
7. 生成 AI 精读结构：研究类型、关键发现、局限性、下一步关注。

## 仍需人工复核的部分

没有接入正式翻译 API 时，中文内容是术语辅助的机器草稿，不应当直接当作最终医学翻译。正式部署时建议接入翻译/大模型 API，并保留人工精选入口。

## GitHub Actions

`.github/workflows/daily-update.yml` 已包含每日自动更新模板。推送到 GitHub 后，可以用 Actions 每天更新 `data/items.json` 并自动提交。

`.github/workflows/pages.yml` 已包含 GitHub Pages 部署流程。仓库 Pages 设置选择 `GitHub Actions` 后，每次 push 会自动部署静态网站。详细步骤见 `DEPLOYMENT.md`。

## 第三版：人工复核层

每日抓取会重写 `data/items.json`，所以人工翻译和精选内容不要直接改这个文件。请改 `data/review-overrides.json`，或打开复核台编辑：

```text
http://localhost:5173/review.html
```

复核台可以编辑中文标题、中文摘要、重要性说明，并标记：

- `reviewed: true`：页面显示“已复核”，不再显示“待复核”。
- `featured: true`：进入首页“只看精选”筛选。
- `evidenceLevel`：人工修正证据等级。
- `aiRead`：人工修正研究类型、关键发现、局限性和下一步关注。

复核台会下载新的 `review-overrides.json`。把它放回 `data/` 目录后，首页会自动合并覆盖内容。

## 首页精进项

首页现在包含“精选日报”，会按精选状态、复核状态、重要性和证据等级自动挑出优先阅读条目。每条卡片还会显示证据等级和结构化精读，避免把机制假说、动物实验、临床注册和随机对照试验混在一起解读。

## 第四版：质量控制和趋势

当前版本继续增加了三项长期使用能力：

1. `relevanceScore` 和 `relevanceFlag`：自动判断条目与 ALS 的相关性，低相关内容会显示“疑似误收”。
2. 详情页：从首页点击“详情页”，可查看完整中文精读、英文摘要、证据等级、原文链接和相关条目。
3. 趋势看板：首页统计分类分布、证据等级、来源分布和高频主题，帮助判断近期研究方向变化。

## 第五版：六项产品化增强

当前版本继续补齐：

1. 可选 AI 精读流水线：`scripts/enrich-ai.mjs`，设置 `OPENAI_API_KEY` 后可生成更高质量中文精读。
2. 每日简报页：`briefing.html`，集中查看优先阅读、临床动态、疑似误收和待复核内容。
3. 临床试验雷达：`trials.html`，按 NCT、招募状态、分期和干预方式查看临床试验。
4. 研究专题页：`topics.html`，聚合 TDP-43、SOD1、C9orf72、NfL、神经炎症、ASO/RNA therapy、肠脑轴等专题。
5. 历史归档：`scripts/archive-feed.mjs` 会生成 `data/archive/YYYY-MM-DD.json` 和 `manifest.json`。
6. 搜索筛选升级：首页支持证据等级、来源、精选和疑似误收过滤。

AI 精读命令：

```powershell
$env:OPENAI_API_KEY="你的 API key"
npm run ai:enrich
```

归档命令：

```powershell
npm run archive
```

## 第六版：可靠性增强

这轮补齐了六项长期维护能力：

1. 端到端静态烟测：`npm run verify` 会检查主要页面、资源和数据文件是否可读。
2. 数据质量报告：`quality.html` 展示疑似误收、缺标识符、缺摘要、高优先级待复核和来源失败。
3. 变更检测：`scripts/changelog.mjs` 会对比归档快照，生成 `data/changelog.json`。
4. 结构化临床试验字段：ClinicalTrials.gov 条目保存 `trial.status`、`trial.phase`、`trial.enrollment`、`trial.primaryOutcomes`、`trial.interventions`、`trial.sponsor` 等字段。
5. 术语表管理：`data/glossary.json` 维护英文术语、推荐中文译名、别名和所属专题。
6. 数据源配置：`data/source-config.json` 记录当前启用和计划接入的数据源。

质量报告和变更日志命令：

```powershell
npm run quality
npm run changelog
npm run verify
```

## 第七版：日常使用效率增强

这轮继续补齐：

1. 批量复核工作台：复核台支持按任务筛选、全选可见、批量已复核、批量精选、批量误收。
2. 误收排除规则：`data/exclusion-rules.json` 定义标题关键词、来源关键词和指定 ID 排除规则；`npm run exclude` 应用规则。
3. 阅读状态：首页支持“已读 / 收藏 / 稍后看”，状态保存在浏览器 `localStorage`。
4. 专题知识库：`data/topic-hubs.json` 为专题页提供简介、关键术语、代表性关注点和待复核条目。
5. 导出能力：`export.html` 提供 Markdown、CSV、BibTeX 和复核任务清单下载；`npm run export` 重新生成。
6. 部署后监控：`status.html` 展示更新时间、来源状态、质量问题和归档快照；`npm run status` 重新生成。

## 注意

本站用于科研信息追踪，不构成医疗建议。付费论文不应全文搬运，应展示元数据、摘要、解读和原文链接。
