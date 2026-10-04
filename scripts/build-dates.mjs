import fs from "node:fs";
import vm from "node:vm";

const [recordsPath, outputPath] = process.argv.slice(2);

if (!recordsPath || !outputPath) {
  throw new Error("Usage: node scripts/build-dates.mjs RECORDS.js OUTPUT.js");
}

const context = { window: {} };
vm.runInNewContext(fs.readFileSync(recordsPath, "utf8"), context);
const htids = [...new Set(context.window.HATHI_RECORDS.map(record => record.htid))];
const dates = {};
let cursor = 0;

async function fetchDate(htid) {
  const url = `https://catalog.hathitrust.org/api/volumes/full/htid/${encodeURIComponent(htid)}.json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const payload = await response.json();
  const item = (payload.items || []).find(candidate => candidate.htid === htid);
  const record = item ? payload.records?.[item.fromRecord] : null;
  const published = (record?.publishDates || []).map(String).filter(Boolean);
  dates[htid] = published;
}

async function worker() {
  while (cursor < htids.length) {
    const index = cursor;
    cursor += 1;
    const htid = htids[index];
    try {
      await fetchDate(htid);
    } catch (error) {
      dates[htid] = [];
      console.error(`${htid}: ${error.message}`);
    }
    if ((index + 1) % 100 === 0) console.log(`${index + 1}/${htids.length}`);
  }
}

await Promise.all(Array.from({ length: 20 }, worker));
const ordered = Object.fromEntries(htids.map(htid => [htid, dates[htid] || []]));
fs.writeFileSync(outputPath, `window.HATHI_DATES = ${JSON.stringify(ordered, null, 2)};\n`);
console.log(`Wrote dates for ${htids.length} volumes to ${outputPath}`);
