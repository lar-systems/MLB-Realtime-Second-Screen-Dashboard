const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");

const rootDir = path.resolve(__dirname, "..");

function loadTeams() {
  const appJs = fs.readFileSync(path.join(rootDir, "app.js"), "utf8");
  const matches = [...appJs.matchAll(/\{\s*id:\s*(\d+),\s*name:\s*"([^"]+)",\s*abbr:\s*"([^"]+)"\s*\}/g)];
  return matches.map((match) => ({
    id: Number(match[1]),
    name: match[2],
    abbr: match[3],
  }));
}

async function main() {
  const outputPath = process.argv[2]
    ? path.resolve(process.cwd(), process.argv[2])
    : path.join(rootDir, ".smoke", "team-logo-audit.json");
  const teams = loadTeams();

  const browser = await chromium.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
  });

  const page = await browser.newPage();
  await page.setContent("<!doctype html><html><body></body></html>");

  const audit = await page.evaluate(async (teams) => {
    async function probe(team) {
      return new Promise((resolve) => {
        const img = new Image();
        const url = `https://www.mlbstatic.com/team-logos/${team.id}.svg?probe=${Date.now()}-${team.id}`;
        img.onload = () => {
          const width = img.naturalWidth || 0;
          const height = img.naturalHeight || 0;
          resolve({
            ...team,
            ok: true,
            width,
            height,
            aspectRatio: height ? Number((width / height).toFixed(3)) : null,
            url,
          });
        };
        img.onerror = () => {
          resolve({
            ...team,
            ok: false,
            width: 0,
            height: 0,
            aspectRatio: null,
            url,
          });
        };
        img.src = url;
      });
    }

    const rows = [];
    for (const team of teams) {
      // Sequential keeps MLB static requests gentle and deterministic.
      rows.push(await probe(team));
    }
    return rows;
  }, teams);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(audit, null, 2));

  const sorted = audit
    .filter((row) => row.ok)
    .sort((left, right) => (left.aspectRatio ?? 999) - (right.aspectRatio ?? 999));

  console.log(JSON.stringify({
    total: audit.length,
    loaded: audit.filter((row) => row.ok).length,
    failed: audit.filter((row) => !row.ok).length,
    narrowest: sorted.slice(0, 10),
  }, null, 2));

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
