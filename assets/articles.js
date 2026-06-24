const state = {
  articles: [],
  translations: new Map(),
  query: "",
  type: "全部",
  showAbstracts: false
};

const nodes = {
  count: document.querySelector("#articleCount"),
  period: document.querySelector("#articlePeriod"),
  updated: document.querySelector("#articleUpdated"),
  search: document.querySelector("#articleSearch"),
  type: document.querySelector("#articleType"),
  showAbstracts: document.querySelector("#showAbstracts"),
  timeline: document.querySelector("#articleTimeline"),
  empty: document.querySelector("#articleEmpty")
};

boot().catch(error => {
  console.error(error);
  nodes.count.textContent = "0";
  nodes.period.textContent = "文献数据读取失败";
  nodes.updated.textContent = "";
  nodes.timeline.innerHTML = `
    <p class="empty-state">
      无法读取近10天文献数据。请确认 assets/articles.js 和 data/articles-recent.json 已上传并完成 GitHub Pages 部署。
    </p>
  `;
});

async function boot() {
  const [archive, feed] = await Promise.all([
    fetchJson("data/articles-recent.json"),
    fetchJson("data/items.json").catch(() => ({ items: [] }))
  ]);
  state.articles = archive.articles || [];
  state.translations = new Map(
    (feed.items || []).flatMap(item => {
      const keys = [item.pmid && `pmid:${item.pmid}`, item.doi && `doi:${item.doi.toLowerCase()}`].filter(Boolean);
      return keys.map(key => [key, item]);
    })
  );
  nodes.count.textContent = archive.count ?? state.articles.length;
  nodes.period.textContent = `${formatDate(archive.period?.from)} 至 ${formatDate(archive.period?.to)}`;
  nodes.updated.textContent = `更新于 ${formatDateTime(archive.updatedAt)}`;
  renderTypes();
  render();
}

function renderTypes() {
  const types = [...new Set(state.articles.flatMap(article => article.publicationTypes || []).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  nodes.type.innerHTML = ["全部", ...types]
    .map(type => `<option value="${escapeAttribute(type)}">${escapeHtml(type)}</option>`)
    .join("");
}

function render() {
  const query = state.query.trim().toLowerCase();
  const filtered = state.articles.filter(article => {
    const typeOk = state.type === "全部" || (article.publicationTypes || []).includes(state.type);
    const haystack = [
      article.title,
      article.abstract,
      article.journal,
      ...(article.authors || []),
      ...(article.publicationTypes || [])
    ].join(" ").toLowerCase();
    return typeOk && (!query || haystack.includes(query));
  });

  const groups = groupByDate(filtered);
  nodes.timeline.innerHTML = [...groups.entries()]
    .map(([date, articles]) => `
      <section class="article-day">
        <div class="article-day-head">
          <time datetime="${escapeAttribute(date)}">${formatDate(date)}</time>
          <span>${articles.length} 篇</span>
        </div>
        <div class="article-day-list">${articles.map(renderArticle).join("")}</div>
      </section>
    `).join("");
  nodes.empty.hidden = filtered.length > 0;
}

function renderArticle(article) {
  const translated = translationFor(article);
  const titleZh = translated?.titleZh && !translated.titleZh.startsWith("待复核翻译") ? translated.titleZh : "";
  const abstractZh = translated?.abstractZh || "";
  const authorText = formatAuthors(article.authors || []);
  const types = (article.publicationTypes || []).map(type => `<span class="badge">${escapeHtml(type)}</span>`).join("");
  return `
    <article class="literature-item">
      <div class="literature-meta">
        <span>${escapeHtml(article.journal || "PubMed")}</span>
        <span>PMID ${escapeHtml(article.pmid)}</span>
      </div>
      <h2>${escapeHtml(article.title)}</h2>
      ${titleZh ? `<p class="literature-title-zh">${escapeHtml(titleZh)}</p>` : ""}
      ${authorText ? `<p class="literature-authors">${escapeHtml(authorText)}</p>` : ""}
      <div class="meta">${types}</div>
      ${state.showAbstracts ? renderAbstract(article, abstractZh) : ""}
      <div class="links">
        <a href="${escapeAttribute(article.url)}" target="_blank" rel="noreferrer">PubMed 原文</a>
        ${article.doi ? `<a href="https://doi.org/${encodeURIComponent(article.doi)}" target="_blank" rel="noreferrer">DOI</a>` : ""}
        ${translated ? `<a href="detail.html?id=${encodeURIComponent(translated.id)}">中文精读</a>` : ""}
      </div>
    </article>
  `;
}

function renderAbstract(article, abstractZh) {
  if (!article.abstract) return '<p class="literature-abstract muted">PubMed 当前记录未提供摘要。</p>';
  return `
    <details class="literature-abstract" open>
      <summary>摘要</summary>
      <p class="english">${escapeHtml(article.abstract)}</p>
      ${abstractZh ? `<h3>中文翻译</h3><p>${escapeHtml(abstractZh)}</p>` : ""}
    </details>
  `;
}

function translationFor(article) {
  return state.translations.get(`pmid:${article.pmid}`)
    || (article.doi ? state.translations.get(`doi:${article.doi.toLowerCase()}`) : null);
}

function groupByDate(articles) {
  return articles.reduce((groups, article) => {
    const date = article.publishedAt || "日期待定";
    if (!groups.has(date)) groups.set(date, []);
    groups.get(date).push(article);
    return groups;
  }, new Map());
}

function formatAuthors(authors) {
  if (!authors.length) return "";
  if (authors.length <= 6) return authors.join(", ");
  return `${authors.slice(0, 6).join(", ")} 等`;
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function formatDate(value) {
  if (!value) return "日期待定";
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? String(value)
    : new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "时间待定"
    : new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

nodes.search.addEventListener("input", event => {
  state.query = event.target.value;
  render();
});

nodes.type.addEventListener("change", event => {
  state.type = event.target.value;
  render();
});

nodes.showAbstracts.addEventListener("change", event => {
  state.showAbstracts = event.target.checked;
  render();
});
