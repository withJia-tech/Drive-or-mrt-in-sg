/**
 * Unit tests for the deterministic layer (handoff section 5.1).
 *
 * Run: node --test test/
 * No framework, no dependencies — node's built-in runner is enough for ten
 * pure functions, and adding Jest here would be the more expensive mistake.
 *
 * The handoff's own framing is the reason these exist: "If any of these are
 * wrong, it is a defect, not a disagreement." Defects get tests. The
 * heuristics in 5.2 deliberately do not — you cannot unit-test a guess, you
 * can only label it, which the UI does instead.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  toNumber, round2,
  petrolCost, parkingCost, driveTotal,
  mrtTotal, walkCost, grabTotal, estimateGrabFare,
  selectWinner, parkingShare, verdictBand,
  journeyTimes, computeAll, shareString,
} from '../calc.js';

import { FARE_DEFAULTS } from '../defaults.js';

/**
 * The worked example used throughout: a 12 km trip to a hospital, parked
 * three hours at $2/hr. Chosen because it is the exact case in the handoff's
 * product summary — a three-hour hospital visit costing more in parking than
 * the whole petrol bill.
 */
const TRIP = {
  distance: 12,
  fuelEconomy: 12,
  petrolPrice: 3.0,
  parkRate: 2.0,
  parkHours: 3,
  erp: 0,
  mrtFare: 1.8,
  walkTime: 10,
  hourlyRate: 25,
  grabFare: null,
};

describe('input coercion', () => {
  test('blank, junk and missing input fall back', () => {
    assert.equal(toNumber('', 7), 7);
    assert.equal(toNumber(null, 7), 7);
    assert.equal(toNumber(undefined, 7), 7);
    assert.equal(toNumber('not a number', 7), 7);
    assert.equal(toNumber(NaN, 7), 7);
    assert.equal(toNumber(Infinity, 7), 7);
  });

  test('negative distance is rejected, not passed through', () => {
    // A negative distance would otherwise produce a negative petrol cost and
    // silently make driving look free.
    assert.equal(toNumber(-5, 0), 0);
    assert.equal(toNumber('-5', 0), 0);
  });

  test('absurd values clamp to the stated ceiling', () => {
    assert.equal(toNumber(500, 0, 72), 72); // 500 hours parked
    assert.equal(toNumber(9999, 0, 300), 300); // 9999 km across Singapore
  });

  test('zero is a real value, not a blank', () => {
    assert.equal(toNumber(0, 7), 0);
    assert.equal(toNumber('0', 7), 0);
  });

  test('round2 rounds half up at the cent', () => {
    assert.equal(round2(8.333333), 8.33);
    assert.equal(round2(8.335), 8.34);
    assert.equal(round2(1.005), 1.01); // the classic float case
  });
});

describe('D1-D6 — the arithmetic', () => {
  test('D1 petrol doubles the one-way distance', () => {
    // (12 x 2 / 12) x 3.00 = 6.00
    assert.equal(petrolCost(TRIP), 6);
  });

  test('D1 does not divide by zero when fuel economy is missing', () => {
    assert.equal(petrolCost({ ...TRIP, fuelEconomy: 0 }), 0);
  });

  test('D2 parking is rate x hours', () => {
    assert.equal(parkingCost(TRIP), 6);
  });

  test('D3 drive total is petrol + parking + ERP', () => {
    assert.equal(driveTotal(TRIP), 12);
    assert.equal(driveTotal({ ...TRIP, erp: 3 }), 15);
  });

  test('D4 MRT fare is doubled for the return leg', () => {
    assert.equal(mrtTotal(TRIP), 3.6);
  });

  test('D5 walk cost values both legs', () => {
    // (10 x 2 / 60) x 25 = 8.333...
    assert.equal(round2(walkCost(TRIP)), 8.33);
  });

  test('D6 Grab fare is doubled', () => {
    assert.equal(grabTotal({ grabFare: 10.1 }), 20.2);
  });

  test('H2 estimates a one-way Grab fare from distance', () => {
    // 3.50 + 0.55 x 12 = 10.10
    assert.equal(round2(estimateGrabFare(TRIP, FARE_DEFAULTS.grabEstimate)), 10.1);
  });
});

