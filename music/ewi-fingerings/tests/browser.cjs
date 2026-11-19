const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('playwright');
const { launchQuietBrowser } = require('../../../scripts/quiet-browser.cjs');
const { serveSite } = require('../../../scripts/site-pages.cjs');

(async () => {
  const site = await serveSite(path.resolve(__dirname, '../../..'));
  const browser = await launchQuietBrowser(process.env.EWI_BROWSER === 'webkit' ? webkit : chromium);
  const failures = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => failures.push(error.message));
  fs.mkdirSync('/tmp/ewi-redesign', { recursive: true });
  async function setKeyRegister(target) {
    const current = Number(await page.locator('#key-register').textContent());
    const step = Math.sign(target - current);
    for (let register = current; register !== target; register += step) {
      await page.locator('[data-register-step="' + step + '"]').click();
    }
    assert.equal(Number(await page.locator('#key-register').textContent()), target);
  }
  function keyGeometry(selector) {
    return page.locator(selector).first().locator('use').evaluateAll(keys => keys.map(key =>
      [key.parentElement.getAttribute('transform'), key.getAttribute('href'), key.width.baseVal.value, key.height.baseVal.value]
    ));
  }
  async function checkMelodyColumn() {
    const rows = await page.locator('.phrase-step').evaluateAll(steps => steps.map(step => {
      const { left, right, top, bottom } = step.getBoundingClientRect();
      return { left, right, top, bottom };
    }));
    assert.ok(rows.length > 1, 'the phrase has multiple notes');
    assert.ok(rows.every(({ left, right, top }, i) => left === rows[0].left && right === rows[0].right && (!i || top >= rows[i - 1].bottom)),
      'every note occupies its own row in the same column');
  }
  async function openFingerings() {
    await page.locator('[data-view="explore"]').click();
    await page.waitForSelector('.alternate');
  }
  function fingeringRowPositions() {
    return page.locator('.ranked-rows .alternate').evaluateAll(rows => rows.map(row =>
      [row, ...row.children, ...row.querySelectorAll('use')].map(element => {
        const { x, y, width, height } = element.getBoundingClientRect();
        return [x + scrollX, y + scrollY, width, height].map(value => Math.round(value * 10) / 10);
      })
    ));
  }
  async function checkFingeringLayout() {
    assert.equal(await page.locator('#explore .upright-diagram').count(), 0);
    const gap = await page.locator('.ranked-rows .alternate').evaluateAll(cards => {
      const first = cards[0].getBoundingClientRect();
      const next = cards.map(card => card.getBoundingClientRect()).find(box => box.top > first.top + 1);
      return next.top - first.bottom;
    });
    assert.ok(gap >= 0 && gap <= 6, `fingering rows have a compact gap, got ${gap}px`);
    for (const selector of ['#main-diagram', '.ranked-rows .alternate']) {
      assert.equal(await page.locator(`${selector} .mini-diagram > g`).first().getAttribute('transform'), 'rotate(-90)');
    }
  }
  try {
    await page.goto(site.base + '/music/ewi-fingerings/');
    assert.equal(await page.locator('[data-view="guide"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#guide').isVisible(), true);
    assert.equal(await page.locator('#explore').isVisible(), false);
    assert.equal(await page.locator('#workspace-spelling').isVisible(), true);
    assert.equal(await page.getByRole('group', { name: 'Note spelling', exact: true }).count(), 1);
    assert.deepEqual(await page.locator('.workspace-nav button').allTextContents(),
      ['Key explorer', 'Fingerings', 'Note moves', 'Melody']);
    await openFingerings();
    assert.equal(await page.locator('#workspace-spelling [data-spelling="flats"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#selected-note').textContent(), 'G');
    assert.equal(await page.locator('select').count(), 0);
    assert.equal(await page.locator('#melody').inputValue(), 'C4 D4 E4 F4 G4 A4 B4 C5');
    assert.equal(await page.locator('.alternate').count(), 12);
    await page.screenshot({ path: '/tmp/ewi-redesign/after-desktop.png' });
    assert.equal(await page.locator('.alternate').first().locator('use').count(), 13);
    assert.equal(await page.locator('.alternate').first().locator('use').nth(1).getAttribute('href'), '#ewi-key-bis');
    assert.equal(await page.locator('#main-diagram use').count(), 13);
    assert.equal(await page.locator('#key-symbols symbol').count(), 8);
    const positions = await page.locator('#note-picker button').evaluateAll(buttons => buttons.slice(0, 3).map(button => {
      const { x, y, width } = button.getBoundingClientRect();
      return [x + width / 2, y];
    }));
    assert.equal(positions[0][1], positions[2][1]);
    assert.ok(positions[1][1] < positions[0][1], 'the black key is above the white keys');
    assert.ok(Math.abs(positions[1][0] - (positions[0][0] + positions[2][0]) / 2) < 1, 'the black key is centered between the neighboring white keys');
    const referenceGeometry = await keyGeometry('#main-diagram svg');
    const widths = referenceGeometry.map(([, , width]) => Math.round(width / .52 * 10) / 10);
    assert.deepEqual(widths, [47, 56, 47, 47, 77, 101, 81, 47, 47, 47, 70, 91, 116.5],
      'key widths match the measured proportions in the manual');
    assert.deepEqual(await keyGeometry('.ranked-rows .alternate svg'), referenceGeometry);
    await page.setViewportSize({ width: 1280, height: 800 });
    await checkFingeringLayout();
    for (let key = 0; key < 12; key++) {
      await page.locator(`[data-pitch="${key}"]`).click();
      const last = await page.locator('.ranked-rows .alternate').last().boundingBox();
      const lastDisclosure = await page.locator('.additional-fingerings summary').last().boundingBox();
      assert.ok(Math.max(last.y + last.height, lastDisclosure.y + lastDisclosure.height) <= 800,
        `pitch ${key}: default fingerings and disclosure fit on a laptop without scrolling`);
    }
    const melodyButton = await page.locator('#add-note').boundingBox();
    assert.ok(melodyButton.y + melodyButton.height <= 800, 'adding the selected fingering fits without scrolling');
    await page.locator('[data-pitch="7"]').click();
    await page.setViewportSize({ width: 375, height: 812 });
    await checkFingeringLayout();
    assert.deepEqual(await keyGeometry('.ranked-rows .alternate svg'), referenceGeometry);
    const mobileRows = await page.locator('.ranked-rows .alternate').evaluateAll(buttons => buttons.map(button => {
      const { top, bottom, height } = button.getBoundingClientRect();
      const diagram = button.querySelector('svg').getBoundingClientRect();
      return { top, height, proportion: diagram.width / innerWidth, visible: top >= 0 && bottom <= innerHeight };
    }));
    assert.equal(new Set(mobileRows.map(row => row.top)).size, 12, 'each fingering has its own row on a phone');
    assert.ok(mobileRows.every(row => row.height >= 44 && row.proportion >= 2 / 3 && row.proportion <= 3 / 4),
      'mobile diagrams fill two-thirds to three-quarters of the screen');
    assert.ok(mobileRows.every(row => row.height === mobileRows[0].height && row.height < 80),
      'all mobile rows are compact and have equal heights');
    assert.ok(mobileRows.filter(row => row.visible).length >= 6, 'the phone shows at least six enlarged rows before scrolling');
    const selectedRow = page.locator('.ranked-rows .alternate[aria-pressed="true"]');
    const initialPositions = await fingeringRowPositions();
    for (const rank of ['1', '2']) {
      await page.locator(`[data-fingering="${rank}"]`).click();
      assert.deepEqual(await fingeringRowPositions(), initialPositions, 'selection keeps every row element in place');
      const padding = await selectedRow.evaluate(row => {
        const border = row.getBoundingClientRect();
        const keys = [...row.querySelectorAll('use')].map(key => key.getBoundingClientRect());
        return [
          Math.min(...keys.map(key => key.top)) - border.top,
          border.bottom - Math.max(...keys.map(key => key.bottom)),
          Math.min(...keys.map(key => key.left)) - border.left,
          border.right - Math.max(...keys.map(key => key.right)),
        ];
      });
      assert.ok(Math.min(...padding) >= 2, `rank ${rank} has space between its keys and selection border`);
      assert.ok(Math.abs(padding[0] - padding[1]) < 1, `rank ${rank} has balanced vertical padding`);
    }
    await page.locator('.ranked-rows .alternate').last().scrollIntoViewIfNeeded();
    assert.ok(await page.locator('.ranked-rows .alternate').last().evaluate(button => button.getBoundingClientRect().bottom <= innerHeight));
    assert.equal(await page.locator('#fingering-detail').isVisible(), false);
    await page.locator('#detail-toggle').click();
    assert.equal(await page.locator('#fingering-detail').isVisible(), true);
    const previewWidth = await page.locator('#main-diagram svg').evaluate(svg => svg.getBoundingClientRect().width / innerWidth);
    assert.ok(previewWidth >= 2 / 3 && previewWidth <= 3 / 4, 'the selected mobile preview uses the same wide scale');
    await page.locator('[data-pitch="0"]').click();
    const expandedPositions = await fingeringRowPositions();
    await page.locator('[data-register="0"] .ranked-rows .alternate').first().click();
    assert.equal(await page.locator('#thumb-offset').isVisible(), true);
    assert.deepEqual(await fingeringRowPositions(), expandedPositions, 'the expanded preview with a thumb offset keeps the rows in place');
    await page.locator('#detail-toggle').click();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('[data-pitch="7"]').click();

    // Ranked results start with circles and bis, then paginate the other side keys.
    assert.deepEqual((await page.locator('.alternate-held').allTextContents()).slice(0, 3), ['3', '4', '3']);
    await page.locator('[data-pitch="10"]').click();
    assert.match(await page.locator('.alternate').first().getAttribute('aria-label'), /^Rank 1, 2 keys down\. Touch K1, K2\.$/);
    assert.match(await page.locator('#ranking-detail').textContent(), /2 keys down · 0 side touches/);
    await page.locator('[data-pitch="4"]').click();
    assert.equal(await page.locator('.alternate').count(), 4);
    assert.equal(await page.locator('.additional-fingerings summary').textContent(), '406 side-key fingerings');
    await page.locator('.additional-fingerings summary').click();
    await page.waitForSelector('.additional-rows .alternate');
    assert.equal(await page.locator('.additional-rows .alternate').count(), 12);
    assert.deepEqual(await keyGeometry('.additional-rows .alternate svg'), referenceGeometry);
    assert.equal(await page.locator('.additional-rows .upright-diagram').count(), 0);
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    assert.equal(await page.locator('.additional-pagination [role="status"]').textContent(), '13–24 of 406');
    await page.locator('.additional-rows .alternate').first().click();
    assert.equal(await page.locator('.additional-fingerings').getAttribute('open'), '');
    assert.equal(await page.locator('#selected-variant').textContent(), 'Rank 17');

    // Pitch-class selection and overlap between two reference registers.
    await page.locator('[data-pitch="0"]').click();
    assert.equal(await page.locator('.alternate').count(), 4);
    assert.deepEqual(await page.locator('.register-group').evaluateAll(groups => groups.map(g => [g.dataset.register, g.querySelectorAll('.alternate').length])), [['-1', 3], ['0', 1]]);
    await page.locator('[data-register="0"] .alternate').first().click();
    assert.equal(await page.locator('#thumb-offset').textContent(), 'Thumb 1 octave higher than rank 1.');
    await page.locator('[data-register="-1"] .alternate').first().click();
    assert.equal(await page.locator('#thumb-offset').isVisible(), false);
    await page.locator('#workspace-spelling [data-spelling="flats"]').click();
    await page.locator('[data-pitch="1"]').click();
    assert.equal(await page.locator('#selected-note').textContent(), 'D♭');
    assert.equal(await page.locator('#hear-note').textContent(), 'Hear D♭4');
    await page.locator('#hear-note').click();
    assert.match(await page.locator('#app-status').textContent(), /Reference tone: D♭4/);
    for (const pitch of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
      await page.locator(`[data-pitch="${pitch}"]`).click();
      const shifts = await page.locator('.register-group').evaluateAll(groups => groups.map(group => Number(group.dataset.register)));
      const expected = pitch <= 3 ? [-1, 0] : pitch >= 10 ? [0, 1] : [0];
      assert.deepEqual(shifts, expected, `pitch class ${pitch} shows the highest neutral-position fingering first`);
      assert.equal(await page.locator('#selected-variant').textContent(), 'Rank 1');
    }
    await page.locator('[data-pitch="2"]').focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('#selected-note').textContent(), 'E♭');
    assert.equal(await page.locator(':focus').getAttribute('data-pitch'), '3');

    // A phrase is calculated globally and can be constrained by the user.
    await page.getByRole('button', { name: 'Add E♭4 to melody', exact: true }).click();
    assert.match(await page.locator('#melody').inputValue(), / E♭4$/);
    await page.getByRole('button', { name: 'Across the break', exact: true }).click();
    assert.equal(await page.locator('.phrase-step').count(), 5);
    assert.deepEqual(await page.locator('.phrase-step strong').allTextContents(), ['B4', 'C5', 'D5', 'C5', 'B4']);
    await checkMelodyColumn();
    assert.deepEqual(await keyGeometry('.phrase-step .mini-diagram'), referenceGeometry);
    assert.equal(await page.locator('.phrase-step .mini-diagram > g').first().getAttribute('transform'), 'rotate(-90)');
    await page.screenshot({ path: '/tmp/ewi-redesign/planner-desktop.png' });
    await page.locator('#melody').fill('G4 G5');
    await page.locator('#melody-form').getByRole('button', { name: 'Find fingerings' }).click();
    await page.locator('[data-step="0"]').focus();
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('[data-step="1"]').getAttribute('aria-pressed'), 'true');
    assert.deepEqual(await page.locator('.phrase-thumb').allTextContents(), ['Thumb 0', 'Thumb +1']);
    assert.deepEqual(await page.locator('.phrase-step svg').evaluateAll(diagrams => diagrams.map(svg => svg.getAttribute('aria-label'))),
      ['Touch K1, K3, K4', 'Touch K1, K3, K4']);
    assert.equal(await page.locator('#melody-choices').isVisible(), false);
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#melody-choice-title').textContent(), 'Fingering for G5');
    await page.locator('#step-variant button').nth(1).click();
    assert.match(await page.locator('.phrase-step').nth(1).textContent(), /Locked/);
    await page.locator('#unlock').click();
    assert.equal(await page.locator('#unlock').isDisabled(), true);
    await page.keyboard.press('Escape');
    await page.waitForSelector('[data-step="1"]:focus');
    await page.locator('#melody').fill('C#5 D5 C#5');
    await page.locator('#melody-form').getByRole('button', { name: 'Find fingerings' }).click();
    await page.locator('[data-weight="roller"][data-value="10"]').click();
    assert.match(await page.locator('#plan-summary').textContent(), /0 thumb octave steps/);
    await page.locator('[data-weight="pinky"][data-value="4"]').click();
    await page.locator('[data-weight="unfamiliar"][data-value="3"]').click();
    await page.locator('#play-phrase').click();
    assert.equal(await page.locator('#play-phrase').textContent(), 'Stop');
    await page.locator('#play-phrase').click();
    assert.equal(await page.locator('#play-phrase').textContent(), 'Play phrase');

    // Invalid input never leaves a stale route or injects markup.
    await page.locator('#melody').fill('C4 <script>bad</script>');
    assert.equal(await page.locator('.phrase-step').count(), 0);
    await page.locator('#melody-form').getByRole('button', { name: 'Find fingerings' }).click();
    assert.equal(await page.locator('#melody-error').isVisible(), true);
    assert.equal(await page.locator('#melody-choices').isVisible(), false);
    await page.locator('#open-scales').click();
    await page.getByRole('button', { name: 'Major (Ionian)', exact: true }).click();
    assert.equal(await page.locator('.phrase-step').count(), 8);
    assert.equal(await page.locator('#melody-error').isVisible(), false);
    await page.locator('#open-scales').click();
    await page.getByRole('button', { name: 'Church modes', exact: true }).click();
    assert.deepEqual(await page.locator('[data-scale-type]').allTextContents(), [
      'Ionian (Major)', 'Dorian', 'Phrygian', 'Lydian', 'Mixolydian', 'Aeolian (Natural minor)', 'Locrian',
    ]);
    await page.locator('[data-scale-root="2"]').click();
    await page.getByRole('button', { name: 'Dorian', exact: true }).click();
    assert.equal(await page.locator('#melody').inputValue(), 'D4 E4 F4 G4 A4 B4 C5 D5');
    await page.locator('#open-scales').click();
    await page.getByRole('button', { name: 'Common', exact: true }).click();
    await page.getByRole('button', { name: 'Chromatic', exact: true }).click();
    assert.equal(await page.locator('.phrase-step').count(), 13);
    await page.locator('#open-scales').click();
    await page.getByRole('button', { name: 'Custom', exact: true }).click();
    await page.locator('[data-scale-offset="1"]').click();
    await page.locator('[data-use-custom]').click();
    assert.equal(await page.locator('#melody').inputValue(), 'D4 E♭4 E4 G♭4 G4 A4 B4 D♭5 D5');
    assert.equal(await page.locator('#scale-library').isVisible(), false);

    // The full 64-note phrase stays bounded and all notes render.
    await page.locator('#melody').fill(Array(8).fill('C4 D4 E4 F4 G4 A4 B4 C5').join(' '));
    await page.locator('#melody-form').getByRole('button', { name: 'Find fingerings' }).click();
    assert.equal(await page.locator('.phrase-step').count(), 64);
    await checkMelodyColumn();
    await page.locator('[data-phrase="B4 C5 D5 C5 B4"]').click();

    // Latching input, live staff, and examples must agree across key interactions.
    await page.getByRole('button', { name: 'Key explorer', exact: true }).click();
    assert.equal(await page.locator('#key-note').textContent(), 'D♭5');
    assert.equal(await page.locator('#key-picker .key-map use').count(), 13);
    assert.equal(await page.locator('#key-picker .key-map > rect, #key-picker .key-map > path').count(), 0, 'the map has no instrument body');
    assert.deepEqual(await page.locator('#key-picker [data-key-shape]').evaluateAll(keys => keys.map(key => key.getAttribute('transform'))),
      await page.locator('#main-diagram .diagram-key').evaluateAll(keys => keys.map(key => key.getAttribute('transform'))));
    const lastKey = await page.locator('#key-picker button').last().boundingBox();
    assert.ok(lastKey.y + lastKey.height <= 900, 'all key controls fit on desktop');
    assert.equal(await page.locator('#key-picker .conditional-key').count(), 4);
    assert.equal(await page.locator('#key-picker button.effect-up-one').count(), 3);
    assert.equal(await page.locator('#key-picker button.effect-down-one').count(), 6);
    assert.equal(await page.locator('#key-picker button.effect-down-two').count(), 4);
    assert.deepEqual(await page.locator('#key-picker .key-callout-left .key-callout-name').allTextContents(),
      ['K1', 'K3', 'K4', 'K8', 'K9', 'K10']);
    assert.deepEqual(await page.locator('#key-picker .key-callout-right .key-callout-name').allTextContents(),
      ['K2', 'K5', 'K6', 'K7', 'K11', 'K12', 'K13']);
    const leaderOffsets = await page.locator('#key-picker .key-leader').evaluateAll(lines => lines.map((line, i) => {
      const key = line.parentElement.querySelector(`[data-key-shape="${i}"]`);
      const use = key.querySelector('use');
      const symbol = document.querySelector(use.getAttribute('href'));
      const face = symbol.querySelector('.key-face');
      const viewBox = symbol.viewBox.baseVal;
      const scale = use.width.baseVal.value / viewBox.width;
      const transform = key.transform.baseVal.getItem(0).matrix;
      const onLeft = line.parentElement.parentElement.querySelector(`[data-key="${i}"]`).classList.contains('key-callout-left');
      const isFarther = onLeft ? (a, b) => a < b : (a, b) => a > b;
      let edge = { x: onLeft ? Infinity : -Infinity, y: 0 };
      const perimeter = face.getTotalLength();
      for (let sample = 0; sample < 720; sample++) {
        const point = face.getPointAtLength(perimeter * sample / 720);
        const position = new DOMPoint((point.x - viewBox.x) * scale + use.x.baseVal.value,
          (point.y - viewBox.y) * scale + use.y.baseVal.value);
        const mapped = position.matrixTransform(transform);
        if (isFarther(mapped.x, edge.x)) edge = mapped;
      }
      return Math.hypot(edge.x - line.x2.baseVal.value, edge.y - line.y2.baseVal.value);
    }));
    assert.ok(leaderOffsets.every(offset => offset < 0.25), `leaders meet the outside edge of each key: ${leaderOffsets}`);
    await page.locator('#key-picker [data-key-shape="0"] use').click();
    assert.equal(await page.locator('#key-picker [data-key="0"]').getAttribute('aria-pressed'), 'true');
    await page.locator('#clear-keys').click();
    assert.deepEqual(await page.locator('#pitch-drop-table tbody tr').evaluateAll(rows =>
      rows.map(row => [...row.querySelectorAll('button')].map(button => Number(button.textContent.replace('−', '-'))))
    ), [[0, -1, -2, -4], [-1, -2, -3, -5], [-2, -3, -4, -6], [-3, -4, -5, -7], [-4, -5, -6, -8]]);
    assert.deepEqual(await keyGeometry('#pitch-drop-keys svg'), referenceGeometry);
    await page.locator('#pitch-drop-table [aria-pressed="true"]').focus();
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.locator('#pitch-drop-table [aria-pressed="true"]').getAttribute('aria-label'), 'K3, −1 semitone');
    await page.locator('#pitch-drop-table button').last().click();
    assert.equal(await page.locator('#pitch-drop-held').textContent(), 'K1, K3, K4, K8');
    assert.equal(await page.locator('#pitch-drop-total').textContent(), '−8 semitones');
    assert.equal(await page.locator('#key-note').textContent(), 'F4');
    assert.equal(await page.locator('#key-picker [data-key="1"]').getAttribute('aria-pressed'), 'false');
    await page.locator('#clear-keys').click();
    for (const [index, contribution] of [[0, '−2'], [3, '−2'], [4, '+1']]) {
      assert.equal(await page.locator(`#key-picker [data-key="${index}"] .key-dependencies`).count(), 0);
      const row = page.locator('#key-rule-rows tr').nth(index);
      assert.equal(await row.locator('.usual-rule').textContent(), contribution);
      assert.equal(await row.locator('.rule-kind').textContent(), 'Fixed');
      assert.equal(await row.locator('.rule-exception').count(), 0);
    }
    for (const [index, contribution, condition] of [[1, '−1', 'K1+K3: 0'], [2, '−1', 'K1: −2'], [6, '+1', 'K5: 0'], [7, '−1', 'K4: −2']]) {
      const label = page.locator(`#key-picker [data-key="${index}"]`);
      assert.equal(await label.locator('.key-callout-effect').textContent(), contribution);
      assert.equal(await label.locator('.key-dependencies').textContent(), condition);
      const row = page.locator('#key-rule-rows tr').nth(index);
      assert.equal(await row.locator('.usual-rule').textContent(), contribution);
      assert.equal(await row.locator('.rule-exception').textContent(), condition);
    }
    assert.deepEqual(await page.locator('#key-detail dt').allTextContents(), ['Usual contribution', 'Conditions', 'Net change when added']);
    await page.locator('#key-picker [data-key="7"]').click();
    assert.equal(await page.locator('#key-detail dd').nth(1).textContent(), 'K4: −2');
    await page.locator('#key-picker [data-key="3"]').click();
    assert.match(await page.locator('#key-detail .usual-rule').textContent(), /Lowers 2 semitones/);
    assert.match(await page.locator('#key-detail dd').last().textContent(), /C5 → A4 \(−3\)/);
    assert.equal(await page.locator('#pitch-drop-total').textContent(), '−4 semitones');
    await page.locator('#clear-keys').click();
    await page.locator('#key-picker [data-key-shape="1"] rect').click();
    assert.equal(await page.locator('#key-picker [data-key="1"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#key-held').textContent(), 'Held: K2.');
    assert.equal(await page.locator('#key-note').textContent(), 'C5');
    assert.equal(await page.locator('#pitch-drop-preview').isVisible(), false);
    assert.equal(await page.locator('#pitch-drop-table [aria-pressed="true"]').count(), 0);
    await page.locator('#key-rule-rows [data-key="1"]').press('Enter');
    assert.equal(await page.locator('#key-note').textContent(), 'D♭5');
    await page.locator('#key-picker [data-key="2"]').click();
    assert.equal(await page.locator('#key-note').textContent(), 'C5');
    await page.locator('#key-picker [data-key="0"]').click();
    assert.equal(await page.locator('#key-note').textContent(), 'A4');
    assert.match(await page.locator('#key-detail').textContent(), /C5 → A4 \(−3\)/);
    await page.locator('#key-picker [data-key="1"]').click();
    assert.equal(await page.locator('#key-note').textContent(), 'A4');
    assert.equal(await page.locator('#key-picker [data-key="1"]').getAttribute('aria-pressed'), 'false', 'redundant bis does not latch');
    assert.match(await page.locator('#key-detail').textContent(), /K2 has no effect while K1 and K3 are held/);
    await page.locator('#key-picker [data-key="0"]').click();
    assert.equal(await page.locator('#key-picker [data-key="1"]').getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('#key-note').textContent(), 'C5');
    await page.locator('#clear-keys').click();
    await page.locator('#key-picker [data-key="1"]').press('Enter');
    await page.locator('#key-picker [data-key="2"]').click();
    assert.equal(await page.locator('#key-held').textContent(), 'Held: K2, K3.');
    assert.equal(await page.locator('#key-note').textContent(), 'B4');
    await page.locator('#key-picker [data-key="2"]').click();
    await page.locator('#key-picker [data-key="0"]').click();
    assert.equal(await page.locator('#key-note').textContent(), 'B♭4');
    // Holding K3 with K1 releases the now redundant bis.
    await page.locator('#key-picker [data-key="2"]').click();
    assert.equal(await page.locator('#key-picker [data-key="1"]').getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('#key-note').textContent(), 'A4');
    await page.locator('#clear-keys').click();
    await page.locator('#key-picker [data-key="4"]').click();
    await page.locator('#key-picker [data-key="6"]').click();
    assert.equal(await page.locator('#key-note').textContent(), 'D5', 'shared raise does not add twice');
    await page.locator('#key-picker [data-key="10"]').click();
    assert.equal(await page.locator('#key-note').textContent(), 'E♭5');
    await page.locator('#clear-keys').click();
    for (const index of [0, 2, 3]) await page.locator('#key-picker [data-key="' + index + '"]').click();
    await setKeyRegister(1);
    assert.equal(await page.locator('#key-note').textContent(), 'G5');
    assert.match(await page.locator('#key-staff svg').getAttribute('aria-label'), /G5 on treble clef/);
    await page.locator('#clear-keys').click();
    await setKeyRegister(0);
    for (const index of [0, 2, 3, 7, 8, 9, 12]) await page.locator('#key-picker [data-key="' + index + '"]').click();
    assert.equal(await page.locator('#key-note').textContent(), 'C4');
    assert.equal(await page.locator('#key-staff .staff-ledger').count(), 1);
    await setKeyRegister(-1);
    assert.match(await page.locator('#key-staff svg').getAttribute('aria-label'), /C3 on bass clef/);
    await page.locator('[data-rule-filter="interacting"]').click();
    assert.equal(await page.locator('#key-rule-rows tr').count(), 4);
    await page.locator('[data-rule-filter="fixed"]').click();
    assert.equal(await page.locator('#key-rule-rows tr').count(), 9);
    await page.locator('[data-rule-filter="all"]').click();
    await setKeyRegister(0);
    await page.locator('#clear-keys').click();
    await setKeyRegister(4);
    assert.equal(await page.locator('#key-range').isVisible(), true);
    assert.equal(await page.locator('#hear-keys').isDisabled(), true);
    await setKeyRegister(0);

    // Keyboard and click access to every key description.
    for (let i = 0; i < 13; i++) {
      await page.locator(`#key-picker [data-key="${i}"]`).click();
      assert.match(await page.locator('#key-detail h3').textContent(), new RegExp(`^K${i + 1} ·`));
    }
    await page.locator('#key-picker [data-key="2"]').focus();
    await page.keyboard.press('Enter');
    assert.match(await page.locator('#key-detail h3').textContent(), /^K3/);
    assert.equal(await page.locator(':focus').getAttribute('data-key'), '2');
    await page.screenshot({ path: '/tmp/ewi-redesign/guide-desktop.png' });

    await page.locator('[data-view="moves"]').click();
    assert.deepEqual(await keyGeometry('.move-key-line .mini-diagram'), referenceGeometry);
    assert.equal(await page.locator('#move-matrix button').count(), 306);
    assert.equal(await page.locator('#move-matrix th[scope="row"]').first().textContent(), 'E♭5');
    assert.equal(await page.locator('#move-matrix th[scope="row"]').last().textContent(), 'B♭3');
    assert.match(await page.locator('#move-result').textContent(), /B♭4 → B4/);
    assert.match(await page.locator('#move-result .move-grid').textContent(), /ReleaseK2/);
    await page.locator('#move-matrix [data-from="60"][data-to="71"]').click();
    assert.equal(await page.locator('#move-matrix [aria-pressed="true"]').textContent(), '5');
    await page.keyboard.press('ArrowLeft');
    assert.match(await page.locator('#move-result').textContent(), /C4 → C5/);
    await page.locator('#move-matrix [data-from="58"][data-to="75"]').click();
    assert.match(await page.locator('#move-result h2').textContent(), /B♭3 → E♭5/);
    assert.equal(await page.locator('#move-matrix [aria-pressed="true"]').textContent(), '11');
    await page.locator('[data-move-option="1"]').click();
    await page.locator('#workspace-spelling [data-spelling="sharps"]').click();
    assert.equal(await page.locator('#move-result h2').textContent(), 'A♯3 → D♯5');
    assert.equal(await page.locator('[data-move-option="1"]').getAttribute('aria-pressed'), 'true');
    await page.locator('[data-view="plan"]').click();
    assert.equal(await page.locator('#workspace-spelling [data-spelling="sharps"]').getAttribute('aria-pressed'), 'true');
    await page.locator('#workspace-spelling [data-spelling="flats"]').click();
    await page.locator('[data-view="moves"]').click();
    assert.equal(await page.locator('#move-result h2').textContent(), 'B♭3 → E♭5');

    for (const viewport of [{ width: 375, height: 812 }, { width: 844, height: 390 }, { width: 320, height: 740 }, { width: 768, height: 1024 }]) {
      await page.setViewportSize(viewport);
      for (const view of ['explore', 'plan', 'guide', 'moves']) {
        await page.locator(`[data-view="${view}"]`).click();
        assert.equal(await page.locator('#workspace-spelling').isVisible(), true);
        if (view === 'plan') await checkMelodyColumn();
        if (view === 'explore' && viewport.width <= 375) {
          const proportion = await page.locator('.ranked-rows .alternate svg').first()
            .evaluate(svg => svg.getBoundingClientRect().width / innerWidth);
          assert.ok(proportion >= 2 / 3 && proportion <= 3 / 4, `wide diagrams fit at ${viewport.width}px`);
        }
        const header = await page.locator('#workspace-spelling').evaluate(group => {
          const bounds = group.getBoundingClientRect();
          const breadcrumb = group.parentElement.querySelector('nav').getBoundingClientRect();
          const inset = parseFloat(getComputedStyle(group.parentElement).paddingRight);
          return { insetError: Math.abs(innerWidth - inset - bounds.right), overlaps: bounds.left < breadcrumb.right };
        });
        assert.ok(header.insetError < 1 && !header.overlaps, `spelling controls fit at the right on ${view} at ${viewport.width}px`);
        const overflow = await page.evaluate(() => ({
          width: innerWidth, scroll: document.documentElement.scrollWidth, x: scrollX,
          outside: [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1 && el.getBoundingClientRect().width).slice(0, 8).map(el => ({ tag: el.tagName, id: el.id, right: Math.round(el.getBoundingClientRect().right) })),
        }));
        assert.ok(overflow.scroll <= overflow.width, `${view} overflows ${viewport.width}: ${JSON.stringify(overflow)}`);
        const tiny = await page.locator(`#${view} button:visible, #${view} textarea:visible`).evaluateAll(elements => elements.filter(el => {
          const rect = el.getBoundingClientRect();
          if (el.closest('.move-matrix')) return rect.width < 24 || rect.height < 30;
          return rect.width < 43.5 || rect.height < 43.5;
        }).map(el => el.id || el.textContent.slice(0, 20)));
        assert.deepEqual(tiny, [], `small touch targets ${view} ${viewport.width}`);
        if (viewport.width === 375) await page.screenshot({ path: `/tmp/ewi-redesign/${view}-mobile.png`, fullPage: true });
      }
      if (viewport.height > viewport.width) {
        await page.locator('[data-view="plan"]').click();
        await page.locator('#open-scales').click();
        await page.getByRole('button', { name: 'Church modes', exact: true }).click();
        const layout = await page.locator('#scale-library').evaluate(dialog => {
          const bounds = dialog.getBoundingClientRect();
          return {
            overflow: dialog.scrollHeight - dialog.clientHeight,
            cramped: [...dialog.querySelectorAll('button')].flatMap(button => {
              const rect = button.getBoundingClientRect();
              return rect.width < 43.5 || rect.height < 43.5 || rect.right > bounds.right
                ? [{ label: button.textContent, width: rect.width, height: rect.height, right: rect.right - bounds.right }]
                : [];
            }),
          };
        });
        assert.deepEqual(layout, { overflow: 0, cramped: [] }, `scale controls fit ${viewport.width}px portrait`);
        await page.locator('#close-scales').click();
      }
    }
    // A normal persistence reload, and a privacy mode where storage throws.
    await page.getByRole('button', { name: 'Fingerings', exact: true }).click();
    await page.locator('[data-pitch="7"]').click();
    await page.reload(); await openFingerings();
    assert.equal(await page.locator('#selected-note').textContent(), 'G');
    await page.locator('#workspace-spelling [data-spelling="sharps"]').click();
    await page.reload(); await openFingerings();
    assert.equal(await page.locator('#workspace-spelling [data-spelling="sharps"]').getAttribute('aria-pressed'), 'true', 'spelling survives reload');
    await page.evaluate(() => {
      localStorage.removeItem('ewi-practice-v3');
      localStorage.removeItem('ewi-practice-v2');
      localStorage.setItem('ewi-practice-v1', JSON.stringify({ midi: 73, flats: false, phrase: 'C4 D4' }));
    });
    await page.reload(); await openFingerings();
    assert.equal(await page.locator('#selected-note').textContent(), 'D♭', 'old implicit sharp default migrates to flats');
    assert.equal(await page.locator('#hear-note').textContent(), 'Hear D♭4', 'saved octave maps to the chart reference');
    assert.equal(await page.locator('#melody').inputValue(), 'C4 D4');
    await page.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new Error('Disabled by browser'); } }));
    await page.reload(); await openFingerings();
    assert.equal(await page.locator('#selected-note').textContent(), 'G');
    assert.deepEqual(failures, []);
    console.log('PASS: pitch-class chart, bis constraint, all 13 keys, global phrase planning, locks, audio, privacy fallback, and four responsive layouts.');
  } finally { await browser.close(); await site.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
