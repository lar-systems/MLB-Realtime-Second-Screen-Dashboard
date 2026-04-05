/*
 * Minimal localhost smoke test.
 *
 * Usage:
 *   node .\smoke-live.cjs [mode] [screenshotPath] [teamId]
 *
 * It opens localhost in headless Chrome, selects a team, cycles to the
 * requested mode, prints a small JSON summary, and saves a screenshot.
 */

const { chromium } = require('playwright-core');

async function main() {
  const targetMode = (process.argv[2] || 'live').toLowerCase();
  const screenshotPath = process.argv[3] || `.smoke/${targetMode}-state.png`;
  const targetTeamId = process.argv[4] || '141';
  const forcedCycleClicks = Number(process.argv[5] || '0');
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  });

  const page = await browser.newPage();
  await page.goto('http://localhost/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  await page.selectOption('#team-select', targetTeamId);
  await page.waitForTimeout(1200);

  const modeLabel = page.locator('#mode-label');
  const cycleButton = page.locator('#cycle-mode-button');

  for (let i = 0; i < forcedCycleClicks; i += 1) {
    await cycleButton.click();
    await page.waitForTimeout(1500);
  }

  // Mock mode rotates through the three states, so a few clicks are enough to
  // land on the requested one for screenshots and sanity checks.
  for (let i = 0; i < 4; i += 1) {
    const mode = (await modeLabel.textContent())?.trim().toLowerCase();
    if (mode === targetMode) {
      break;
    }
    await cycleButton.click();
    await page.waitForTimeout(1500);
  }

  const result = await page.evaluate(async (targetTeamId) => {
    const byId = (id) => document.getElementById(id);
    const isHidden = (el) => {
      if (!el) return null;
      const style = window.getComputedStyle(el);
      return el.hidden || style.display === 'none' || style.visibility === 'hidden';
    };
    const probeLogo = await new Promise((resolve) => {
      const url = `https://www.mlbstatic.com/team-logos/${targetTeamId}.svg?probe=${Date.now()}`;
      const img = new Image();
      img.onload = () => resolve({
        ok: true,
        url,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
      });
      img.onerror = () => resolve({
        ok: false,
        url,
        naturalWidth: 0,
        naturalHeight: 0,
      });
      img.src = url;
    });

    return {
      detailsSideBySide: (() => {
        const linescore = byId('linescore')?.closest('.panel');
        const notes = document.querySelector('.notes-panel');
        if (!linescore || !notes) return null;
        const leftRect = linescore.getBoundingClientRect();
        const rightRect = notes.getBoundingClientRect();
        return Math.abs(leftRect.top - rightRect.top) < 2 && rightRect.left > leftRect.left;
      })(),
      mode: byId('mode-label')?.textContent?.trim() || null,
      status: byId('status-label')?.textContent?.trim() || null,
      heroFooterHidden: isHidden(byId('hero-footer')),
      matchupGridHidden: isHidden(byId('matchup-grid')),
      detailsGridClasses: byId('details-grid')?.className || null,
        awayLiveRoleHidden: isHidden(byId('away-live-role')),
        homeLiveRoleHidden: isHidden(byId('home-live-role')),
        selectedTeam: byId('team-title')?.textContent?.trim() || null,
        headerLogoHidden: isHidden(byId('header-team-logo')),
        headerLogoSrc: byId('header-team-logo')?.getAttribute('src') || null,
        headerLogoCurrentSrc: byId('header-team-logo')?.currentSrc || null,
        headerLogoNaturalWidth: byId('header-team-logo')?.naturalWidth || null,
        headerLogoNaturalHeight: byId('header-team-logo')?.naturalHeight || null,
        logoProbe: probeLogo,
        awayName: byId('away-name')?.textContent?.trim() || null,
      homeName: byId('home-name')?.textContent?.trim() || null,
      awayRoleMeta: byId('away-live-role-meta')?.textContent?.trim() || null,
      batterMeta: byId('batter-meta')?.textContent?.trim() || null,
      pitcherMeta: byId('pitcher-meta')?.textContent?.trim() || null,
      batterPhotoProcessed: Boolean(byId('batter-photo')?.getAttribute('src')?.startsWith('data:image/png')),
      pitcherPhotoProcessed: Boolean(byId('pitcher-photo')?.getAttribute('src')?.startsWith('data:image/png')),
        awayScore: byId('away-score')?.textContent?.trim() || null,
        homeScore: byId('home-score')?.textContent?.trim() || null,
        centerState: byId('center-state')?.textContent?.trim() || null,
      countdownText: byId('countdown')?.textContent?.trim() || null,
      elapsedTime: byId('elapsed-time')?.textContent?.trim() || null,
      celebrationHidden: isHidden(byId('celebration-modal')),
      celebrationLabel: byId('celebration-label')?.textContent?.trim() || null,
      celebrationDetail: byId('celebration-detail')?.textContent?.trim() || null,
      celebrationActor: byId('celebration-actor')?.textContent?.trim() || null,
      linescoreLabel: byId('linescore-label')?.textContent?.trim() || null,
      linescoreEmpty: document.querySelector('#linescore .linescore-empty')?.textContent?.trim() || null,
      linescoreRows: document.querySelectorAll('#linescore tbody tr').length,
      notesLabel: byId('notes-label')?.textContent?.trim() || null,
      scheduleItems: document.querySelectorAll('#upcoming-schedule .schedule-item').length,
      scheduleHidden: isHidden(byId('upcoming-schedule')),
      notesMetaHidden: isHidden(byId('notes-meta-row')),
      recentPlay: byId('recent-play')?.textContent?.trim() || null,
    };
  }, targetTeamId);

  console.log(JSON.stringify(result, null, 2));
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
