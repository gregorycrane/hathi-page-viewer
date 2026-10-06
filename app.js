(function () {
  "use strict";

  let records = window.HATHI_RECORDS || [];
  const hathiDates = window.HATHI_DATES || {};
  const hathiBiblio = window.HATHI_BIBLIO || {};
  const PAGE_SIZE = 100;
  const SHEET_QUERY = "https://docs.google.com/spreadsheets/d/14b6_shYOx9t-HBOiVRavhvMS9CBoonx-hrplI-h8BTU/gviz/tq?tqx=responseHandler:hathiSheetLoaded&gid=231332487";
  const state = { selected: 0, filter: "all", query: "", sort: "dataset", sequence: null, limit: PAGE_SIZE, view: "overview", authorLimit: "5", workLimit: "5", authorOrder: "mapped", workOrder: "mapped" };

  const els = {
    list: document.querySelector("#record-list"),
    template: document.querySelector("#record-template"),
    resultCount: document.querySelector("#result-count"),
    datasetCount: document.querySelector("#dataset-count"),
    sourceStatus: document.querySelector("#source-status"),
    empty: document.querySelector("#empty-state"),
    search: document.querySelector("#search-input"),
    sort: document.querySelector("#sort-select"),
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
    ,dashboard: document.querySelector("#dashboard")
    ,browseView: document.querySelector("#browse-view")
    ,overviewTab: document.querySelector("#overview-tab")
    ,browseTab: document.querySelector("#browse-tab")
    ,browseRecords: document.querySelector("#browse-records")
    ,statRecords: document.querySelector("#stat-records")
    ,statVolumes: document.querySelector("#stat-volumes")
    ,statPages: document.querySelector("#stat-pages")
    ,statWorks: document.querySelector("#stat-works")
    ,languageTotal: document.querySelector("#language-total")
    ,languageChart: document.querySelector("#language-chart")
    ,dateCoverage: document.querySelector("#date-coverage")
    ,dateRange: document.querySelector("#date-range")
    ,dateMedian: document.querySelector("#date-median")
    ,dateChart: document.querySelector("#date-chart")
    ,authorRanking: document.querySelector("#author-ranking")
    ,workRanking: document.querySelector("#work-ranking")
    ,authorLimit: document.querySelector("#author-limit")
    ,workLimit: document.querySelector("#work-limit")
    ,authorOrder: document.querySelector("#author-order")
    ,workOrder: document.querySelector("#work-order")
    ,authorSummary: document.querySelector("#author-summary")
    ,workSummary: document.querySelector("#work-summary")
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

  function bibliography(record) {
    return hathiBiblio[record.htid] || {};
  }

  function publicationLabel(biblio) {
    return [biblio.place, biblio.publisher].filter(Boolean).join(" ") || "Not listed";
  }

  function languageLabel(language) {
    return ({ ell: "Greek", lat: "Latin", deu: "German", eng: "English", fra: "French", ita: "Italian", spa: "Spanish", dan: "Danish", rus: "Russian", nld: "Dutch", swe: "Swedish" })[language] || language;
  }

  function countBy(values, key) {
    return [...values.reduce((counts, value) => {
      const label = key(value);
      counts.set(label, (counts.get(label) || 0) + 1);
      return counts;
    }, new Map())].sort((left, right) => right[1] - left[1]);
  }

  function publicationYears(htid) {
    return (hathiDates[htid] || []).flatMap(value => String(value).match(/\b(1[5-9]\d{2}|20\d{2})\b/g) || []).map(Number).filter(year => year >= 1500 && year <= 2026);
  }

  function showView(view) {
    state.view = view;
    const overview = view === "overview";
    els.dashboard.hidden = !overview;
    els.browseView.hidden = overview;
    els.overviewTab.classList.toggle("is-active", overview);
    els.browseTab.classList.toggle("is-active", !overview);
  }

  function setLanguageFilter(language, revealBrowse) {
    state.filter = language;
    state.limit = PAGE_SIZE;
    els.chips.forEach(chip => chip.classList.toggle("is-active", chip.dataset.filter === language));
    renderList();
    if (revealBrowse) showView("browse");
  }

  function runSearch(query) {
    state.query = query;
    state.filter = "all";
    state.limit = PAGE_SIZE;
    els.search.value = query;
    els.chips.forEach(chip => chip.classList.toggle("is-active", chip.dataset.filter === "all"));
    renderList();
    showView("browse");
  }

  function renderRanking(target, entries, formatter, requestedLimit, order, summary, noun) {
    const showAll = requestedLimit === "all";
    const limit = showAll ? entries.length : Number(requestedLimit);
    target.closest(".ranking-card").classList.toggle("is-expanded", showAll);
    const orderLabel = order === "alpha" ? "alphabetically" : "by mapped records";
    summary.textContent = showAll
      ? `All ${entries.length.toLocaleString()} ${noun}, ${orderLabel}`
      : `${order === "alpha" ? "First" : "Top"} ${limit.toLocaleString()} of ${entries.length.toLocaleString()} ${noun}, ${orderLabel}`;
    target.innerHTML = entries.slice(0, limit).map(([label, count]) => {
      const display = formatter ? formatter(label) : label;
      return `<li><button type="button" data-query="${escapeHTML(display.query)}"><span>${escapeHTML(display.label)}</span><strong>${count.toLocaleString()}</strong></button></li>`;
    }).join("");
  }

  function renderRankings() {
    const authorEntries = countBy(records, record => record.workAuthor);
    const workEntries = countBy(records, record => `${record.workAuthor}\t${record.workTitle}`);
    if (state.authorOrder === "alpha") {
      authorEntries.sort(([left], [right]) => left.localeCompare(right, undefined, { sensitivity: "base" }));
    }
    if (state.workOrder === "alpha") {
      workEntries.sort(([left], [right]) => {
        const [leftAuthor, leftTitle] = left.split("\t");
        const [rightAuthor, rightTitle] = right.split("\t");
        return leftTitle.localeCompare(rightTitle, undefined, { sensitivity: "base" })
          || leftAuthor.localeCompare(rightAuthor, undefined, { sensitivity: "base" });
      });
    }
    renderRanking(els.authorRanking, authorEntries, label => ({ label, query: label }), state.authorLimit, state.authorOrder, els.authorSummary, "authors");
    renderRanking(els.workRanking, workEntries, label => {
      const [author, title] = label.split("\t");
      return { label: `${title} \u2014 ${author}`, query: title };
    }, state.workLimit, state.workOrder, els.workSummary, "works");
  }

  function renderDashboard() {
    const volumes = [...new Set(records.map(record => record.htid))];
    const languageCounts = countBy(records, record => record.language);
    const totalPages = records.reduce((sum, record) => sum + record.pages, 0);
    const works = new Set(records.map(record => record.work));
    els.statRecords.textContent = records.length.toLocaleString();
    els.statVolumes.textContent = volumes.length.toLocaleString();
    els.statPages.textContent = totalPages.toLocaleString();
    els.statWorks.textContent = works.size.toLocaleString();
    els.languageTotal.textContent = `${languageCounts.length.toLocaleString()} languages`;

    document.querySelectorAll("[data-count-for]").forEach(node => {
      const language = node.dataset.countFor;
      const count = language === "all" ? records.length : (languageCounts.find(entry => entry[0] === language)?.[1] || 0);
      node.textContent = count.toLocaleString();
    });

    els.languageChart.innerHTML = languageCounts.map(([language, count]) => {
      const percent = count / records.length * 100;
      return `<button class="language-bar" type="button" data-language="${escapeHTML(language)}"><span class="bar-label"><strong>${escapeHTML(languageLabel(language))}</strong><em>${count.toLocaleString()} &middot; ${percent.toFixed(1)}%</em></span><span class="bar-track"><span style="width:${percent.toFixed(2)}%"></span></span></button>`;
    }).join("");

    const dated = volumes.map(htid => publicationYears(htid)).filter(years => years.length).map(years => Math.min(...years)).sort((a, b) => a - b);
    const missing = volumes.length - dated.length;
    els.dateCoverage.textContent = `${dated.length.toLocaleString()} of ${volumes.length.toLocaleString()} volumes${missing ? " dated" : ""}`;
    if (dated.length) {
      els.dateRange.textContent = `${dated[0]}\u2013${dated[dated.length - 1]}`;
      els.dateMedian.textContent = dated[Math.floor(dated.length / 2)].toString();
    }
    const periods = [
      ["Before 1800", year => year < 1800],
      ["1800\u20131849", year => year >= 1800 && year < 1850],
      ["1850\u20131899", year => year >= 1850 && year < 1900],
      ["1900 and later", year => year >= 1900]
    ].map(([label, test]) => [label, dated.filter(test).length]);
    const periodMax = Math.max(...periods.map(period => period[1]), 1);
    els.dateChart.innerHTML = periods.map(([label, count]) => `<div><span>${label}</span><span class="date-track"><span style="width:${(count / periodMax * 100).toFixed(2)}%"></span></span><strong>${count.toLocaleString()}</strong></div>`).join("");

    renderRankings();
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

  function matchesSearch(record) {
    const needle = state.query.trim().toLocaleLowerCase();
    const biblio = bibliography(record);
    const haystack = [
      record.title,
      record.author,
      record.htid,
      record.work,
      record.workAuthor,
      record.workTitle,
      record.language,
      biblio.title,
      biblio.responsibility,
      ...(biblio.editors || []),
      biblio.place,
      biblio.publisher
    ].filter(Boolean).join(" ").toLocaleLowerCase();
    return !needle || haystack.includes(needle);
  }

  function recordYear(record) {
    const biblioYears = String(bibliography(record).date || "").match(/\b(1[5-9]\d{2}|20\d{2})\b/g) || [];
    const years = biblioYears.map(Number).concat(publicationYears(record.htid));
    return years.length ? Math.min(...years) : null;
  }

  function recordEditor(record) {
    const biblio = bibliography(record);
    return (biblio.editors?.join("; ") || biblio.responsibility || "").trim();
  }

  function sortRecords(values) {
    if (state.sort === "dataset") return values;
    return values.sort((left, right) => {
      if (state.sort.startsWith("date-")) {
        const leftYear = recordYear(left);
        const rightYear = recordYear(right);
        if (leftYear === null && rightYear === null) return 0;
        if (leftYear === null) return 1;
        if (rightYear === null) return -1;
        return state.sort === "date-oldest" ? leftYear - rightYear : rightYear - leftYear;
      }
      const leftEditor = recordEditor(left);
      const rightEditor = recordEditor(right);
      if (!leftEditor && !rightEditor) return 0;
      if (!leftEditor) return 1;
      if (!rightEditor) return -1;
      const direction = state.sort === "editor-za" ? -1 : 1;
      return leftEditor.localeCompare(rightEditor, undefined, { sensitivity: "base" }) * direction;
    });
  }

  function visibleRecords() {
    return sortRecords(records.filter(record => {
      const matchesFilter = state.filter === "all" || record.language === state.filter;
      return matchesFilter && matchesSearch(record);
    }));
  }

  function renderFilterCounts() {
    const searchMatches = records.filter(matchesSearch);
    const languageCounts = new Map(countBy(searchMatches, record => record.language));
    document.querySelectorAll("[data-count-for]").forEach(node => {
      const language = node.dataset.countFor;
      const count = language === "all" ? searchMatches.length : (languageCounts.get(language) || 0);
      node.textContent = count.toLocaleString();
    });
  }

  function renderList() {
    const matches = visibleRecords();
    const visible = matches.slice(0, state.limit);
    renderFilterCounts();
    els.list.innerHTML = "";
    els.resultCount.textContent = matches.length.toLocaleString();
    els.empty.hidden = matches.length !== 0;
    els.loadMore.hidden = visible.length >= matches.length;
    els.loadMore.textContent = `Show more (${(matches.length - visible.length).toLocaleString()} remaining)`;

    visible.forEach(record => {
      const biblio = bibliography(record);
      const index = records.indexOf(record);
      const node = els.template.content.cloneNode(true);
      const button = node.querySelector(".record-row");
      button.dataset.index = index;
      button.classList.toggle("is-selected", index === state.selected);
      button.setAttribute("aria-current", index === state.selected ? "true" : "false");
      node.querySelector(".row-language").textContent = languageLabel(record.language);
      node.querySelector(".row-pages").textContent = `${record.pages.toLocaleString()} mapped pages`;
      node.querySelector(".row-title").textContent = biblio.title || record.title;
      node.querySelector(".row-author").textContent = record.author;
      node.querySelector(".row-date").textContent = [biblio.date, biblio.volume].filter(Boolean).join(" · ") || "Not listed";
      node.querySelector(".row-publisher").textContent = publicationLabel(biblio);
      node.querySelector(".row-editor").textContent = biblio.editors?.join("; ") || biblio.responsibility || "Not listed";
      node.querySelector(".row-page-detail").textContent = `${record.pages.toLocaleString()} mapped · print ${record.minPage.toLocaleString()}–${record.maxPage.toLocaleString()} · scans ${record.beginScan.toLocaleString()}–${record.endScan.toLocaleString()}`;
      node.querySelector(".row-physical").textContent = biblio.physical || "Not listed";
      node.querySelector(".row-id").textContent = record.htid;
      node.querySelector(".row-work-title").textContent = `${record.workAuthor} \u00b7 ${record.workTitle}`;
      els.list.appendChild(node);
    });
  }

  function metadataRow(label, value, asCode) {
    return `<div><dt>${escapeHTML(label)}</dt><dd>${asCode ? `<code>${escapeHTML(value)}</code>` : escapeHTML(value)}</dd></div>`;
  }

  function renderMetadata(record) {
    const biblio = bibliography(record);
    const years = publicationYears(record.htid);
    const dateLabel = biblio.date || (hathiDates[record.htid] || []).join(", ") || "Not available";
    els.metadata.innerHTML = [
      metadataRow("HathiTrust ID", record.htid, true),
      metadataRow("Full catalog title", biblio.title || record.title),
      metadataRow("Publication date", dateLabel),
      metadataRow("Publisher", publicationLabel(biblio)),
      metadataRow("Editor", biblio.editors?.join("; ") || biblio.responsibility || "Not listed"),
      metadataRow("Volume", biblio.volume || "Not listed"),
      metadataRow("Physical description", biblio.physical || "Not listed"),
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

  function selectRecord(index, revealBrowse) {
    state.selected = index;
    const record = records[index];
    els.title.textContent = bibliography(record).title || record.title;
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
    if (revealBrowse) showView("browse");
  }

  els.list.addEventListener("click", event => {
    const row = event.target.closest(".record-row");
    if (row) selectRecord(Number(row.dataset.index), true);
  });

  els.search.addEventListener("input", event => {
    state.query = event.target.value;
    state.limit = PAGE_SIZE;
    renderList();
  });

  els.sort.addEventListener("change", event => {
    state.sort = event.target.value;
    state.limit = PAGE_SIZE;
    renderList();
  });

  els.chips.forEach(chip => chip.addEventListener("click", () => setLanguageFilter(chip.dataset.filter, false)));

  els.overviewTab.addEventListener("click", () => showView("overview"));
  els.browseTab.addEventListener("click", () => showView("browse"));
  els.browseRecords.addEventListener("click", () => showView("browse"));
  els.languageChart.addEventListener("click", event => {
    const row = event.target.closest("[data-language]");
    if (row) setLanguageFilter(row.dataset.language, true);
  });
  [els.authorRanking, els.workRanking].forEach(list => list.addEventListener("click", event => {
    const button = event.target.closest("[data-query]");
    if (button) runSearch(button.dataset.query);
  }));
  els.authorLimit.addEventListener("change", event => {
    state.authorLimit = event.target.value;
    renderRankings();
  });
  els.workLimit.addEventListener("change", event => {
    state.workLimit = event.target.value;
    renderRankings();
  });
  els.authorOrder.addEventListener("change", event => {
    state.authorOrder = event.target.value;
    renderRankings();
  });
  els.workOrder.addEventListener("change", event => {
    state.workOrder = event.target.value;
    renderRankings();
  });

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
  renderDashboard();
  selectRecord(initialIndex >= 0 ? initialIndex : 0, false);
  showView("overview");

  window.hathiSheetLoaded = payload => {
    if (payload?.status !== "ok" || !payload.table?.rows?.length) return;
    const selectedID = records[state.selected]?.htid;
    const selectedWork = records[state.selected]?.work;
    records = payload.table.rows.map(row => recordFromCells(payload.table.cols, row.c));
    state.limit = PAGE_SIZE;
    els.datasetCount.textContent = records.length.toLocaleString();
    els.sourceStatus.textContent = "Live Google Sheet";
    const liveIndex = records.findIndex(record => record.htid === selectedID && record.work === selectedWork);
    renderDashboard();
    selectRecord(liveIndex >= 0 ? liveIndex : 0, false);
    showView(state.view);
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
