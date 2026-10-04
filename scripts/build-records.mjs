import fs from "node:fs";

const [inputPath, outputPath] = process.argv.slice(2);

if (!inputPath || !outputPath) {
  throw new Error("Usage: node scripts/build-records.mjs INPUT.tsv OUTPUT.js");
}

const raw = fs.readFileSync(inputPath, "utf8").replace(/^\uFEFF/, "").trimEnd();

function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted && character === '"' && text[index + 1] === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === "," && !quoted) {
      row.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += character;
    }
  }
  row.push(field);
  rows.push(row);
  return rows;
}

const table = inputPath.toLowerCase().endsWith(".csv")
  ? parseCSV(raw)
  : raw.split(/\r?\n/).map(line => line.split("\t"));
const headers = table.shift();
const numberFields = new Set([
  "pp", "map", "minp", "maxp", "line1", "nlines", "wlines", "cover",
  "begin", "end", "spanp", "density"
]);

const records = table.filter(values => values.some(Boolean)).map(values => {
  const source = Object.fromEntries(headers.map((header, index) => [
    header,
    numberFields.has(header) ? Number(values[index]) : (values[index] || "")
  ]));

  return {
    book: source.book,
    htid: `hvd.${source.book.toLowerCase()}`,
    work: source.work,
    language: source.lang,
    pages: source.pp,
    mapScore: source.map,
    minPage: source.minp,
    maxPage: source.maxp,
    firstLine: source.line1,
    lines: source.nlines,
    wordLines: source.wlines,
    cover: source.cover,
    beginScan: source.begin,
    endScan: source.end,
    spanPages: source.spanp,
    density: source.density,
    workAuthor: source.work_author,
    workTitle: source.work_title,
    author: source.author,
    title: source.title,
    url: source.url,
    rights: "unknown"
  };
});

const json = JSON.stringify(records, null, 2).replace(/[\u007f-\uffff]/g, character =>
  `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`
);

fs.writeFileSync(outputPath, `window.HATHI_RECORDS = ${json};\n`);
console.log(`Wrote ${records.length} records to ${outputPath}`);
