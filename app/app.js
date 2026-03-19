import * as Diff from "./diff.js?h=52ba9aad";

const diffWorker = new Worker("./diff.worker.js", { type: "module" });
const originalInput = document.getElementById("original");
const modifiedInput = document.getElementById("modified");
const diffView = document.getElementById("output");
const changeSummary = document.getElementById("stats");
const changeSummarySplit = document.getElementById("statsSplit");
const copyLinkBtn = document.getElementById("copyLinkBtn");
const downloadPatchBtn = document.getElementById("downloadPatchBtn");
const urlWarning = document.getElementById("urlWarning");
const editBtn = document.getElementById("editBtn");
const compareBtn = document.getElementById("compareBtn");
const unifiedBtn = document.getElementById("btnUnified");
const sideBySideBtn = document.getElementById("btnSideBySide");
const patchDropdown = document.getElementById("patchDropdown");
const patchFilenameInput = document.getElementById("patchFilename");
const patchConfirmBtn = document.getElementById("patchConfirmBtn");
const normalizeBtn = document.getElementById("normalizeBtn");
const normalizeDropdown = document.getElementById("normalizeDropdown");
const ignoreTrailingCheckbox = document.getElementById("normTrailing");
const ignoreAmountCheckbox = document.getElementById("normAmount");
const ignoreAllCheckbox = document.getElementById("normAll");
const ignoreQuotesCheckbox = document.getElementById("normQuotes");
const clearOriginalBtn = document.getElementById("clearOriginalBtn");
const clearModifiedBtn = document.getElementById("clearModifiedBtn");
const copyOriginalBtn = document.getElementById("copyOriginalBtn");
const copyModifiedBtn = document.getElementById("copyModifiedBtn");
const minimap = document.getElementById("minimap");
const minimapCanvas = document.getElementById("minimapCanvas");
const minimapCtx = minimapCanvas.getContext("2d");
const minimapViewport = document.getElementById("minimapViewport");
const leftPills = document.getElementById("leftPills");
const rightPills = document.getElementById("rightPills");
const diffNameInput = document.getElementById("diffName");

const STORAGE_KEY = "diffSettings";
const MIN_COLLAPSE_LINES = 5;
const NO_COLLAPSE_THRESHOLD = 42;
const TRUNCATE_LEN = 40;
const COPIED_TEXT_SHOWN_MS = 1500;
const URL_WARN_THRESHOLD = 4000;
const COPY_ICON =
  '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 010 1.5h-1.5a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-1.5a.75.75 0 011.5 0v1.5A1.75 1.75 0 019.25 16h-7.5A1.75 1.75 0 010 14.25v-7.5z"/><path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0114.25 11h-7.5A1.75 1.75 0 015 9.25v-7.5zm1.75-.25a.25.25 0 00-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 00.25-.25v-7.5a.25.25 0 00-.25-.25h-7.5z"/></svg>';
const CHECK_ICON =
  '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/></svg>';
const EXPAND_ICON =
  '<svg class="expand-icon" viewBox="0 0 24 24" fill="none"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 7S5.79 4 5 4S2 7 2 7m10 5h10M12 8h10m-10 8h5M2 17s2.21 3 3 3s3-3 3-3M5 5v14"/></svg>';
const COLLAPSE_DOWN_ICON =
  '<svg class="collapse-icon" viewBox="0 0 24 24" fill="none"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 12h10M12 8h10m-10 8h5M2 8l3 3 3-3M5 5v6"/></svg>';
const COLLAPSE_UP_ICON =
  '<svg class="collapse-icon" viewBox="0 0 24 24" fill="none"><path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 12h10M12 8h10m-10 8h5M2 16l3-3 3 3M5 13v6"/></svg>';

let isComputing = false;
let currentDiff = null;
let ignoreOptions = {
  trailing: false,
  amount: false,
  all: false,
  quotes: false,
};
let currentView = "sbs";
let currentChangeIndex = -1;
let changeRows = [];
let expandedIds = new Set();
let segmentIdCounter = 0;
let diffName = "";
let isDraggingMinimap = false;
let minimapGrabOffset = 0;

function applySettings() {
  loadSettings();
  ignoreTrailingCheckbox.checked = ignoreOptions.trailing;
  ignoreAmountCheckbox.checked = ignoreOptions.amount;
  ignoreAllCheckbox.checked = ignoreOptions.all;
  ignoreQuotesCheckbox.checked = ignoreOptions.quotes;
  ignoreTrailingCheckbox.disabled = ignoreOptions.all;
  ignoreAmountCheckbox.disabled = ignoreOptions.all;
  normalizeBtn.classList.toggle("has-active", hasActiveNormalization());
  unifiedBtn.classList.toggle("active", currentView === "unified");
  sideBySideBtn.classList.toggle("active", currentView === "sbs");
  unifiedBtn.setAttribute("aria-pressed", currentView === "unified");
  sideBySideBtn.setAttribute("aria-pressed", currentView === "sbs");
}

const DEFAULT_TITLE = document.title;

function updateDocumentTitle() {
  document.title = diffName ? `${diffName} · kawari` : DEFAULT_TITLE;
}

function loadSettings() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    const settings = JSON.parse(saved);
    if (settings.view) currentView = settings.view;
    if (settings.ignore)
      ignoreOptions = { ...ignoreOptions, ...settings.ignore };
  } catch (e) {
    /* ignore */
  }
}

function hasActiveNormalization() {
  return (
    ignoreOptions.trailing ||
    ignoreOptions.amount ||
    ignoreOptions.all ||
    ignoreOptions.quotes
  );
}

