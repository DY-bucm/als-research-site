# 部署说明

这个项目是纯静态网站，可以部署到 GitHub Pages、Vercel、Netlify 或任意静态文件服务器。

## 推荐：GitHub Pages

1. 在 GitHub 新建一个仓库。
2. 把本目录全部推送到仓库默认分支 `main`。
3. 进入仓库 `Settings -> Pages`。
4. `Source` 选择 `GitHub Actions`。
5. 进入 `Actions`，手动运行 `Deploy Static Site`，或等待下一次 push 自动部署。

部署成功后，GitHub 会给出类似下面的地址：

```text
https://你的用户名.github.io/仓库名/
```

## 每日自动更新

`.github/workflows/daily-update.yml` 会每天运行一次：

```text
node scripts/update-feed.mjs --days 30 --limit 15 --output data/items.json
```

它会抓取 PubMed、Europe PMC 和 ClinicalTrials.gov，更新 `data/items.json`，再运行：

```text
node scripts/archive-feed.mjs data/items.json
```

这会生成每日快照。提交后 `Deploy Static Site` 会再次部署网站。

## 可选 AI 精读

如需启用 AI 精读，在本地或 GitHub Actions secret 中设置：

```text
OPENAI_API_KEY
```

然后运行：

```powershell
npm run ai:enrich
```

默认模型由 `OPENAI_MODEL` 控制，未设置时使用 `gpt-5.2`。AI 输出仍建议人工复核。

## 本地预览

```powershell
npm run serve
```

访问：

```text
http://127.0.0.1:5173
```

## 上线前检查

```powershell
npm run check
npm run verify
```

建议每次部署前也生成质量报告：

```powershell
npm run quality
npm run changelog
npm run export
npm run status
```

## 人工复核内容

每日更新会覆盖 `data/items.json`，人工翻译和精选内容请保存在：

```text
data/review-overrides.json
```

复核台地址：

```text
/review.html
```

## 注意

当前中文内容仍是机器草稿加人工复核机制。正式医学用途前，应对精选条目做人工复核。