describe('D7 — winner selection', () => {
  test('picks the cheapest', () => {
    assert.equal(selectWinner({ drive: 12, mrt: 3.6, grab: 20.2 }), 'mrt');
    assert.equal(selectWinner({ drive: 4, mrt: 9, grab: 20 }), 'drive');
    assert.equal(selectWinner({ drive: 40, mrt: 30, grab: 20 }), 'grab');
  });

  test('a dead heat resolves to the train', () => {
    // Documented tie-break: on identical totals the train is the better default.
    assert.equal(selectWinner({ drive: 10, mrt: 10, grab: 10 }), 'mrt');
    assert.equal(selectWinner({ drive: 10, mrt: 10, grab: 99 }), 'mrt');
  });
});

describe('D8 — parking share', () => {
  test('parking as a fraction of the drive total', () => {
    assert.equal(parkingShare({ parking: 6, drive: 12 }), 0.5);
  });

  test('free parking does not divide by zero', () => {
    assert.equal(parkingShare({ parking: 0, drive: 0 }), 0);
  });
});

describe('D9 — verdict bands', () => {
  const t = FARE_DEFAULTS.verdict.thresholdSgd; // 5

  test('driving much dearer means the train wins', () => {
    assert.equal(verdictBand({ drive: 12, mrt: 3.6 }, t), 'mrt-wins');
  });

  test('driving much cheaper means drive', () => {
    assert.equal(verdictBand({ drive: 3, mrt: 12 }, t), 'drive-wins');
  });

  test('the band is exclusive at both edges', () => {
    // Exactly $5 apart is inside the band, not outside it.
    assert.equal(verdictBand({ drive: 10, mrt: 5 }, t), 'line-ball');
    assert.equal(verdictBand({ drive: 5, mrt: 10 }, t), 'line-ball');
    assert.equal(verdictBand({ drive: 10.01, mrt: 5 }, t), 'mrt-wins');
    assert.equal(verdictBand({ drive: 5, mrt: 10.01 }, t), 'drive-wins');
  });
});

describe('journey times', () => {
  test('each mode uses its own assumed speed, over the return journey', () => {
    const times = journeyTimes(TRIP, FARE_DEFAULTS.speeds);
    assert.equal(round2(times.drive), 40); // 12/40*60*2 + 4 parking
    assert.equal(round2(times.mrt), 77.6); // 12/25*60*2 + 10*2 walking
    assert.equal(round2(times.grab), 42); // 12/40*60*2 + 6 waiting
  });

  test('times are return figures, matching the costs', () => {
    // Every cost in this calculator is a return figure. A one-way time
    // printed beside a return cost invites exactly the wrong comparison.
    const single = journeyTimes({ distance: 10, walkTime: 0 }, FARE_DEFAULTS.speeds);
    const double = journeyTimes({ distance: 20, walkTime: 0 }, FARE_DEFAULTS.speeds);
    const buffer = FARE_DEFAULTS.speeds.driveBufferMin;
    assert.equal(double.drive - buffer, (single.drive - buffer) * 2);
  });
});