async function loadFromUrl() {
  const hash = location.hash.slice(1);
  if (!hash) {
    currentDiff = null;
    diffName = "";
    diffNameInput.value = "";
    updateDocumentTitle();
    updateUrlWarning();
    setInputMode();
    return;
  }
  try {
    const flags = new URLSearchParams(location.search).get("i") || "";
    ignoreOptions = flagsToNormOpts(flags);
    ignoreTrailingCheckbox.checked = ignoreOptions.trailing;
    ignoreAmountCheckbox.checked = ignoreOptions.amount;
    ignoreAllCheckbox.checked = ignoreOptions.all;
    ignoreQuotesCheckbox.checked = ignoreOptions.quotes;
    ignoreTrailingCheckbox.disabled = ignoreOptions.all;
    ignoreAmountCheckbox.disabled = ignoreOptions.all;
    normalizeBtn.classList.toggle("has-active", hasActiveNormalization());
    const { a, b, n } = JSON.parse(await decompress(fromBase64Url(hash)));
    diffName = n || "";
    diffNameInput.value = diffName;
    updateDocumentTitle();
    originalInput.value = a;
    modifiedInput.value = b;
    updateCompareBtn();
    setComputingState(true);
    currentDiff = await runDiffWorker(a, b, ignoreOptions);
    setComputingState(false);
    setViewerMode();
    rerender();
    updateStats();
    updateUrlWarning();
  } catch (e) {
    console.error("Failed to load diff from URL:", e);
    setComputingState(false);
  }
}

function updateUrlWarning() {
  const len = location.href.length;
  if (len > URL_WARN_THRESHOLD) {
    const kb = (len / 1024).toFixed(1);
    urlWarning.textContent = `URL is ${len.toLocaleString()} chars (${kb} KB)`;
  } else {
    urlWarning.textContent = "";
  }
}

function setInputMode() {
  document.body.classList.remove("viewer");
  if (currentDiff) {
    document.body.classList.add("editing");
  } else {
    document.body.classList.remove("editing");
  }
  window.scrollTo(0, 0);
}

function flagsToNormOpts(str) {
  return {
    trailing: str.includes("t"),
    amount: str.includes("a"),
    all: str.includes("w"),
    quotes: str.includes("q"),
  };
}

async function decompress(bytes) {
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return await new Response(stream).text();
}

function fromBase64Url(str) {
  return Uint8Array.fromBase64(str, { alphabet: "base64url" });
}

function updateCompareBtn() {
  const allowed = canCompare() && !isComputing;
  compareBtn.disabled = !allowed;
  if (allowed) {
    compareBtn.removeAttribute("aria-disabled");
    compareBtn.title = "";
  } else if (!canCompare()) {
    compareBtn.setAttribute("aria-disabled", "true");
    compareBtn.title = "Enter text to compare";
  }
}

function canCompare() {
  return originalInput.value.length > 0 || modifiedInput.value.length > 0;
}

function setComputingState(computing) {
  isComputing = computing;
  if (computing) {
    compareBtn.setAttribute("aria-busy", "true");
    compareBtn.disabled = true;
    compareBtn.textContent = "Comparing…";
  } else {
    compareBtn.removeAttribute("aria-busy");
    compareBtn.textContent = "Compare";
    updateCompareBtn();
  }
}

function runDiffWorker(original, modified, options) {
  return new Promise((resolve, reject) => {
    const handler = (event) => {
      diffWorker.removeEventListener("message", handler);
      if (event.data.status === "ok") resolve(event.data.result);
      else reject(new Error(event.data.error));
    };
    diffWorker.addEventListener("message", handler);
    diffWorker.postMessage({ action: "diff", original, modified, options });
  });
}

function setViewerMode() {
  document.body.classList.remove("editing");
  document.body.classList.add("viewer");
  diffView.scrollTop = 0;
}

function rerender() {
  if (!currentDiff) return;
  currentView === "sbs"
    ? renderSideBySide(currentDiff)
    : renderUnified(currentDiff);
  changeRows = getChangeRows();
  currentChangeIndex = -1;
  requestAnimationFrame(renderMinimap);
}

