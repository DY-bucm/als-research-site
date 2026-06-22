const root = document.querySelector("#exportRoot");

const files = [
  { title: "Markdown 简报", path: "exports/daily-briefing.md", desc: "适合直接复制到笔记、日报或邮件。" },
  { title: "CSV 文献表", path: "exports/items.csv", desc: "适合用 Excel、Numbers 或统计工具打开。" },
  { title: "BibTeX 引文", path: "exports/references.bib", desc: "适合导入 Zotero、LaTeX 或文献管理流程。" },
  { title: "复核任务清单", path: "exports/review-tasks.md", desc: "列出待复核、高优先级和疑似误收条目。" }
];

root.innerHTML = files.map(file => `
  <article class="briefing-section">
    <h2>${file.title}</h2>
    <p>${file.desc}</p>
    <div class="links"><a href="${file.path}" target="_blank" rel="noreferrer">打开/下载</a></div>
  </article>
`).join("");