describe('computeAll — the whole layer', () => {
  test('the hospital case', () => {
    const r = computeAll(TRIP, FARE_DEFAULTS);
    assert.equal(r.petrol, 6);
    assert.equal(r.parking, 6);
    assert.equal(r.drive, 12);
    assert.equal(r.mrt, 3.6);
    assert.equal(r.grab, 20.2);
    assert.equal(r.walk, 8.33);
    assert.equal(r.mrtWithWalk, 11.93); // 3.60 fare + 8.33 walk, shown separately
    assert.equal(r.winner, 'mrt');
    assert.equal(r.parkingShare, 0.5);
    assert.equal(r.band, 'mrt-wins');
    assert.equal(r.delta, 8.4);
  });

  test('parking outweighs the entire petrol bill — the product premise', () => {
    const r = computeAll(TRIP, FARE_DEFAULTS);
    assert.ok(r.parking >= r.petrol);
  });

  test('a blank Grab fare is estimated and flagged as such', () => {
    const r = computeAll({ ...TRIP, grabFare: null }, FARE_DEFAULTS);
    assert.equal(r.grabEstimated, true);
    assert.equal(r.grabFareOneWay, 10.1);
  });

  test('a supplied Grab fare is used verbatim and not flagged', () => {
    const r = computeAll({ ...TRIP, grabFare: 14 }, FARE_DEFAULTS);
    assert.equal(r.grabEstimated, false);
    assert.equal(r.grab, 28);
  });

  test('walk cost is never folded into the MRT total (H8)', () => {
    const r = computeAll(TRIP, FARE_DEFAULTS);
    assert.equal(r.mrt, mrtTotal(TRIP)); // fare only
    assert.ok(r.walk > 0); // but still reported
    assert.notEqual(r.mrt, round2(mrtTotal(TRIP) + walkCost(TRIP)));
  });

  test('trip context cannot reach the numbers', () => {
    // The acceptance criterion is that the three totals are byte-identical
    // with and without a context chip. computeAll never receives it, so the
    // guarantee is structural — this test locks that structure in place.
    const withContext = computeAll({ ...TRIP, tripContext: 'medical' }, FARE_DEFAULTS);
    const without = computeAll({ ...TRIP }, FARE_DEFAULTS);
    assert.deepEqual(withContext, without);
  });

  test('zero parking still produces a usable result', () => {
    const r = computeAll({ ...TRIP, parkRate: 0, parkHours: 0 }, FARE_DEFAULTS);
    assert.equal(r.parking, 0);
    assert.equal(r.drive, 6);
    assert.equal(r.parkingShare, 0);
  });
});

describe('D10 — share string', () => {
  const build = (overrides = {}, destinationLabel = 'public hospital') => {
    const input = { ...TRIP, ...overrides };
    const result = computeAll(input, FARE_DEFAULTS);
    return shareString({
      input,
      result,
      destinationLabel,
      verdict: 'MRT saves $8.40 vs driving. Door-to-door — your call.',
      assumptionsVersion: FARE_DEFAULTS.assumptionsVersion,
    });
  };

  test('carries all three totals', () => {
    const s = build();
    assert.match(s, /🚗 Drive: \$12\.00/);
    assert.match(s, /🚇 MRT: \$3\.60/);
    assert.match(s, /🚕 Grab: \$20\.20/);
  });

  test('itemises what makes the drive total', () => {
    assert.match(build(), /\(petrol \$6\.00 \+ parking \$6\.00\)/);
  });

  test('includes ERP only when there is any', () => {
    assert.doesNotMatch(build(), /ERP/);
    assert.match(build({ erp: 3 }), /\+ ERP \$3\.00\)/);
  });

  test('labels an estimated Grab fare', () => {
    assert.match(build({ grabFare: null }), /🚕 Grab: \$20\.20 \(est\)/);
    assert.doesNotMatch(build({ grabFare: 14 }), /\(est\)/);
  });

  test('names the destination when there is one', () => {
    assert.match(build(), /public hospital \(3h parking\):/);
  });

  test('falls back to the distance when no destination was picked', () => {
    assert.match(build({}, null), /12km trip \(3h parking\):/);
  });

  test('stamps the assumptions version so a stale share is readable', () => {
    assert.match(build(), /assumptions 2026\.08/);
  });

  test('says plainly that it is an estimate', () => {
    assert.match(build(), /estimates only/i);
  });

  test('contains no tabs or padded columns', () => {
    // WhatsApp and Telegram both collapse runs of whitespace and render in a
    // variable-width font, so any alignment faked here arrives broken.
    const s = build();
    assert.doesNotMatch(s, /\t/);
    assert.doesNotMatch(s, / {2,}/);
  });
});