function renderSideBySide(diff) {
  const segments = groupDiff(diff);
  segmentIdCounter = 0;
  let hunkId = 0;
  let needsHunkMarker = true;
  let lnLeft = 0,
    lnRight = 0;
  const rows = [];
  function normTitle(reasons) {
    if (!reasons) return "";
    const labels = reasons.map((r) =>
      r === "whitespace" ? "Whitespace" : "Quote type",
    );
    return ` title="${labels.join(" and ")} differs"`;
  }
  function addLine(d, isChange = false) {
    const hunkAttr =
      isChange && needsHunkMarker
        ? ((needsHunkMarker = false), ` data-change-group="${hunkId++}"`)
        : "";
    const norm = d.normalized
      ? ` class="normalized"${normTitle(d.normReason)}`
      : "";
    if (d.type === "same") {
      lnLeft++;
      lnRight++;
      rows.push(
        `<tr${norm}><td class="ln left-ln">${lnLeft}</td><td class="code left-code">${escapeHtml(d.left)}</td><td class="ln right-ln">${lnRight}</td><td class="code right-code">${escapeHtml(d.right)}</td></tr>`,
      );
    } else if (d.type === "change") {
      lnLeft++;
      lnRight++;
      rows.push(
        `<tr${hunkAttr}><td class="ln left-ln">${lnLeft}</td><td class="code left-code del">${d.leftHtml}</td><td class="ln right-ln">${lnRight}</td><td class="code right-code add">${d.rightHtml}</td></tr>`,
      );
    } else if (d.type === "del") {
      lnLeft++;
      rows.push(
        `<tr${hunkAttr}><td class="ln left-ln">${lnLeft}</td><td class="code left-code del">${escapeHtml(d.left)}</td><td class="ln right-ln"></td><td class="code right-code empty"></td></tr>`,
      );
    } else {
      lnRight++;
      rows.push(
        `<tr${hunkAttr}><td class="ln left-ln"></td><td class="code left-code empty"></td><td class="ln right-ln">${lnRight}</td><td class="code right-code add">${escapeHtml(d.right)}</td></tr>`,
      );
    }
  }
  for (const seg of segments) {
    if (seg.type === "context") {
      for (const d of seg.lines) addLine(d, false);
    } else if (seg.type === "changes") {
      needsHunkMarker = true;
      for (const d of seg.lines) addLine(d, true);
    } else if (seg.type === "collapsed") {
      needsHunkMarker = true;
      const id = segmentIdCounter++;
      const isExpanded = expandedIds.has(id);
      const startL = lnLeft + 1,
        startR = lnRight + 1;
      const preview = truncate(seg.lines[0]?.left?.trim(), 40);
      rows.push(
        `<tr class="collapsed-row${isExpanded ? " hidden" : ""}" data-collapse-id="${id}" title="Expand (Shift: all)"><td class="ln left-ln">${EXPAND_ICON}</td><td class="code left-code"><span class="hunk-header">@@ -${startL},${seg.count} @@</span> <span class="hunk-context">${preview}</span></td><td class="ln right-ln">${EXPAND_ICON}</td><td class="code right-code"><span class="hunk-header">@@ +${startR},${seg.count} @@</span></td></tr>`,
      );
      const hiddenClass = isExpanded ? "" : " hidden";
      const firstLine = seg.lines[0];
      lnLeft++;
      lnRight++;
      rows.push(
        `<tr class="expand-boundary expand-top${hiddenClass}" data-collapse-id="${id}" title="Collapse (Shift: all)"><td class="ln left-ln">${COLLAPSE_DOWN_ICON}</td><td class="code left-code">${escapeHtml(firstLine.left)}</td><td class="ln right-ln">${COLLAPSE_DOWN_ICON}</td><td class="code right-code">${escapeHtml(firstLine.right)}</td></tr>`,
      );
      for (let i = 1; i < seg.lines.length - 1; i++) {
        const d = seg.lines[i];
        lnLeft++;
        lnRight++;
        rows.push(
          `<tr class="expanded-content${hiddenClass}" data-collapse-id="${id}"><td class="ln left-ln">${lnLeft}</td><td class="code left-code">${escapeHtml(d.left)}</td><td class="ln right-ln">${lnRight}</td><td class="code right-code">${escapeHtml(d.right)}</td></tr>`,
        );
      }
      if (seg.lines.length > 1) {
        const lastLine = seg.lines[seg.lines.length - 1];
        lnLeft++;
        lnRight++;
        rows.push(
          `<tr class="expand-boundary expand-bottom${hiddenClass}" data-collapse-id="${id}" title="Collapse (Shift: all)"><td class="ln left-ln">${COLLAPSE_UP_ICON}</td><td class="code left-code">${escapeHtml(lastLine.left)}</td><td class="ln right-ln">${COLLAPSE_UP_ICON}</td><td class="code right-code">${escapeHtml(lastLine.right)}</td></tr>`,
        );
      }
    }
  }
  const noNlMsg =
    '<span class="no-newline-symbol">\\</span> No newline at end of file';
  if (!!diff.origNoNewline !== !!diff.modNoNewline) {
    const leftCell = diff.origNoNewline ? noNlMsg : "";
    const rightCell = diff.modNoNewline ? noNlMsg : "";
    rows.push(
      `<tr class="no-newline-row"><td class="ln left-ln"></td><td class="code left-code">${leftCell}</td><td class="ln right-ln"></td><td class="code right-code">${rightCell}</td></tr>`,
    );
  }
  diffView.className = "diff sbs";
  diffView.innerHTML = `<table class="sbs-table">${rows.join("")}</table>`;
}

function groupDiff(diff) {
  const hunks = Diff.buildHunks(diff);
  if (hunks.length === 0) {
    return [{ type: "context", lines: diff }];
  }
  const skipCollapse = diff.length <= NO_COLLAPSE_THRESHOLD;
  const segments = [];
  let cursor = 0;
  for (let h = 0; h < hunks.length; h++) {
    const hunk = hunks[h];
    if (cursor < hunk.start) {
      const count = hunk.start - cursor;
      const type =
        !skipCollapse && count >= MIN_COLLAPSE_LINES ? "collapsed" : "context";
      segments.push({
        type,
        lines: diff.slice(cursor, hunk.start),
        count,
        isFileStart: cursor === 0,
        isFileEnd: false,
      });
    }
    let i = hunk.start;
    while (i <= hunk.end) {
      if (diff[i].type === "same") {
        const runStart = i;
        while (i <= hunk.end && diff[i].type === "same") i++;
        segments.push({ type: "context", lines: diff.slice(runStart, i) });
      } else {
        const runStart = i;
        while (i <= hunk.end && diff[i].type !== "same") i++;
        segments.push({ type: "changes", lines: diff.slice(runStart, i) });
      }
    }
    cursor = hunk.end + 1;
  }
  if (cursor < diff.length) {
    const count = diff.length - cursor;
    const type =
      !skipCollapse && count >= MIN_COLLAPSE_LINES ? "collapsed" : "context";
    segments.push({
      type,
      lines: diff.slice(cursor),
      count,
      isFileStart: false,
      isFileEnd: true,
    });
  }
  return segments;
}

const escapeHtml = Diff.escapeHtml;

