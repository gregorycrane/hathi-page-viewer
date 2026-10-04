(function () {
  "use strict";

  let records = window.HATHI_RECORDS || [];
  const PAGE_SIZE = 100;
  const SHEET_QUERY = "https://docs.google.com/spreadsheets/d/14b6_shYOx9t-HBOiVRavhvMS9CBoonx-hrplI-h8BTU/gviz/tq?tqx=responseHandler:hathiSheetLoaded&gid=231332487";
  const state = { selected: 0, filter: "all", query: "", sequence: null, limit: PAGE_SIZE };

  const els = {
    list: document.querySelector("#record-list"),
    template: document.querySelector("#record-template"),
    resultCount: document.querySelector("#result-count"),
    datasetCount: document.querySelector("#dataset-count"),
    sourceStatus: document.querySelector("#source-status"),
    empty: document.querySelector("#empty-state"),
    search: document.querySelector("#search-input"),
    chips: Array.from(document.querySelectorAll(".filter-chip")),
    access: document.querySelector("#access-badge"),
    position: document.querySelector("#record-position"),
    title: document.querySelector("#record-title"),
    author: document.querySelector("#record-author"),
    apiLink: document.querySelector("#api-link"),
    hathiLink: document.querySelector("#hathi-link"),
    metadata: document.querySelector("#metadata-list"),
    measurements: document.querySelector("#measurement-list"),
    apiIndicator: document.querySelector("#api-indicator"),
    apiStatus: document.querySelector("#api-status"),
    apiDetail: document.querySelector("#api-detail"),
    refresh: document.querySelector("#refresh-api"),
    scanRange: document.querySelector("#scan-range"),
    scanSummary: document.querySelector("#scan-summary"),
    scanNumber: document.querySelector("#scan-number"),
    previousScan: document.querySelector("#previous-scan"),
    nextScan: document.querySelector("#next-scan"),
    scanLink: document.querySelector("#scan-link"),
    loadMore: document.querySelector("#load-more")
  };

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>'"]/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    }[char]));
  }

  function rightsLabel(rights) {
    if (rights === "pd") return "Public domain";
    if (rights === "pdus") return "Public domain \u2014 US";
    return "Rights unknown";
  }

  function apiURL(record) {
    return `https://catalog.hathitrust.org/api/volumes/full/htid/${encodeURIComponent(record.htid)}.json`;
  }

  function scanURL(record, sequence) {
    return `https://babel.hathitrust.org/cgi/pt?id=${encodeURIComponent(record.htid)}&seq=${sequence}`;
  }

  function languageLabel(language) {
    return ({ ell: "Greek", lat: "Latin", deu: "German", eng: "English", fra: "French", ita: "Italian", spa: "Spanish", dan: "Danish", rus: "Russian", nld: "Dutch", swe: "Swedish" })[language] || language;
  }

  function recordFromCells(columns, cells) {
    const source = Object.fromEntries(columns.map((column, index) => [column.label, cells[index]?.v ?? ""]));
    const numeric = value => Number(value) || 0;
    const book = String(source.book || "");
    return {
      book,
      htid: `hvd.${book.toLowerCase()}`,
      work: String(source.work || ""),
      language: String(source.lang || ""),
      pages: numeric(source.pp),
      mapScore: numeric(source.map),
      minPage: numeric(source.minp),
      maxPage: numeric(source.maxp),
      firstLine: numeric(source.line1),
      lines: numeric(source.nlines),
      wordLines: numeric(source.wlines),
      cover: numeric(source.cover),
      beginScan: numeric(source.begin),
      endScan: numeric(source.end),
      spanPages: numeric(source.spanp),
      density: numeric(source.density),
      workAuthor: String(source.work_author || ""),
      workTitle: String(source.work_title || ""),
      author: String(source.author || ""),
      title: String(source.title || ""),
      url: String(source.url || ""),
      rights: "unknown"
    };
  }

  function visibleRecords() {
    const needle = state.query.trim().toLocaleLowerCase();
    return records.filter(record => {
      const matchesFilter = state.filter === "all" || record.language === state.filter;
      const haystack = `${record.title} ${record.author} ${record.htid} ${record.work} ${record.workAuthor} ${record.workTitle} ${record.language}`.toLocaleLowerCase();
      return matchesFilter && (!needle || haystack.includes(needle));
    });
  }

  function renderList() {
    const matches = visibleRecords();
    const visible = matches.slice(0, state.limit);
    els.list.innerHTML = "";
    els.resultCount.textContent = matches.length.toLocaleString();
    els.empty.hidden = matches.length !== 0;
    els.loadMore.hidden = visible.length >= matches.length;
    els.loadMore.textContent = `Show more (${(matches.length - visible.length).toLocaleString()} remaining)`;

    visible.forEach(record => {
      const index = records.indexOf(record);
      const node = els.template.content.cloneNode(true);
      const button = node.querySelector(".record-row");
      button.dataset.index = index;
      button.classList.toggle("is-selected", index === state.selected);
      button.setAttribute("aria-current", index === state.selected ? "true" : "false");
      node.querySelector(".row-language").textContent = languageLabel(record.language);
      node.querySelector(".row-pages").textContent = `${record.pages.toLocaleString()} mapped pages`;
      node.querySelector(".row-title").textContent = record.title;
      node.querySelector(".row-author").textContent = record.author;
      node.querySelector(".row-id").textContent = record.htid;
      node.querySelector(".row-work-title").textContent = `${record.workAuthor} \u00b7 ${record.workTitle}`;
      els.list.appendChild(node);
    });
  }

  function metadataRow(label, value, asCode) {
    return `<div><dt>${escapeHTML(label)}</dt><dd>${asCode ? `<code>${escapeHTML(value)}</code>` : escapeHTML(value)}</dd></div>`;
  }

  function renderMetadata(record) {
    els.metadata.innerHTML = [
      metadataRow("HathiTrust ID", record.htid, true),
      metadataRow("CTS work", record.work, true),
      metadataRow("Canonical author", record.workAuthor),
      metadataRow("Canonical work", record.workTitle),
      metadataRow("Language", languageLabel(record.language)),
      metadataRow("Mapped pages", record.pages.toLocaleString()),
      metadataRow("Scan range", `${record.beginScan.toLocaleString()}\u2013${record.endScan.toLocaleString()}`),
      metadataRow("Source page range", `${record.minPage.toLocaleString()}\u2013${record.maxPage.toLocaleString()}`)
    ].join("");

    els.measurements.innerHTML = [
      metadataRow("Lines", record.lines.toLocaleString()),
      metadataRow("Word-bearing lines", record.wordLines.toLocaleString()),
      metadataRow("First line", record.firstLine.toLocaleString()),
      metadataRow("Map score", record.mapScore.toFixed(3)),
      metadataRow("Cover", record.cover.toFixed(3)),
      metadataRow("Scan span", record.spanPages.toLocaleString()),
      metadataRow("Density", record.density.toFixed(3))
    ].join("");
  }

  function setSequence(value) {
    const record = records[state.selected];
    const parsed = Number.parseInt(value, 10);
    state.sequence = Math.min(record.endScan, Math.max(record.beginScan, Number.isFinite(parsed) ? parsed : record.beginScan));
    els.scanNumber.value = state.sequence;
    els.scanLink.href = scanURL(record, state.sequence);
    els.previousScan.disabled = state.sequence <= record.beginScan;
    els.nextScan.disabled = state.sequence >= record.endScan;
  }

  function renderScanNavigator(record) {
    els.scanRange.textContent = `Scans ${record.beginScan.toLocaleString()}\u2013${record.endScan.toLocaleString()}`;
    els.scanSummary.textContent = `${record.pages.toLocaleString()} mapped pages for ${record.workAuthor}, ${record.workTitle}.`;
    els.scanNumber.min = record.beginScan;
    els.scanNumber.max = record.endScan;
    setSequence(record.beginScan);
  }

  async function refreshAPI(record) {
    const requestedID = record.htid;
    els.apiIndicator.className = "api-indicator is-loading";
    els.apiStatus.textContent = "Checking HathiTrust";
    els.apiDetail.textContent = "Matching the exact volume ID\u2026";
    try {
      const response = await fetch(apiURL(record));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (records[state.selected].htid !== requestedID) return;
      const item = (payload.items || []).find(candidate => candidate.htid === requestedID);
      if (!item) throw new Error("Exact volume was not returned");
      record.rights = item.rightsCode || record.rights;
      els.access.textContent = rightsLabel(record.rights);
      els.access.dataset.rights = record.rights;
      els.apiIndicator.className = "api-indicator";
      els.apiStatus.textContent = "HathiTrust confirmed";
      els.apiDetail.textContent = `${item.orig || "Unknown source"} \u00b7 ${payload.items.length} ${payload.items.length === 1 ? "copy" : "copies"}`;
      renderList();
    } catch (error) {
      if (records[state.selected].htid !== requestedID) return;
      els.apiIndicator.className = "api-indicator is-error";
      els.apiStatus.textContent = "Live check unavailable";
      els.apiDetail.textContent = error.message;
    }
  }

  function selectRecord(index) {
    state.selected = index;
    const record = records[index];
    els.title.textContent = record.title;
    els.author.textContent = record.author;
    els.position.textContent = `${index + 1} of ${records.length}`;
    els.access.textContent = rightsLabel(record.rights);
    els.access.dataset.rights = record.rights;
    els.apiLink.href = apiURL(record);
    els.hathiLink.href = record.url || scanURL(record, record.beginScan);
    renderMetadata(record);
    renderScanNavigator(record);
    renderList();
    refreshAPI(record);
    history.replaceState(null, "", `#${encodeURIComponent(`${record.htid}::${record.work}`)}`);
  }

  els.list.addEventListener("click", event => {
    const row = event.target.closest(".record-row");
    if (row) selectRecord(Number(row.dataset.index));
  });

  els.search.addEventListener("input", event => {
    state.query = event.target.value;
    state.limit = PAGE_SIZE;
    renderList();
  });

  els.chips.forEach(chip => chip.addEventListener("click", () => {
    state.filter = chip.dataset.filter;
    state.limit = PAGE_SIZE;
    els.chips.forEach(item => item.classList.toggle("is-active", item === chip));
    renderList();
  }));

  els.refresh.addEventListener("click", () => refreshAPI(records[state.selected]));
  els.scanNumber.addEventListener("change", event => setSequence(event.target.value));
  els.scanNumber.addEventListener("keydown", event => {
    if (event.key === "Enter") setSequence(event.target.value);
  });
  els.previousScan.addEventListener("click", () => setSequence(state.sequence - 1));
  els.nextScan.addEventListener("click", () => setSequence(state.sequence + 1));
  els.loadMore.addEventListener("click", () => {
    state.limit += PAGE_SIZE;
    renderList();
  });

  document.addEventListener("keydown", event => {
    if (event.key === "/" && document.activeElement !== els.search) {
      event.preventDefault();
      els.search.focus();
    }
  });

  const [initialID, initialWork] = decodeURIComponent(location.hash.slice(1)).split("::");
  const initialIndex = records.findIndex(record => record.htid === initialID && (!initialWork || record.work === initialWork));
  els.datasetCount.textContent = records.length.toLocaleString();
  selectRecord(initialIndex >= 0 ? initialIndex : 0);

  window.hathiSheetLoaded = payload => {
    if (payload?.status !== "ok" || !payload.table?.rows?.length) return;
    const selectedID = records[state.selected]?.htid;
    const selectedWork = records[state.selected]?.work;
    records = payload.table.rows.map(row => recordFromCells(payload.table.cols, row.c));
    state.limit = PAGE_SIZE;
    els.datasetCount.textContent = records.length.toLocaleString();
    els.sourceStatus.textContent = "Live Google Sheet";
    const liveIndex = records.findIndex(record => record.htid === selectedID && record.work === selectedWork);
    selectRecord(liveIndex >= 0 ? liveIndex : 0);
  };

  const liveScript = document.createElement("script");
  liveScript.src = SHEET_QUERY;
  liveScript.async = true;
  liveScript.onerror = () => {
    els.sourceStatus.textContent = "Uploaded snapshot";
    els.apiDetail.textContent = `Using uploaded snapshot \u00b7 ${records.length.toLocaleString()} records`;
  };
  document.head.appendChild(liveScript);
}());
