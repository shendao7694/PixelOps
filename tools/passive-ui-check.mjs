import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const BASE_URL = process.env.PIXEL_OPS_URL || 'http://127.0.0.1:18123/';
const OUTPUT = new URL('../output/playwright/', import.meta.url);
await mkdir(OUTPUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});
page.on('pageerror', (error) => errors.push(`page: ${error.message}`));

function check(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__game
    && (!document.querySelector('#boot')
      || document.querySelector('#boot').classList.contains('hidden')));
  await page.evaluate(() => window.__game.startMatch());
  await page.locator('.loadout-layer:not([hidden])').waitFor();

  const simplifiedLayout = await page.evaluate(() => {
    const layer = document.querySelector('.loadout-layer');
    const shell = document.querySelector('.loadout-shell');
    const grid = document.querySelector('.loadout-grid');
    const slot = document.querySelector('.loadout-slot');
    const gridRect = grid.getBoundingClientRect();
    const slotRects = [...document.querySelectorAll('.loadout-grid .loadout-slot')]
      .map((node) => node.getBoundingClientRect());
    const uniqueSizes = new Set(slotRects.map((rect) =>
      `${Math.round(rect.width)}x${Math.round(rect.height)}`));
    const occupiedBounds = {
      left: Math.min(...slotRects.map((rect) => rect.left)),
      top: Math.min(...slotRects.map((rect) => rect.top)),
      right: Math.max(...slotRects.map((rect) => rect.right)),
      bottom: Math.max(...slotRects.map((rect) => rect.bottom)),
    };
    return {
      slots: document.querySelectorAll('.loadout-grid .loadout-slot').length,
      models: document.querySelectorAll('.loadout-grid .loadout-slot-model').length,
      generatedSilhouettes: document.querySelectorAll(
        '.loadout-grid img.loadout-generated-silhouette'
      ).length,
      descriptions: document.querySelectorAll('.loadout-grid .loadout-slot-description').length,
      visibleSlotTexts: [...document.querySelectorAll('.loadout-grid .loadout-slot')]
        .map((node) => node.innerText.trim()),
      slotLabels: document.querySelectorAll('.loadout-grid .loadout-slot-label').length,
      layerBackground: getComputedStyle(layer).backgroundColor,
      shellBackground: getComputedStyle(shell).backgroundColor,
      slotBackground: getComputedStyle(slot).backgroundColor,
      fontFamily: getComputedStyle(slot).fontFamily,
      scanlineDisplay: getComputedStyle(shell, '::after').display,
      columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
      radius: Number.parseFloat(getComputedStyle(slot).borderRadius),
      uniqueSizes: uniqueSizes.size,
      fillsGrid: Math.abs(occupiedBounds.left - gridRect.left) < 1
        && Math.abs(occupiedBounds.top - gridRect.top) < 1
        && Math.abs(occupiedBounds.right - gridRect.right) < 1
        && Math.abs(occupiedBounds.bottom - gridRect.bottom) < 1,
    };
  });
  check(simplifiedLayout.slots === 8,
    `expected an eight-slot rectangle, got ${simplifiedLayout.slots}`);
  check(simplifiedLayout.models === 8,
    `expected one model preview per slot, got ${simplifiedLayout.models}`);
  check(simplifiedLayout.generatedSilhouettes >= 7,
    `expected generated silhouettes for implemented equipment, got ${simplifiedLayout.generatedSilhouettes}`);
  check(simplifiedLayout.descriptions === 0,
    'main loadout cards still contain descriptive copy');
  check(simplifiedLayout.slotLabels === 0
      && simplifiedLayout.visibleSlotTexts.every((text) => text === ''),
    `main loadout cards still render text: ${JSON.stringify(simplifiedLayout.visibleSlotTexts)}`);
  check(simplifiedLayout.layerBackground === 'rgba(0, 0, 0, 0)'
      && simplifiedLayout.shellBackground === 'rgba(0, 0, 0, 0)',
    `loadout background is not transparent: ${JSON.stringify(simplifiedLayout)}`);
  check(simplifiedLayout.slotBackground === 'rgb(0, 0, 0)',
    `loadout tiles are not black: ${simplifiedLayout.slotBackground}`);
  check(simplifiedLayout.fontFamily.includes('Pixel Ops UI'),
    `loadout is not using the pixel font: ${simplifiedLayout.fontFamily}`);
  check(simplifiedLayout.scanlineDisplay === 'none',
    'loadout scanline is still rendered');
  check(simplifiedLayout.columns === 12
      && simplifiedLayout.radius === 0
      && simplifiedLayout.uniqueSizes >= 4
      && simplifiedLayout.fillsGrid,
    `desktop slots are not a flush rectangular mosaic: ${JSON.stringify(simplifiedLayout)}`);

  check(await page.locator('#loadout-passives .loadout-slot').count() === 1,
    'loadout rendered more than one passive slot');
  check(await page.locator('#loadout-passives .passive-icon').count() === 1,
    'selected passive shield icon is missing');
  const passiveCardLayout = await page.locator('#loadout-passives .loadout-slot').evaluate((card) => {
    const iconRect = card.querySelector('.loadout-passive-icon').getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    return {
      visibleText: card.innerText.trim(),
      hasName: Boolean(card.querySelector('.loadout-passive-name')),
      hasLabel: Boolean(card.querySelector('.loadout-slot-label')),
      centerDeltaX: iconRect.left + iconRect.width / 2
        - (cardRect.left + cardRect.width / 2),
      centerDeltaY: iconRect.top + iconRect.height / 2
        - (cardRect.top + cardRect.height / 2),
    };
  });
  check(passiveCardLayout.visibleText === ''
      && !passiveCardLayout.hasName
      && !passiveCardLayout.hasLabel
      && Math.abs(passiveCardLayout.centerDeltaX) <= 1
      && Math.abs(passiveCardLayout.centerDeltaY) <= 1,
    `passive card is not an icon-only centred tile: ${JSON.stringify(passiveCardLayout)}`);

  const tileCenters = await page.locator('.loadout-grid .loadout-slot').evaluateAll((cards) =>
    cards.map((card) => {
      const cardRect = card.getBoundingClientRect();
      const modelRect = card.querySelector('.loadout-slot-model').getBoundingClientRect();
      return {
        group: card.dataset.group,
        index: card.dataset.index,
        dx: modelRect.left + modelRect.width / 2
          - (cardRect.left + cardRect.width / 2),
        dy: modelRect.top + modelRect.height / 2
          - (cardRect.top + cardRect.height / 2),
      };
    }));
  check(tileCenters.every(({ dx, dy }) => Math.abs(dx) <= 1 && Math.abs(dy) <= 1),
    `one or more icon-only tiles are not centred: ${JSON.stringify(tileCenters)}`);

  await page.waitForFunction(() => {
    const image = document.querySelector(
      '.loadout-slot[data-group="melee"] img.loadout-generated-silhouette'
    );
    return image?.complete && image.naturalWidth > 0;
  });
  const meleeAlignment = await page.locator(
    '.loadout-slot[data-group="melee"]'
  ).evaluate((card) => {
    const image = card.querySelector('img.loadout-generated-silhouette');
    const cardRect = card.getBoundingClientRect();
    const imageRect = image.getBoundingClientRect();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let minY = canvas.height;
    let maxY = -1;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        if (pixels[(y * canvas.width + x) * 4 + 3] > 8) {
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
      }
    }
    const scale = Math.min(
      imageRect.width / canvas.width,
      imageRect.height / canvas.height
    );
    const contentTop = imageRect.top
      + (imageRect.height - canvas.height * scale) / 2;
    const visibleCenterY = contentTop + ((minY + maxY + 1) / 2) * scale;
    return {
      visibleCenterDelta: visibleCenterY
        - (cardRect.top + cardRect.height / 2),
      imageTop: imageRect.top,
      imageBottom: imageRect.bottom,
      cardTop: cardRect.top,
      cardBottom: cardRect.bottom,
      alphaBounds: [minY, maxY],
    };
  });
  check(Math.abs(meleeAlignment.visibleCenterDelta) <= 1.5
      && meleeAlignment.imageTop >= meleeAlignment.cardTop
      && meleeAlignment.imageBottom <= meleeAlignment.cardBottom,
    `melee silhouette is not vertically centred: ${JSON.stringify(meleeAlignment)}`);
  await page.screenshot({
    path: fileURLToPath(new URL('generated-loadout-desktop.png', OUTPUT)),
    fullPage: true,
  });
  await page.locator('[data-group="secondary"]').click();
  await page.waitForFunction(() => {
    const images = [...document.querySelectorAll(
      '.loadout-option.equipment-option img.loadout-generated-silhouette'
    )];
    return images.length === 2
      && images.every((image) => image.complete && image.naturalWidth > 0);
  });
  await page.screenshot({
    path: fileURLToPath(new URL('generated-secondary-picker.png', OUTPUT)),
    fullPage: true,
  });
  const pickerStyle = await page.evaluate(() => ({
    visibleHeaderCount: document.querySelectorAll('#loadout-picker > header').length,
    background: getComputedStyle(document.querySelector('#loadout-picker')).backgroundColor,
    optionBackgrounds: [...document.querySelectorAll('.loadout-option')]
      .map((node) => getComputedStyle(node).backgroundColor),
  }));
  check(pickerStyle.visibleHeaderCount === 0,
    'the item picker still renders a top bar');
  check(pickerStyle.background === 'rgb(0, 0, 0)'
      && pickerStyle.optionBackgrounds.every((color) => color === 'rgb(0, 0, 0)'),
    `picker blocks are not uniformly black: ${JSON.stringify(pickerStyle)}`);
  await page.keyboard.press('Escape');
  await page.locator('[data-group="primary"]').click();
  await page.waitForFunction(() => {
    const images = [...document.querySelectorAll(
      '.loadout-option.equipment-option img.loadout-generated-silhouette'
    )];
    return images.length === 4
      && images.every((image) => image.complete && image.naturalWidth > 0);
  });
  await page.screenshot({
    path: fileURLToPath(new URL('generated-primary-picker.png', OUTPUT)),
    fullPage: true,
  });
  await page.keyboard.press('Escape');

  await page.locator('#loadout-passives .loadout-slot').click();
  const passiveNames = await page.locator('.loadout-option.passive-option strong').allTextContents();
  check(passiveNames.length === 10, `expected 10 passive choices, got ${passiveNames.length}`);
  for (const name of [
    'BLAST PADDING', 'CERAMIC PLATES', 'AEROBIC CONDITIONING', 'ELECTRONIC STEALTH',
    'PREDATORY INSTINCT', 'WEAPON MASTER', 'SCORE SPECIALIST', 'LIGHTWEIGHT',
    'MARTYRDOM', 'READY FOR ACTION',
  ]) {
    check(passiveNames.includes(name), `missing passive choice ${name}`);
  }
  check(await page.locator('.loadout-option.passive-option .passive-icon').count() === 10,
    'one or more passive picker shield icons are missing');
  await page.screenshot({
    path: fileURLToPath(new URL('passive-loadout-desktop.png', OUTPUT)),
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 720 });
  check(await page.locator('.loadout-grid').evaluate((grid) =>
    getComputedStyle(grid).gridTemplateColumns.split(' ').length) === 6,
  'narrow loadout is not a six-column tile mosaic');
  await page.screenshot({
    path: fileURLToPath(new URL('passive-loadout-narrow.png', OUTPUT)),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.locator('.loadout-option[data-option="score_specialist"]').click();
  check(await page.locator('#loadout-picker').isHidden(),
    'selecting an option did not immediately close the picker');
  await page.locator('#loadout-streaks .loadout-slot').first().click();
  const killRequirements = await page.locator('.loadout-option-copy > span').allTextContents();
  check(killRequirements.includes('2 KILLSTREAK'), 'discounted UAV kills are not shown');
  check(killRequirements.includes('4 KILLSTREAK'), 'discounted TV missile kills are not shown');
  check(killRequirements.includes('5 KILLSTREAK'), 'discounted six-kill reward is not shown');
  await page.keyboard.press('Escape');

  await page.locator('#loadout-passives .loadout-slot').click();
  await page.locator('.loadout-option[data-option="weapon_master"]').click();
  check((await page.locator('[data-group="secondary"]').getAttribute('aria-label'))
    .startsWith('SECOND PRIMARY:'), 'Weapon Master did not convert slot 2');
  await page.locator('[data-group="secondary"]').click();
  const secondPrimaryIds = await page.locator('.loadout-option').evaluateAll((nodes) =>
    nodes.map((node) => node.dataset.option));
  check(secondPrimaryIds.length === 3 && secondPrimaryIds.every((id) =>
    ['smg', 'shotgun', 'sniper'].includes(id)),
  `invalid Weapon Master choices: ${secondPrimaryIds.join(',')}`);
  await page.keyboard.press('Escape');

  await page.locator('#loadout-passives .loadout-slot').click();
  await page.locator('.loadout-option[data-option="lightweight"]').click();
  await page.locator('#loadout-deploy').click();
  await page.waitForFunction(() => document.querySelector('#loadout-layer')?.hidden === true);
  await page.waitForTimeout(400);
  await page.screenshot({
    path: fileURLToPath(new URL('passive-hud-540p.png', OUTPUT)),
    fullPage: true,
  });

  check(errors.length === 0, errors.join('\n'));
  console.log('Passive loadout and HUD browser check passed');
} finally {
  await browser.close();
}