function truncate(s, len = TRUNCATE_LEN) {
  if (!s || s.length <= len) return escapeHtml(s || "");
  return escapeHtml(s.slice(0, len)) + "…";
}

function renderUnified(diff) {
  const segments = groupDiff(diff);
  segmentIdCounter = 0;
  let hunkId = 0;
  let needsHunkMarker = true;
  let lnOld = 0,
    lnNew = 0;
  const rows = [];
  const marker = (char) => `<span class="marker">${char}</span>`;
  function normTitle(reasons) {
    if (!reasons) return "";
    const labels = reasons.map((r) =>
      r === "whitespace" ? "Whitespace" : "Quote type",
    );
    return ` title="${labels.join(" and ")} differs"`;
  }
  function addLine(d, isChange = false) {
    const hunkAttr =
      isChange && needsHunkMarker
        ? ((needsHunkMarker = false), ` data-change-group="${hunkId++}"`)
        : "";
    const norm = d.normalized
      ? ` class="normalized"${normTitle(d.normReason)}`
      : "";
    if (d.type === "same") {
      lnOld++;
      lnNew++;
      rows.push(
        `<tr${norm}><td class="ln ln-old">${lnOld}</td><td class="ln ln-new">${lnNew}</td><td class="code">${marker(" ")}${escapeHtml(d.left)}</td></tr>`,
      );
    } else if (d.type === "change") {
      lnOld++;
      lnNew++;
      rows.push(
        `<tr${hunkAttr}><td class="ln ln-old">${lnOld}</td><td class="ln ln-new"></td><td class="code del">${marker("-")}${d.leftHtml}</td></tr>`,
      );
      rows.push(
        `<tr><td class="ln ln-old"></td><td class="ln ln-new">${lnNew}</td><td class="code add">${marker("+")}${d.rightHtml}</td></tr>`,
      );
    } else if (d.type === "del") {
      lnOld++;
      rows.push(
        `<tr${hunkAttr}><td class="ln ln-old">${lnOld}</td><td class="ln ln-new"></td><td class="code del">${marker("-")}${escapeHtml(d.left)}</td></tr>`,
      );
    } else {
      lnNew++;
      rows.push(
        `<tr${hunkAttr}><td class="ln ln-old"></td><td class="ln ln-new">${lnNew}</td><td class="code add">${marker("+")}${escapeHtml(d.right)}</td></tr>`,
      );
    }
  }
  for (const seg of segments) {
    if (seg.type === "context") {
      for (const d of seg.lines) addLine(d, false);
    } else if (seg.type === "changes") {
      needsHunkMarker = true;
      for (const d of seg.lines) addLine(d, true);
    } else if (seg.type === "collapsed") {
      needsHunkMarker = true;
      const id = segmentIdCounter++;
      const isExpanded = expandedIds.has(id);
      const startOld = lnOld + 1,
        startNew = lnNew + 1;
      const hunk = `@@ -${startOld},${seg.count} +${startNew},${seg.count} @@`;
      const preview = truncate(seg.lines[0]?.left?.trim(), 40);
      const content = `${EXPAND_ICON}<span class="hunk-header">${hunk}</span> <span class="hunk-context">${preview}</span>`;
      rows.push(
        `<tr class="collapsed-row${isExpanded ? " hidden" : ""}" data-collapse-id="${id}" title="Expand (Shift: all)"><td class="ln"></td><td class="ln"></td><td class="code">${content}</td></tr>`,
      );
      const hiddenClass = isExpanded ? "" : " hidden";
      const firstLine = seg.lines[0];
      lnOld++;
      lnNew++;
      rows.push(
        `<tr class="expand-boundary expand-top${hiddenClass}" data-collapse-id="${id}" title="Collapse (Shift: all)"><td class="ln ln-old">${lnOld}</td><td class="ln ln-new">${lnNew}</td><td class="code"><span class="collapse-indicator">${COLLAPSE_DOWN_ICON}</span>${escapeHtml(firstLine.left)}</td></tr>`,
      );
      for (let i = 1; i < seg.lines.length - 1; i++) {
        const d = seg.lines[i];
        lnOld++;
        lnNew++;
        rows.push(
          `<tr class="expanded-content${hiddenClass}" data-collapse-id="${id}"><td class="ln ln-old">${lnOld}</td><td class="ln ln-new">${lnNew}</td><td class="code">${marker(" ")}${escapeHtml(d.left)}</td></tr>`,
        );
      }
      if (seg.lines.length > 1) {
        const lastLine = seg.lines[seg.lines.length - 1];
        lnOld++;
        lnNew++;
        rows.push(
          `<tr class="expand-boundary expand-bottom${hiddenClass}" data-collapse-id="${id}" title="Collapse (Shift: all)"><td class="ln ln-old">${lnOld}</td><td class="ln ln-new">${lnNew}</td><td class="code"><span class="collapse-indicator">${COLLAPSE_UP_ICON}</span>${escapeHtml(lastLine.left)}</td></tr>`,
        );
      }
    }
  }
  if (!!diff.origNoNewline !== !!diff.modNoNewline) {
    const which = diff.origNoNewline ? "original" : "modified";
    const noNlMsg = `<span class="no-newline-symbol">\\</span> No newline at end of file <span class="no-newline-which">(${which})</span>`;
    rows.push(
      `<tr class="no-newline-row"><td class="ln"></td><td class="ln"></td><td class="code">${noNlMsg}</td></tr>`,
    );
  }
  diffView.className = "diff unified";
  diffView.innerHTML = `<table>${rows.join("")}</table>`;
}

function getChangeRows() {
  return Array.from(diffView.querySelectorAll("[data-change-group]"));
}

