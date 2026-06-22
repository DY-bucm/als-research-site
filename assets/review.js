const state = {
  items: [],
  overrides: { updatedAt: today(), items: {} },
  activeId: "",
  query: "",
  taskFilter: "all",
  selectedIds: new Set(),
  visibleIds: []
};

const nodes = {
  reviewSearch: document.querySelector("#reviewSearch"),
  taskFilter: document.querySelector("#taskFilter"),
  reviewItems: document.querySelector("#reviewItems"),
  editor: document.querySelector("#editor"),
  editorMeta: document.querySelector("#editorMeta"),
  editorTitle: document.querySelector("#editorTitle"),
  editorLink: document.querySelector("#editorLink"),
  titleZhInput: document.querySelector("#titleZhInput"),
  summaryZhInput: document.querySelector("#summaryZhInput"),
  insightInput: document.querySelector("#insightInput"),
  evidenceInput: document.querySelector("#evidenceInput"),
  studyTypeInput: document.querySelector("#studyTypeInput"),
  keyFindingInput: document.querySelector("#keyFindingInput"),
  limitationInput: document.querySelector("#limitationInput"),
  watchNextInput: document.querySelector("#watchNextInput"),
  reviewedInput: document.querySelector("#reviewedInput"),
  featuredInput: document.querySelector("#featuredInput"),
  excludedInput: document.querySelector("#excludedInput"),
  selectVisible: document.querySelector("#selectVisible"),
  clearSelection: document.querySelector("#clearSelection"),
  bulkReviewed: document.querySelector("#bulkReviewed"),
  bulkFeatured: document.querySelector("#bulkFeatured"),
  bulkExcluded: document.querySelector("#bulkExcluded"),
  saveItem: document.querySelector("#saveItem"),
  copyJson: document.querySelector("#copyJson"),
  downloadOverrides: document.querySelector("#downloadOverrides"),
  originalText: document.querySelector("#originalText")
};

async function boot() {
  const feed = await fetchJson("data/items.json");
  const overrides = await fetchJson("data/review-overrides.json").catch(() => ({ updatedAt: today(), items: {} }));
  state.items = feed.items || [];
  state.overrides = normalizeOverrides(overrides);
  state.activeId = state.items[0]?.id || "";
  renderList();
  renderEditor();
}

function renderList() {
  const query = state.query.toLowerCase().trim();
  const rows = state.items.filter(item => {
    const text = [item.id, item.title, item.titleZh, item.summary, item.category, item.tags?.join(" ")].join(" ").toLowerCase();
    return text.includes(query) && matchesTaskFilter(item);
  });
  state.visibleIds = rows.map(item => item.id);

  nodes.reviewItems.innerHTML = rows.map(item => {
    const override = state.overrides.items[item.id] || {};
    const reviewed = override.reviewed ? "已复核" : "待复核";
    const featured = override.featured ? " · 精选" : "";
    const excluded = override.excluded ? " · 误收" : item.relevanceFlag === "low" ? " · 疑似误收" : "";
    const checked = state.selectedIds.has(item.id) ? " checked" : "";
    return `
      <div class="review-row${item.id === state.activeId ? " active" : ""}" data-id="${escapeAttribute(item.id)}">
        <label class="row-check"><input type="checkbox" data-select-id="${escapeAttribute(item.id)}"${checked}></label>
        <button type="button" data-open-id="${escapeAttribute(item.id)}">
          <strong>${escapeHtml(item.titleZh || item.title)}</strong>
          <span>${escapeHtml(item.category)} · ${escapeHtml(reviewed)}${featured}${excluded}</span>
        </button>
      </div>
    `;
  }).join("");
}

function matchesTaskFilter(item) {
  const override = state.overrides.items[item.id] || {};
  if (state.taskFilter === "needsReview") return !override.reviewed && item.needsReview;
  if (state.taskFilter === "high") return item.priority === "high";
  if (state.taskFilter === "lowRel") return override.excluded || item.relevanceFlag === "low";
  if (state.taskFilter === "missingAbstract") return !item.summary || /no abstract|not available/i.test(item.summary);
  if (state.taskFilter === "featured") return override.featured;
  return true;
}

