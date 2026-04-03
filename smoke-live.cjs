const { chromium } = require('playwright-core');

async function main() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });

  const page = await browser.newPage();
  await page.goto('http://localhost/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  await page.selectOption('#team-select', '141');
  await page.waitForTimeout(1200);

  const modeLabel = page.locator('#mode-label');
  const cycleButton = page.locator('#cycle-mode-button');

  for (let i = 0; i < 3; i += 1) {
    const mode = (await modeLabel.textContent())?.trim().toLowerCase();
    if (mode === 'live') {
      break;
    }
    await cycleButton.click();
    await page.waitForTimeout(1500);
  }

  const result = await page.evaluate(() => {
    const byId = (id) => document.getElementById(id);
    const isHidden = (el) => {
      if (!el) return null;
      const style = window.getComputedStyle(el);
      return el.hidden || style.display === 'none' || style.visibility === 'hidden';
    };

    return {
      mode: byId('mode-label')?.textContent?.trim() || null,
      status: byId('status-label')?.textContent?.trim() || null,
      heroFooterHidden: isHidden(byId('hero-footer')),
      matchupGridHidden: isHidden(byId('matchup-grid')),
      detailsGridClasses: byId('details-grid')?.className || null,
      awayLiveRoleHidden: isHidden(byId('away-live-role')),
      homeLiveRoleHidden: isHidden(byId('home-live-role')),
      selectedTeam: byId('team-title')?.textContent?.trim() || null,
      awayName: byId('away-name')?.textContent?.trim() || null,
      homeName: byId('home-name')?.textContent?.trim() || null,
      recentPlay: byId('recent-play')?.textContent?.trim() || null,
    };
  });

  console.log(JSON.stringify(result, null, 2));
  await page.screenshot({ path: '.smoke/live-state.png', fullPage: true });
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