function renderMinimap() {
  const groupStarts = getChangeRows();
  const scrollHeight = diffView.scrollHeight;
  const containerRect = diffView.getBoundingClientRect();
  if (
    groupStarts.length === 0 ||
    scrollHeight === 0 ||
    containerRect.height === 0
  ) {
    minimapCtx.clearRect(0, 0, minimapCanvas.width, minimapCanvas.height);
    updateViewportIndicator();
    return;
  }
  const dpr = window.devicePixelRatio || 1;
  const w = minimap.clientWidth;
  const h = minimap.clientHeight;
  minimapCanvas.width = w * dpr;
  minimapCanvas.height = h * dpr;
  minimapCtx.scale(dpr, dpr);
  const styles = getComputedStyle(document.documentElement);
  const delColor = styles.getPropertyValue("--stat-del").trim();
  const addColor = styles.getPropertyValue("--stat-add").trim();
  const isSbs = diffView.classList.contains("sbs");
  const padding = 0;
  const delX = padding;
  const delW = isSbs ? w / 2 - padding * 1.5 : w - padding * 2;
  const addX = isSbs ? w / 2 + padding * 0.5 : padding;
  const addW = isSbs ? w / 2 - padding * 1.5 : w - padding * 2;
  function getMarkerRect(firstRow, lastRow) {
    const startRect = firstRow.getBoundingClientRect();
    const endRect = lastRow.getBoundingClientRect();
    const rowTop = startRect.top - containerRect.top + diffView.scrollTop;
    const rowBottom = endRect.bottom - containerRect.top + diffView.scrollTop;
    const top = (rowTop / scrollHeight) * h;
    const height = Math.max(3, ((rowBottom - rowTop) / scrollHeight) * h);
    return { top, height };
  }
  minimapCtx.clearRect(0, 0, w, h);
  minimapCtx.globalAlpha = 0.85;
  for (const startRow of groupStarts) {
    const rows = getChangeGroupRows(startRow, isSbs);
    const delRows = [],
      addRows = [];
    for (const r of rows) {
      const cells = r.cells;
      if (isSbs) {
        if (cells[1]?.classList.contains("del")) delRows.push(r);
        if (cells[3]?.classList.contains("add")) addRows.push(r);
      } else {
        if (cells[2]?.classList.contains("del")) delRows.push(r);
        if (cells[2]?.classList.contains("add")) addRows.push(r);
      }
    }
    minimapCtx.fillStyle = delColor;
    for (const run of getContiguousRuns(delRows)) {
      const rect = getMarkerRect(run[0], run[run.length - 1]);
      minimapCtx.fillRect(delX, rect.top, delW, rect.height);
    }
    minimapCtx.fillStyle = addColor;
    for (const run of getContiguousRuns(addRows)) {
      const rect = getMarkerRect(run[0], run[run.length - 1]);
      minimapCtx.fillRect(addX, rect.top, addW, rect.height);
    }
  }
  minimapCtx.globalAlpha = 1;
  updateViewportIndicator();
}

function updateViewportIndicator() {
  const scrollHeight = diffView.scrollHeight;
  if (scrollHeight === 0) return;
  minimapViewport.style.top = (diffView.scrollTop / scrollHeight) * 100 + "%";
  minimapViewport.style.height =
    (diffView.clientHeight / scrollHeight) * 100 + "%";
}

function getChangeGroupRows(startRow, isSbs) {
  const rows = [startRow];
  let sibling = startRow.nextElementSibling;
  while (sibling && !sibling.hasAttribute("data-change-group")) {
    const cells = sibling.cells;
    const hasChange = isSbs
      ? cells[1]?.classList.contains("del") ||
        cells[3]?.classList.contains("add")
      : cells[2]?.classList.contains("del") ||
        cells[2]?.classList.contains("add");
    if (hasChange) rows.push(sibling);
    sibling = sibling.nextElementSibling;
  }
  return rows;
}

function getContiguousRuns(rows) {
  if (rows.length === 0) return [];
  const runs = [[rows[0]]];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i - 1].nextElementSibling === rows[i])
      runs[runs.length - 1].push(rows[i]);
    else runs.push([rows[i]]);
  }
  return runs;
}

