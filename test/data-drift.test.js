/**
 * The guard that makes externalised assumptions safe.
 *
 * /data/*.json is the source of truth a non-developer edits. defaults.js is
 * the inline mirror that keeps the page working from file:// and offline.
 * Two copies of the same numbers is exactly the arrangement that rots.
 *
 * It does not rot here, because this test fails the moment they diverge and
 * tells you which file to fix. That is the whole argument for keeping the
 * mirror: the duplication is real, but it is checked.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { FARE_DEFAULTS, PARKING_DEFAULTS } from '../defaults.js';

const readJson = async (relative) =>
  JSON.parse(await readFile(fileURLToPath(new URL(relative, import.meta.url)), 'utf8'));

describe('data files and their inline mirror', () => {
  test('fare-defaults.json matches FARE_DEFAULTS', async () => {
    const json = await readJson('../data/fare-defaults.json');
    assert.deepEqual(
      json,
      FARE_DEFAULTS,
      'data/fare-defaults.json and defaults.js have drifted apart. ' +
        'The JSON is the source of truth — update the mirror to match it.',
    );
  });

  test('parking-defaults.json matches PARKING_DEFAULTS', async () => {
    const json = await readJson('../data/parking-defaults.json');
    assert.deepEqual(
      json,
      PARKING_DEFAULTS,
      'data/parking-defaults.json and defaults.js have drifted apart. ' +
        'The JSON is the source of truth — update the mirror to match it.',
    );
  });
});

describe('the assumption files stay usable', () => {
  test('every destination has a label, a source and a rate or an explicit null', async () => {
    const { destinations } = await readJson('../data/parking-defaults.json');
    assert.ok(destinations.length >= 6, 'six destination categories were specified');
    for (const d of destinations) {
      assert.ok(d.id, 'destination needs an id');
      assert.ok(d.label, `${d.id} needs a label`);
      // shortLabel is what the verdict copy reads mid-sentence ("parking at a
      // heartland mall is the killer"), so the long dropdown label with its
      // example carparks cannot be reused there.
      assert.ok(d.shortLabel, `${d.id} needs a shortLabel for the verdict copy`);
      assert.ok(d.source, `${d.id} needs a stated source — the UI shows it to the user`);
      assert.ok(
        d.rate === null || (typeof d.rate === 'number' && d.rate >= 0),
        `${d.id} rate must be a non-negative number or an explicit null`,
      );
    }
  });

  test('exactly one destination opts out of auto-fill', async () => {
    const { destinations } = await readJson('../data/parking-defaults.json');
    const nulls = destinations.filter((d) => d.rate === null);
    assert.equal(nulls.length, 1, 'only the "somewhere else" option should have no default rate');
  });

  test('assumptions carry a version and a review date', async () => {
    const fares = await readJson('../data/fare-defaults.json');
    assert.match(fares.assumptionsVersion, /^\d{4}\.\d{2}$/, 'version is year.month');
    assert.match(fares.lastReviewed, /^\d{4}-\d{2}-\d{2}$/, 'review date is ISO');
  });

  test('every heuristic block explains itself', async () => {
    // If a constant cannot say why it is what it is, it should not be shipped
    // as fact. The UI reads these caveats straight out of the file.
    const fares = await readJson('../data/fare-defaults.json');
    for (const key of ['grabEstimate', 'speeds', 'verdict', 'limits']) {
      assert.ok(fares[key].caveat, `${key} needs a caveat`);
    }
    const parking = await readJson('../data/parking-defaults.json');
    assert.ok(parking.caveat);
    assert.ok(parking.upgradePath, 'H1 must state how it stops being a heuristic');
  });
});