function renderEditor() {
  const item = state.items.find(row => row.id === state.activeId);
  if (!item) {
    nodes.editor.hidden = true;
    return;
  }

  const override = state.overrides.items[item.id] || {};
  nodes.editor.hidden = false;
  nodes.editorMeta.textContent = `${item.publishedAt} · ${item.source} · ${item.category} · ${item.id}`;
  nodes.editorTitle.textContent = item.title;
  nodes.editorLink.href = item.url;
  nodes.titleZhInput.value = override.titleZh ?? item.titleZh ?? "";
  nodes.summaryZhInput.value = override.summaryZh ?? item.summaryZh ?? "";
  nodes.insightInput.value = override.insight ?? item.insight ?? "";
  nodes.evidenceInput.value = override.evidenceLevel ?? item.evidenceLevel ?? "";
  const aiRead = override.aiRead ?? item.aiRead ?? {};
  nodes.studyTypeInput.value = aiRead.studyType ?? "";
  nodes.keyFindingInput.value = aiRead.keyFinding ?? "";
  nodes.limitationInput.value = aiRead.limitation ?? "";
  nodes.watchNextInput.value = aiRead.watchNext ?? "";
  nodes.reviewedInput.checked = Boolean(override.reviewed);
  nodes.featuredInput.checked = Boolean(override.featured);
  nodes.excludedInput.checked = Boolean(override.excluded);
  nodes.originalText.textContent = `${item.title}. ${item.summary}`;
}

function saveActive() {
  const item = state.items.find(row => row.id === state.activeId);
  if (!item) return;

  state.overrides.updatedAt = today();
  state.overrides.items[item.id] = {
    reviewed: nodes.reviewedInput.checked,
    featured: nodes.featuredInput.checked,
    excluded: nodes.excludedInput.checked,
    titleZh: nodes.titleZhInput.value.trim(),
    summaryZh: nodes.summaryZhInput.value.trim(),
    insight: nodes.insightInput.value.trim(),
    evidenceLevel: nodes.evidenceInput.value.trim(),
    aiRead: {
      studyType: nodes.studyTypeInput.value.trim(),
      keyFinding: nodes.keyFindingInput.value.trim(),
      limitation: nodes.limitationInput.value.trim(),
      watchNext: nodes.watchNextInput.value.trim()
    }
  };

  renderList();
}

function bulkUpdate(updater) {
  saveActive();
  for (const id of state.selectedIds) {
    const item = state.items.find(row => row.id === id);
    if (!item) continue;
    const existing = state.overrides.items[id] || {};
    state.overrides.items[id] = updater({
      reviewed: existing.reviewed || false,
      featured: existing.featured || false,
      excluded: existing.excluded || false,
      titleZh: existing.titleZh ?? item.titleZh ?? "",
      summaryZh: existing.summaryZh ?? item.summaryZh ?? "",
      insight: existing.insight ?? item.insight ?? "",
      evidenceLevel: existing.evidenceLevel ?? item.evidenceLevel ?? "",
      aiRead: existing.aiRead ?? item.aiRead ?? {}
    });
  }
  state.overrides.updatedAt = today();
  renderList();
  renderEditor();
}

function downloadOverrides() {
  saveActive();
  const blob = new Blob([formatOverrides()], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "review-overrides.json";
  link.click();
  URL.revokeObjectURL(url);
}

async function copyOverrides() {
  saveActive();
  await navigator.clipboard.writeText(formatOverrides());
}

function formatOverrides() {
  return `${JSON.stringify(state.overrides, null, 2)}\n`;
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function normalizeOverrides(value) {
  return {
    updatedAt: value.updatedAt || today(),
    items: value.items && typeof value.items === "object" ? value.items : {}
  };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

nodes.reviewSearch.addEventListener("input", event => {
  state.query = event.target.value;
  renderList();
});

nodes.taskFilter.addEventListener("change", event => {
  state.taskFilter = event.target.value;
  renderList();
});

nodes.reviewItems.addEventListener("click", event => {
  const checkbox = event.target.closest("[data-select-id]");
  if (checkbox) {
    if (checkbox.checked) state.selectedIds.add(checkbox.dataset.selectId);
    else state.selectedIds.delete(checkbox.dataset.selectId);
    return;
  }
  const row = event.target.closest("[data-open-id]");
  if (!row) return;
  saveActive();
  state.activeId = row.dataset.openId;
  renderList();
  renderEditor();
});

nodes.selectVisible.addEventListener("click", () => {
  state.visibleIds.forEach(id => state.selectedIds.add(id));
  renderList();
});
nodes.clearSelection.addEventListener("click", () => {
  state.selectedIds.clear();
  renderList();
});
nodes.bulkReviewed.addEventListener("click", () => bulkUpdate(item => ({ ...item, reviewed: true })));
nodes.bulkFeatured.addEventListener("click", () => bulkUpdate(item => ({ ...item, featured: true })));
nodes.bulkExcluded.addEventListener("click", () => bulkUpdate(item => ({ ...item, excluded: true, reviewed: true })));
nodes.saveItem.addEventListener("click", saveActive);
nodes.copyJson.addEventListener("click", copyOverrides);
nodes.downloadOverrides.addEventListener("click", downloadOverrides);

boot();