function updateStats() {
  if (!currentDiff) return;
  let adds = 0,
    dels = 0,
    changes = 0;
  for (const d of currentDiff) {
    if (d.type === "add") adds++;
    else if (d.type === "del") dels++;
    else if (d.type === "change") changes++;
  }
  const totalChanges = adds + dels + changes;
  const eofDiffer =
    (currentDiff.origNoNewline || false) !==
    (currentDiff.modNoNewline || false);
  const isIdentical =
    totalChanges === 0 && !eofDiffer && currentDiff.length > 0;
  const leftLines = originalInput.value.split("\n").length;
  const rightLines = modifiedInput.value.split("\n").length;
  if (isIdentical || currentDiff.length === 0) {
    downloadPatchBtn.disabled = true;
    downloadPatchBtn.setAttribute("aria-disabled", "true");
    downloadPatchBtn.title = "Files are identical, no patch to generate.";
  } else {
    downloadPatchBtn.disabled = false;
    downloadPatchBtn.removeAttribute("aria-disabled");
    downloadPatchBtn.title = "Download .patch file";
  }
  if (isIdentical) {
    const rawDiffer = originalInput.value !== modifiedInput.value;
    if (rawDiffer && hasActiveNormalization()) {
      const reasons = [];
      if (ignoreOptions.all) reasons.push("whitespace");
      else if (ignoreOptions.amount) reasons.push("extra spaces");
      else if (ignoreOptions.trailing) reasons.push("trailing whitespace");
      if (ignoreOptions.quotes) reasons.push("quote types");
      const reasonText = reasons.join(" and ");
      changeSummary.innerHTML = `<div class="identical-msg">✔ The two texts are identical <span class="normalized-hint">(ignoring ${reasonText})</span></div>`;
    } else {
      changeSummary.innerHTML = `<div class="identical-msg">✔ The two texts are identical.</div>`;
    }
    changeSummary.classList.add("visible");
    changeSummarySplit.classList.remove("visible");
  } else if (totalChanges === 0 && eofDiffer) {
    const eofAction = currentDiff.modNoNewline ? "removed" : "added";
    changeSummary.innerHTML = `<div class="identical-msg eof-warning">✔ The two texts are identical, except the End-of-File newline was ${eofAction}.</div>`;
    changeSummary.classList.add("visible");
    changeSummarySplit.classList.remove("visible");
  } else {
    const leftParts = [];
    const rightParts = [];
    const linesFull = (n) =>
      `<span class="lines desktop-only"><span class="separator">•</span>${n} lines</span>`;
    const linesShort = (n) => `<span class="lines mobile-only"> · ${n}L</span>`;
    leftParts.push(
      `<span class="pill del"><span class="label">−${dels + changes}<span class="desktop-only"> removed</span></span>${linesFull(leftLines)}${linesShort(leftLines)}</span>`,
    );
    rightParts.push(
      `<span class="pill add"><span class="label">+${adds + changes}<span class="desktop-only"> added</span></span>${linesFull(rightLines)}${linesShort(rightLines)}</span>`,
    );
    leftPills.innerHTML = leftParts.join("");
    rightPills.innerHTML = rightParts.join("");
    updateStatsVisibility(true);
  }
}

function updateStatsVisibility(hasChanges) {
  const isIdentical = currentDiff && currentDiff.length > 0 && !hasChanges;
  if (isIdentical) {
    changeSummary.classList.add("visible");
    changeSummarySplit.classList.remove("visible");
    return;
  }
  if (!hasChanges) {
    changeSummary.classList.remove("visible");
    changeSummarySplit.classList.remove("visible");
    return;
  }
  changeSummary.classList.remove("visible");
  changeSummarySplit.classList.add("visible");
}

async function computeDiff() {
  if (isComputing) return;
  const a = originalInput.value,
    b = modifiedInput.value;
  setComputingState(true);
  try {
    currentDiff = await runDiffWorker(a, b, ignoreOptions);
  } catch (e) {
    console.error("Diff failed:", e);
    setComputingState(false);
    return;
  }
  setComputingState(false);
  setViewerMode();
  rerender();
  updateStats();
  const data = JSON.stringify({ a, b, ...(diffName && { n: diffName }) });
  const encoded = toBase64Url(await compress(data));
  const flags = ignoreOptionsToFlags(ignoreOptions);
  const query = flags ? `?i=${flags}` : "";
  const newUrl = query + "#" + encoded;
  if (newUrl !== location.search + location.hash)
    history.pushState(null, "", newUrl);
  updateUrlWarning();
}

function toBase64Url(bytes) {
  return bytes.toBase64({ alphabet: "base64url", omitPadding: true });
}

async function compress(str) {
  const stream = new Blob([str])
    .stream()
    .pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function ignoreOptionsToFlags(opts) {
  let s = "";
  if (opts.trailing) s += "t";
  if (opts.amount) s += "a";
  if (opts.all) s += "w";
  if (opts.quotes) s += "q";
  return s;
}

function goToChange(delta) {
  if (changeRows.length === 0) return;
  currentChangeIndex = Math.max(
    0,
    Math.min(changeRows.length - 1, currentChangeIndex + delta),
  );
  changeRows[currentChangeIndex].scrollIntoView({
    behavior: "smooth",
    block: "center",
  });
}

function setupDragDrop(textarea) {
  textarea.addEventListener("dragover", (e) => {
    e.preventDefault();
    textarea.classList.add("dragover");
  });
  textarea.addEventListener("dragleave", () => {
    textarea.classList.remove("dragover");
  });
  textarea.addEventListener("drop", (e) => {
    e.preventDefault();
    textarea.classList.remove("dragover");
    const file = e.dataTransfer.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        textarea.value = reader.result;
        updateCompareBtn();
      };
      reader.readAsText(file);
    }
  });
}

async function copyLink() {
  await navigator.clipboard.writeText(location.href);
  const originalHtml = copyLinkBtn.innerHTML;
  copyLinkBtn.innerHTML = CHECK_ICON + '<span class="btn-label">Copied!</span>';
  setTimeout(() => {
    copyLinkBtn.innerHTML = originalHtml;
  }, COPIED_TEXT_SHOWN_MS);
}

function togglePatchDropdown() {
  closeNormalizeDropdown();
  toggleDropdown(downloadPatchBtn, patchDropdown, () => {
    patchFilenameInput.focus();
    patchFilenameInput.select();
  });
}

function closeNormalizeDropdown() {
  normalizeDropdown.classList.remove("visible");
  normalizeBtn.setAttribute("aria-expanded", "false");
}

function toggleDropdown($btn, $dropdown, onOpen) {
  const isVisible = $dropdown.classList.toggle("visible");
  $btn.setAttribute("aria-expanded", isVisible);
  if (isVisible && onOpen) onOpen();
}

