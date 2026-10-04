import fs from "node:fs";
import vm from "node:vm";

const [recordsPath, outputPath] = process.argv.slice(2);

if (!recordsPath || !outputPath) {
  throw new Error("Usage: node scripts/build-biblio.mjs RECORDS.js OUTPUT.js");
}

const context = { window: {} };
vm.runInNewContext(fs.readFileSync(recordsPath, "utf8"), context);
const htids = [...new Set(context.window.HATHI_RECORDS.map(record => record.htid))];
const bibliography = {};
let cursor = 0;

function decodeXML(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function fields(xml, tag) {
  const pattern = new RegExp(`<datafield\\b[^>]*tag="${tag}"[^>]*>([\\s\\S]*?)<\\/datafield>`, "g");
  return [...String(xml || "").matchAll(pattern)].map(match => match[1]);
}

function subfields(field) {
  const pattern = /<subfield\b[^>]*code="([^"]+)"[^>]*>([\s\S]*?)<\/subfield>/g;
  return [...String(field || "").matchAll(pattern)].map(match => ({ code: match[1], value: decodeXML(match[2]) }));
}

function values(field, codes) {
  const wanted = new Set(codes);
  return subfields(field).filter(entry => wanted.has(entry.code)).map(entry => entry.value).filter(Boolean);
}

function cleanJoined(parts) {
  return parts.join(" ").replace(/\s+([,;:.])/g, "$1").replace(/\s+/g, " ").trim();
}

function parseRecord(record, item) {
  const xml = record?.["marc-xml"] || "";
  const titleField = fields(xml, "245")[0] || "";
  const publicationField = fields(xml, "264")[0] || fields(xml, "260")[0] || "";
  const physicalField = fields(xml, "300")[0] || "";
  const responsibility = cleanJoined(values(titleField, ["c"]));
  const contributors = fields(xml, "700").map(field => {
    const entries = subfields(field);
    const role = entries.filter(entry => entry.code === "e" || entry.code === "4").map(entry => entry.value).join(" ");
    if (!/(^|\b)(ed|edt|editor|edited)(\b|\.)/i.test(role)) return "";
    return cleanJoined(entries.filter(entry => ["a", "b", "c", "d", "q", "e"].includes(entry.code)).map(entry => entry.value));
  }).filter(Boolean);

  return {
    title: cleanJoined(values(titleField, ["a", "b", "n", "p", "c"])) || record?.titles?.[0] || "",
    responsibility,
    date: cleanJoined(values(publicationField, ["c"])) || (record?.publishDates || []).join(", "),
    place: cleanJoined(values(publicationField, ["a"])),
    publisher: cleanJoined(values(publicationField, ["b"])),
    editors: contributors,
    physical: cleanJoined(values(physicalField, ["a", "b", "c", "e"])),
    volume: item?.enumcron || "",
    recordURL: record?.recordURL || ""
  };
}

async function fetchBibliography(htid) {
  const url = `https://catalog.hathitrust.org/api/volumes/full/htid/${encodeURIComponent(htid)}.json`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const payload = await response.json();
  const item = (payload.items || []).find(candidate => candidate.htid === htid);
  const record = item ? payload.records?.[item.fromRecord] : null;
  bibliography[htid] = record ? parseRecord(record, item) : {};
}

async function worker() {
  while (cursor < htids.length) {
    const index = cursor;
    cursor += 1;
    const htid = htids[index];
    try {
      await fetchBibliography(htid);
    } catch (error) {
      bibliography[htid] = {};
      console.error(`${htid}: ${error.message}`);
    }
    if ((index + 1) % 100 === 0) console.log(`${index + 1}/${htids.length}`);
  }
}

await Promise.all(Array.from({ length: 20 }, worker));
const ordered = Object.fromEntries(htids.map(htid => [htid, bibliography[htid] || {}]));
fs.writeFileSync(outputPath, `window.HATHI_BIBLIO = ${JSON.stringify(ordered, null, 2)};\n`);
console.log(`Wrote bibliography for ${htids.length} volumes to ${outputPath}`);
