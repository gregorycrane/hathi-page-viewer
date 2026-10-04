(function () {
  "use strict";

  const records = window.HATHI_RECORDS || [];
  const state = { selected: 0, filter: "all", query: "", sequence: 1 };

  const els = {
    list: document.querySelector("#record-list"),
    template: document.querySelector("#record-template"),
    resultCount: document.querySelector("#result-count"),
    empty: document.querySelector("#empty-state"),
    search: document.querySelector("#search-input"),
    chips: Array.from(document.querySelectorAll(".filter-chip")),
    access: document.querySelector("#access-badge"),
    position: document.querySelector("#record-position"),
    title: document.querySelector("#record-title"),
    author: document.querySelector("#record-author"),
    apiLink: document.querySelector("#api-link"),
    hathiLink: document.querySelector("#hathi-link"),
    pageLink: document.querySelector("#page-link"),
    scanLabel: document.querySelector("#scan-label"),
    launchLink: document.querySelector("#page-launch-link"),
    pageNumber: document.querySelector("#page-number"),
    previous: document.querySelector("#previous-page"),
    next: document.querySelector("#next-page"),
    viewerNote: document.querySelector("#viewer-note"),
    metadata: document.querySelector("#metadata-list"),
    measurements: document.querySelector("#measurement-list"),
    apiIndicator: document.querySelector("#api-indicator"),
    apiStatus: document.querySelector("#api-status"),
    apiDetail: document.querySelector("#api-detail"),
    refresh: document.querySelector("#refresh-api")
  };

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>'"]/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    }[char]));
  }

  function rightsLabel(rights) {
    if (rights === "pd") return "Public domain";
    if (rights === "pdus") return "Public domain — US";
    return "Rights unknown";
  }

  function apiURL(record) {
    return `https://catalog.hathitrust.org/api/volumes/full/htid/${encodeURIComponent(record.htid)}.json`;
  }

  function handleURL(record, sequence, embedded) {
    const params = [`seq=${sequence}`];
    if (embedded) params.push("ui=embed");
    return `https://hdl.handle.net/2027/${encodeURIComponent(record.htid)}?urlappend=${encodeURIComponent(";" + params.join(";"))}`;
  }

  function visibleRecords() {
    const needle = state.query.trim().toLocaleLowerCase();
    return records.filter(record => {
      const matchesFilter = state.filter === "all" || record.rights === state.filter;
      const haystack = `${record.title} ${record.author} ${record.htid} ${record.classification} ${record.year}`.toLocaleLowerCase();
      return matchesFilter && (!needle || haystack.includes(needle));
    });
  }

  function renderList() {
    const visible = visibleRecords();
    els.list.innerHTML = "";
    els.resultCount.textContent = visible.length;
    els.empty.hidden = visible.length !== 0;

    visible.forEach(record => {
      const index = records.indexOf(record);
      const node = els.template.content.cloneNode(true);
      const button = node.querySelector(".record-row");
      button.dataset.index = index;
      button.classList.toggle("is-selected", index === state.selected);
      button.setAttribute("aria-current", index === state.selected ? "true" : "false");
      node.querySelector(".row-year").textContent = record.year2 ? `${record.year}–${record.year2}` : record.year;
      const rights = node.querySelector(".row-rights");
      rights.textContent = record.rights;
      rights.dataset.rights = record.rights;
      node.querySelector(".row-title").textContent = record.title;
      node.querySelector(".row-author").textContent = record.author;
      node.querySelector(".row-id").textContent = record.htid;
      node.querySelector(".row-classification").textContent = record.classification;
      els.list.appendChild(node);
    });
  }

  function metadataRow(label, value, asCode) {
    return `<div><dt>${escapeHTML(label)}</dt><dd>${asCode ? `<code>${escapeHTML(value)}</code>` : escapeHTML(value)}</dd></div>`;
  }

  function renderMetadata(record) {
    const dates = record.date2 ? `${record.date1}–${record.date2}` : record.date1;
    els.metadata.innerHTML = [
      metadataRow("HathiTrust ID", record.htid, true),
      metadataRow("Dataset row", record.originalRow),
      metadataRow("Classification", record.classification),
      metadataRow("Type", record.type),
      metadataRow("Date", dates),
      metadataRow("Languages", `${record.languageSource} source · ${record.languageGenerated} generated`)
    ].join("");

    els.measurements.innerHTML = [
      metadataRow("Lines", record.lc.toLocaleString()),
      metadataRow("Words", record.wc.toLocaleString()),
      metadataRow("Words / line", record.wordsPerLine.toFixed(2)),
      metadataRow("OCR score", `${record.ocrSource} source · ${record.ocrGenerated} generated`),
      metadataRow("Cover", record.cover.toFixed(3)),
      metadataRow("Overlap", record.overlap.toFixed(3)),
      metadataRow("Weighted overlap", record.wover.toFixed(3))
    ].join("");
  }

  function updateViewer() {
    const record = records[state.selected];
    state.sequence = Math.max(1, Number.parseInt(els.pageNumber.value, 10) || 1);
    els.pageNumber.value = state.sequence;
    els.previous.disabled = state.sequence <= 1;
    els.scanLabel.textContent = `Scan ${state.sequence.toLocaleString()}`;
    els.launchLink.href = handleURL(record, state.sequence, false);
    els.pageLink.href = handleURL(record, state.sequence, false);
    els.hathiLink.href = handleURL(record, state.sequence, false);
  }

  async function refreshAPI(record) {
    const requestedID = record.htid;
    els.apiIndicator.className = "api-indicator is-loading";
    els.apiStatus.textContent = "Checking HathiTrust";
    els.apiDetail.textContent = "Matching the exact volume ID…";
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
      els.apiDetail.textContent = `${item.orig || "Unknown source"} · ${payload.items.length} ${payload.items.length === 1 ? "copy" : "copies"}`;
      els.viewerNote.textContent = record.rights === "pdus"
        ? "This copy is marked pdus; full page access may be limited outside the United States."
        : "This copy is marked public domain. Page images are delivered by HathiTrust.";
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
    state.sequence = 1;
    els.pageNumber.value = 1;
    const record = records[index];
    els.title.textContent = record.title;
    els.author.textContent = record.author;
    els.position.textContent = `${index + 1} of ${records.length}`;
    els.access.textContent = rightsLabel(record.rights);
    els.access.dataset.rights = record.rights;
    els.apiLink.href = apiURL(record);
    els.viewerNote.textContent = "Page images are delivered by HathiTrust and remain subject to its access rules.";
    renderMetadata(record);
    renderList();
    updateViewer();
    refreshAPI(record);
    history.replaceState(null, "", `#${encodeURIComponent(record.htid)}`);
  }

  els.list.addEventListener("click", event => {
    const row = event.target.closest(".record-row");
    if (row) selectRecord(Number(row.dataset.index));
  });

  els.search.addEventListener("input", event => {
    state.query = event.target.value;
    renderList();
  });

  els.chips.forEach(chip => chip.addEventListener("click", () => {
    state.filter = chip.dataset.filter;
    els.chips.forEach(item => item.classList.toggle("is-active", item === chip));
    renderList();
  }));

  els.previous.addEventListener("click", () => {
    els.pageNumber.value = Math.max(1, state.sequence - 1);
    updateViewer();
  });
  els.next.addEventListener("click", () => {
    els.pageNumber.value = state.sequence + 1;
    updateViewer();
  });
  els.pageNumber.addEventListener("change", updateViewer);
  els.pageNumber.addEventListener("keydown", event => {
    if (event.key === "Enter") updateViewer();
  });
  els.refresh.addEventListener("click", () => refreshAPI(records[state.selected]));

  document.addEventListener("keydown", event => {
    if (event.key === "/" && document.activeElement !== els.search) {
      event.preventDefault();
      els.search.focus();
    }
  });

  const initialID = decodeURIComponent(location.hash.slice(1));
  const initialIndex = records.findIndex(record => record.htid === initialID);
  selectRecord(initialIndex >= 0 ? initialIndex : 0);
}());