function confirmPatchDownload() {
  const filename = patchFilenameInput.value.trim();
  if (!filename) return;
  const patch = Diff.createPatch(currentDiff, filename);
  if (!patch) return;
  const blob = new Blob([patch], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.split("/").pop() + ".patch";
  a.click();
  URL.revokeObjectURL(url);
  closePatchDropdown();
}

function closePatchDropdown() {
  patchDropdown.classList.remove("visible");
  downloadPatchBtn.setAttribute("aria-expanded", "false");
}

function updatePatchConfirmBtn() {
  const hasFilename = patchFilenameInput.value.trim().length > 0;
  patchConfirmBtn.disabled = !hasFilename;
  if (hasFilename) {
    patchConfirmBtn.removeAttribute("aria-disabled");
    patchConfirmBtn.title = "";
  } else {
    patchConfirmBtn.setAttribute("aria-disabled", "true");
    patchConfirmBtn.title = "Enter a file path first";
  }
}

function toggleNormalizeDropdown() {
  closePatchDropdown();
  toggleDropdown(normalizeBtn, normalizeDropdown);
}

async function updateNormOpts() {
  ignoreOptions.trailing = ignoreTrailingCheckbox.checked;
  ignoreOptions.amount = ignoreAmountCheckbox.checked;
  ignoreOptions.all = ignoreAllCheckbox.checked;
  ignoreOptions.quotes = ignoreQuotesCheckbox.checked;
  ignoreTrailingCheckbox.disabled = ignoreOptions.all;
  ignoreAmountCheckbox.disabled = ignoreOptions.all;
  normalizeBtn.classList.toggle("has-active", hasActiveNormalization());
  saveSettings();
  if (currentDiff && !isComputing) {
    setComputingState(true);
    try {
      currentDiff = await runDiffWorker(
        originalInput.value,
        modifiedInput.value,
        ignoreOptions,
      );
    } catch (e) {
      console.error("Diff failed:", e);
      setComputingState(false);
      return;
    }
    setComputingState(false);
    rerender();
    updateStats();
    const flags = ignoreOptionsToFlags(ignoreOptions);
    const query = flags ? `?i=${flags}` : "";
    history.replaceState(null, "", location.pathname + query + location.hash);
    updateUrlWarning();
  }
}

function saveSettings() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ view: currentView, ignore: ignoreOptions }),
    );
  } catch (e) {
    /* ignore */
  }
}

const toggleView = () => setView(currentView === "unified" ? "sbs" : "unified");

function setView(view) {
  currentView = view;
  unifiedBtn.classList.toggle("active", view === "unified");
  sideBySideBtn.classList.toggle("active", view === "sbs");
  unifiedBtn.setAttribute("aria-pressed", view === "unified");
  sideBySideBtn.setAttribute("aria-pressed", view === "sbs");
  saveSettings();
  rerender();
  if (currentDiff) {
    let totalChanges = 0;
    for (const d of currentDiff) {
      if (d.type !== "same") totalChanges++;
    }
    updateStatsVisibility(totalChanges > 0);
  }
}

async function copySideText(side) {
  const text = side === "left" ? originalInput.value : modifiedInput.value;
  const btn = side === "left" ? copyOriginalBtn : copyModifiedBtn;
  await navigator.clipboard.writeText(text);
  btn.innerHTML = CHECK_ICON + '<span class="btn-label">Copied!</span>';
  setTimeout(() => {
    btn.innerHTML = COPY_ICON + '<span class="btn-label">Copy</span>';
  }, COPIED_TEXT_SHOWN_MS);
}

function expandAll() {
  for (let i = 0; i < segmentIdCounter; i++) expandedIds.add(i);
  for (const row of diffView.querySelectorAll(".collapsed-row"))
    row.classList.add("hidden");
  for (const row of diffView.querySelectorAll(
    ".expand-boundary, .expanded-content",
  ))
    row.classList.remove("hidden");
  requestAnimationFrame(renderMinimap);
}

function collapseAll() {
  expandedIds.clear();
  for (const row of diffView.querySelectorAll(".collapsed-row"))
    row.classList.remove("hidden");
  for (const row of diffView.querySelectorAll(
    ".expand-boundary, .expanded-content",
  ))
    row.classList.add("hidden");
  requestAnimationFrame(renderMinimap);
}

function toggleExpanded(id) {
  const isExpanding = !expandedIds.has(id);
  if (isExpanding) expandedIds.add(id);
  else expandedIds.delete(id);
  const rows = diffView.querySelectorAll(`[data-collapse-id="${id}"]`);
  for (const row of rows) {
    const isCollapsedRow = row.classList.contains("collapsed-row");
    row.classList.toggle("hidden", isExpanding === isCollapsedRow);
  }
  requestAnimationFrame(renderMinimap);
}

function scrollToBarPosition(clientY, center = false) {
  const rect = minimap.getBoundingClientRect();
  const clickY = (clientY - rect.top - minimapGrabOffset) / rect.height;
  let scrollTop = clickY * diffView.scrollHeight;
  if (center) scrollTop -= diffView.clientHeight / 2;
  diffView.scrollTop = scrollTop;
}

// Event listeners.
window.addEventListener("popstate", loadFromUrl);
window.addEventListener("resize", () => {
  if (currentDiff) renderMinimap();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    if (canCompare()) computeDiff();
  }
  if (!document.body.classList.contains("viewer")) return;
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
  if (e.key === "j" || e.key === "n") goToChange(1);
  if (e.key === "k" || e.key === "p") goToChange(-1);
  if (e.key === "e") setInputMode();
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".dropdown-container")) {
    closePatchDropdown();
    closeNormalizeDropdown();
  }
});
document.addEventListener("mousemove", (e) => {
  if (isDraggingMinimap) scrollToBarPosition(e.clientY);
});
document.addEventListener("mouseup", () => {
  isDraggingMinimap = false;
  minimap.classList.remove("dragging");
});
document.addEventListener(
  "touchmove",
  (e) => {
    if (isDraggingMinimap) scrollToBarPosition(e.touches[0].clientY);
  },
  { passive: true },
);
document.addEventListener("touchend", () => {
  isDraggingMinimap = false;
  minimap.classList.remove("dragging");
});
compareBtn.addEventListener("click", computeDiff);
copyLinkBtn.addEventListener("click", copyLink);
downloadPatchBtn.addEventListener("click", togglePatchDropdown);
patchConfirmBtn.addEventListener("click", confirmPatchDownload);
patchFilenameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") confirmPatchDownload();
  if (e.key === "Escape") closePatchDropdown();
});
patchFilenameInput.addEventListener("input", updatePatchConfirmBtn);
originalInput.addEventListener("input", updateCompareBtn);
modifiedInput.addEventListener("input", updateCompareBtn);
normalizeBtn.addEventListener("click", toggleNormalizeDropdown);
ignoreTrailingCheckbox.addEventListener("change", updateNormOpts);
ignoreAmountCheckbox.addEventListener("change", updateNormOpts);
ignoreAllCheckbox.addEventListener("change", updateNormOpts);
ignoreQuotesCheckbox.addEventListener("change", updateNormOpts);
clearOriginalBtn.addEventListener("click", () => {
  originalInput.value = "";
  updateCompareBtn();
  originalInput.focus();
});
clearModifiedBtn.addEventListener("click", () => {
  modifiedInput.value = "";
  updateCompareBtn();
  modifiedInput.focus();
});
editBtn.addEventListener("click", setInputMode);
unifiedBtn.addEventListener("click", toggleView);
sideBySideBtn.addEventListener("click", toggleView);
copyOriginalBtn.addEventListener("click", () => copySideText("left"));
copyModifiedBtn.addEventListener("click", () => copySideText("right"));
diffView.addEventListener("mousedown", (e) => {
  if (!diffView.querySelector(".sbs-table")) return;
  const cell = e.target.closest("td");
  if (!cell) return;
  diffView.classList.remove("select-left", "select-right");
  if (
    cell.classList.contains("left-code") ||
    cell.classList.contains("left-ln")
  ) {
    diffView.classList.add("select-left");
  } else if (
    cell.classList.contains("right-code") ||
    cell.classList.contains("right-ln")
  ) {
    diffView.classList.add("select-right");
  }
});
diffView.addEventListener("click", (e) => {
  const row = e.target.closest(".collapsed-row, .expand-boundary");
  if (row && row.dataset.collapseId) {
    if (e.shiftKey) {
      row.classList.contains("collapsed-row") ? expandAll() : collapseAll();
    } else {
      toggleExpanded(parseInt(row.dataset.collapseId, 10));
    }
  }
});
diffView.addEventListener("scroll", updateViewportIndicator, { passive: true });
diffView.addEventListener("copy", (e) => {
  const sel = window.getSelection();
  if (sel.isCollapsed) return;
  const anchor =
    sel.anchorNode.nodeType === 3
      ? sel.anchorNode.parentElement
      : sel.anchorNode;
  const startCell = anchor.closest(".code");
  if (!startCell) return;
  const isLeft = startCell.classList.contains("left-code");
  const isRight = startCell.classList.contains("right-code");
  const selector = isLeft ? ".left-code" : isRight ? ".right-code" : ".code";
  const fragment = sel.getRangeAt(0).cloneContents();
  const cells = fragment.querySelectorAll(selector);
  if (cells.length > 0) {
    const text = Array.from(cells)
      .filter(
        (c) => !c.classList.contains("empty") && !c.closest(".collapsed-row"),
      ) // Avoid copying empty rows (creates a ghost newline which isn't in the real text) and [un]collapsed @@ messages
      .map((c) => c.textContent)
      .join("\n");
    e.clipboardData.setData("text/plain", text);
    e.preventDefault();
  }
});
minimap.addEventListener("mousedown", (e) => {
  isDraggingMinimap = true;
  minimap.classList.add("dragging");
  if (e.target === minimapViewport) {
    minimapGrabOffset = e.clientY - minimapViewport.getBoundingClientRect().top;
  } else {
    minimapGrabOffset = 0;
    scrollToBarPosition(e.clientY, true);
    minimapGrabOffset = minimapViewport.getBoundingClientRect().height / 2;
  }
  e.preventDefault();
});
minimap.addEventListener(
  "touchstart",
  (e) => {
    isDraggingMinimap = true;
    minimap.classList.add("dragging");
    if (e.target === minimapViewport) {
      minimapGrabOffset =
        e.touches[0].clientY - minimapViewport.getBoundingClientRect().top;
    } else {
      minimapGrabOffset = 0;
      scrollToBarPosition(e.touches[0].clientY, true);
      minimapGrabOffset = minimapViewport.getBoundingClientRect().height / 2;
    }
    e.preventDefault();
  },
  { passive: false },
);
diffNameInput.addEventListener("input", () => {
  diffName = diffNameInput.value;
  updateDocumentTitle();
});
diffNameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    copyLinkBtn.click();
  }
});
diffNameInput.addEventListener("blur", async () => {
  if (!currentDiff) return;
  const a = originalInput.value,
    b = modifiedInput.value;
  const data = JSON.stringify({ a, b, ...(diffName && { n: diffName }) });
  const encoded = toBase64Url(await compress(data));
  const flags = ignoreOptionsToFlags(ignoreOptions);
  const query = flags ? `?i=${flags}` : "";
  const newUrl = query + "#" + encoded;
  if (newUrl !== location.search + location.hash)
    history.replaceState(null, "", newUrl);
  updateUrlWarning();
});
setupDragDrop(originalInput);
setupDragDrop(modifiedInput);

// Init.
applySettings();
updateCompareBtn();
updatePatchConfirmBtn();
loadFromUrl();
