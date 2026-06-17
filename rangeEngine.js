import { CALCULATOR_TABLES } from './calculator-tables.js';

const STAT_KEYS = {
  CON: 'con',
  EYE: 'eye',
  POW: 'pow',
  SPD: 'spd',
  MOV: 'con',
  CMD: 'eye',
  VEL: 'pow',
  AWR: 'spd',
};

function num(value, fallback = 5) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundDown(value) {
  return Math.floor(value);
}

function clampRatingDelta(delta) {
  if (delta > 5) {
    return 5;
  }
  if (delta < -5) {
    return -5;
  }
  return delta;
}

function readStatValue(stats, key, { emptyDefault = 5 } = {}) {
  if (!stats || !key) {
    return emptyDefault;
  }

  const rawValue = stats[STAT_KEYS[key]];
  if (rawValue === '' || rawValue === null || rawValue === undefined) {
    return emptyDefault;
  }

  const raw = typeof rawValue === 'string' ? rawValue.trim() : String(rawValue);
  if (!raw) {
    return emptyDefault;
  }

  return num(raw, emptyDefault);
}

function readPitcherStatForDelta(key, pitcherStats) {
  // Gameplay calculator row X3 (MOV) is not populated from the player import;
  // Hit/K deltas use CON vs an empty MOV cell, matching the live sheet.
  if (key === 'MOV') {
    return 0;
  }

  return readStatValue(pitcherStats, key, { emptyDefault: 0 });
}

function getHlEntry(code) {
  if (code === '1B') {
    return CALCULATOR_TABLES.hlLookup.find((entry) => entry.code === 'Hit');
  }
  return CALCULATOR_TABLES.hlLookup.find((entry) => entry.code === code);
}

function computeRatingDelta(code, batterStats, pitcherStats) {
  const entry = getHlEntry(code);
  if (!entry) {
    return 0;
  }

  const batterValue = readStatValue(batterStats, entry.batterKey, { emptyDefault: 5 });
  const pitcherValue = readPitcherStatForDelta(entry.pitcherKey, pitcherStats);
  return clampRatingDelta(batterValue - pitcherValue);
}

function matrixValue(matrixCode, ratingDelta) {
  const rowIndex = CALCULATOR_TABLES.resultCodes.indexOf(matrixCode);
  const colIndex = CALCULATOR_TABLES.ratingHeaders.indexOf(ratingDelta);
  if (rowIndex < 0 || colIndex < 0) {
    return 0;
  }
  return CALCULATOR_TABLES.ratingMatrix[rowIndex][colIndex] ?? 0;
}

function sumModifiers(code) {
  return CALCULATOR_TABLES.modifiers
    .filter((entry) => entry.code === code)
    .reduce((total, entry) => total + entry.value, 0);
}

function platoonMultiplier(batterHand, pitcherHand) {
  const { N9 } = CALCULATOR_TABLES.constants;
  const batter = (batterHand || '').trim().toUpperCase();
  const pitcher = (pitcherHand || '').trim().toUpperCase();
  if (!batter || !pitcher) {
    return 1;
  }
  if (batter === 'S') {
    return 1;
  }
  if (batter === pitcher) {
    return 1 - N9;
  }
  return 1 + N9;
}

function lookupAdjustmentRow(lookupValue, rowValues) {
  const headers = CALCULATOR_TABLES.adjustmentHeaders;
  const index = headers.indexOf(lookupValue);
  if (index < 0) {
    return 0;
  }

  const value = rowValues[index];
  return value ?? 0;
}

function lookupAdjustmentRow43(ratingDelta) {
  const headers = CALCULATOR_TABLES.adjustmentHeaders;
  const index = headers.indexOf(ratingDelta);
  if (index < 0) {
    return 0;
  }

  const value = CALCULATOR_TABLES.adjustmentRow43[index];
  return value ?? 0;
}

function computeSimpleWSize(matrixCode, hlCode, ratingDelta, platoonMult) {
  const base = matrixValue(matrixCode, ratingDelta) + sumModifiers(hlCode);
  return Math.max(1, roundDown(base * platoonMult));
}

function computeBaseUSizes(batterStats, pitcherStats, platoonMult, infieldIn = false) {
  const sizes = {};
  const pitcherAwr = readStatValue(pitcherStats, 'AWR', { emptyDefault: 5 });

  sizes.HR = computeSimpleWSize('HR', 'HR', computeRatingDelta('HR', batterStats, pitcherStats), platoonMult);
  sizes['3B'] = computeSimpleWSize('3B', '3B', computeRatingDelta('3B', batterStats, pitcherStats), platoonMult);
  sizes['2B'] = computeSimpleWSize('2B', '2B', computeRatingDelta('2B', batterStats, pitcherStats), platoonMult);

  const hitDelta = computeRatingDelta('1B', batterStats, pitcherStats);
  const twoBDelta = computeRatingDelta('2B', batterStats, pitcherStats);
  const hitBase = roundDown(matrixValue('Hit', hitDelta) * platoonMult);
  const oneBAdjust = lookupAdjustmentRow43(hitDelta)
    + lookupAdjustmentRow(twoBDelta, CALCULATOR_TABLES.adjustmentRow40)
    + lookupAdjustmentRow(pitcherAwr - 3, CALCULATOR_TABLES.adjustmentRow41)
    + CALCULATOR_TABLES.oneBBaseAdjust
    - sizes.HR
    - sizes['3B']
    - sizes['2B']
    + (infieldIn ? 20 : 0);
  sizes['1B'] = Math.max(1, hitBase + oneBAdjust);

  sizes.IF1B = computeSimpleWSize('IF1B', 'IF1B', computeRatingDelta('IF1B', batterStats, pitcherStats), platoonMult);
  sizes.BB = computeSimpleWSize('BB', 'BB', computeRatingDelta('BB', batterStats, pitcherStats), platoonMult);

  const hitTop = sizes.HR + sizes['3B'] + sizes['2B'] + sizes['1B'] + sizes.IF1B + sizes.BB;
  const pool = 500 - hitTop;
  const foDelta = computeRatingDelta('FO', batterStats, pitcherStats);
  const poDelta = computeRatingDelta('PO', batterStats, pitcherStats);
  const foRate = matrixValue('FO', foDelta);
  const poRate = matrixValue('PO', poDelta);
  sizes.FO = Math.max(1, roundDown((pool * foRate) - (pool * foRate * poRate)));
  sizes.PO = Math.max(1, roundDown((500 - sizes.BB) * foRate * poRate));
  sizes.K = computeSimpleWSize('K', 'K', computeRatingDelta('K', batterStats, pitcherStats), platoonMult);

  const allocated = sizes.HR + sizes['3B'] + sizes['2B'] + sizes['1B']
    + sizes.IF1B + sizes.BB + sizes.FO + sizes.PO + sizes.K;
  sizes.GO = 500 - allocated - CALCULATOR_TABLES.constants.W21 + 1;
  sizes.LO = 0;
  return sizes;
}

function isBlank(value) {
  return value === '' || value === null || value === undefined;
}

function hasRunner(value) {
  return !isBlank(value) && num(value, 0) > 0;
}

function buildRunnerSpeeds({ onFirst, onSecond, onThird, runnerSpeed }) {
  const speed = num(runnerSpeed, 5);
  return {
    Z11: onFirst ? speed : 0,
    Z12: onSecond ? speed : '',
    Z13: onThird ? speed : '',
  };
}

function buildRunnerContext(runners, options = {}) {
  const { C74, C75, C76, C77 } = CALCULATOR_TABLES.constants;
  const q5 = options.q5 ?? 0;
  const q7 = options.hitAndRun ?? false;
  const ac17 = options.infieldIn ?? false;
  const { Z11, Z12, Z13 } = runners;

  const G75 = q5 === 2 ? C76 : (q7 ? C77 : 1);
  const F75 = isBlank(Z12) ? Z11 : Z12;
  const F76 = isBlank(Z11) ? '' : (num(Z11, 0) > num(Z12, 0) ? Z12 : Z11);

  function runnerRate(speedValue) {
    if (isBlank(speedValue)) {
      return '';
    }
    const speed = num(speedValue, 0);
    const delta = speed - 3;
    const factor = delta < 0 ? 0.5 : 1;
    return (C74 + (delta * factor * C75)) * G75;
  }

  const H75 = isBlank(F75) ? '' : runnerRate(F75);
  const H76 = isBlank(F76) ? '' : runnerRate(F76);
  const I75 = isBlank(Z12) ? 0 : (
    q5 === 2 ? 0 : C74 + (((num(F75, 0) - 3) * (num(F75, 0) - 3 < 0 ? 0.5 : 1)) * C75)
  );

  return {
    q5,
    q7,
    ac17,
    Z11,
    Z12,
    Z13,
    H75,
    H76,
    I75,
    runnerCount: [Z11, Z12, Z13].filter((value) => hasRunner(value)).length,
    u22: false,
  };
}

function computeRangeRows(uSizes, ctx) {
  const entries = [];
  const { ac17, q5, u22 } = ctx;
  const { U37, V21 } = CALCULATOR_TABLES.constants;
  const goRateMap = Object.fromEntries(
    CALCULATOR_TABLES.goRates.map((entry) => [entry.code, entry.rate]),
  );

  const T = {};
  const V = {};

  function push(result, order, finalValue) {
    if (finalValue > 0) {
      entries.push({ result, order, range: finalValue });
    }
  }

  T[26] = 1;
  V[26] = uSizes.HR;
  push('HR', 1, V[26]);

  T[28] = 1;
  V[28] = uSizes['3B'];
  push('3B', 2, V[28]);

  T[30] = ctx.Z11 === 0 || ctx.Z11 === '' ? 0 : (isBlank(ctx.H76) ? num(ctx.H75, 0) : num(ctx.H76, 0));
  V[30] = roundDown(uSizes['2B'] * num(T[30], 0));
  push('2BWH', 3, V[30]);

  T[31] = 1 - num(T[30], 0);
  V[31] = uSizes['2B'] - V[30];
  push('2B', 4, V[31]);

  const runnersOnFirstSecond = (hasRunner(ctx.Z11) ? 1 : 0) + (hasRunner(ctx.Z12) ? 1 : 0);
  T[33] = runnersOnFirstSecond === 0
    ? 0
    : (isBlank(ctx.H76) ? (isBlank(ctx.H75) ? 0 : num(ctx.H75, 0)) : num(ctx.H76, 0));
  V[33] = roundDown(num(T[33], 0) * uSizes['1B']) + (ctx.q7 && ac17 ? U37 : 0);
  push('1BWH', 5, V[33]);

  T[34] = (!hasRunner(ctx.Z12) || !hasRunner(ctx.Z11))
    ? 0
    : (num(ctx.H75, 0) === num(ctx.H76, 0) ? 0 : num(ctx.H75, 0) - num(ctx.H76, 0));
  V[34] = roundDown(num(T[34], 0) * uSizes['1B']);
  push('1BWH2', 6, V[34]);

  T[35] = 1 - num(T[33], 0) - num(T[34], 0);
  V[35] = uSizes['1B'] - V[33] - V[34] + (ac17 ? U37 : 0);
  push('1B', 7, V[35]);

  T[37] = ac17 ? 0 : 1;
  V[37] = roundDown(num(T[37], 0) * uSizes.IF1B);
  push('IF1B', 8, V[37]);

  T[39] = 1;
  V[39] = uSizes.BB;
  push('BB', 9, V[39]);

  T[41] = q5 === 2 ? 0 : ((!hasRunner(ctx.Z13) || !hasRunner(ctx.Z12)) ? 0 : ctx.I75);
  V[41] = roundDown(num(T[41], 0) * uSizes.FO);
  push('DSacF', 11, V[41]);

  T[42] = q5 === 2 ? 0 : (!hasRunner(ctx.Z12) ? 0 : (num(T[41], 0) > 0 ? 0 : ctx.I75));
  V[42] = roundDown(num(T[42], 0) * uSizes.FO);
  push('DFO', 12, V[42]);

  const runnersOnSecondThird = (hasRunner(ctx.Z12) ? 1 : 0) + (hasRunner(ctx.Z13) ? 1 : 0);
  T[43] = runnersOnSecondThird === 0
    ? 0
    : (q5 === 2 ? 0 : (!hasRunner(ctx.Z13) ? 0 : 1 - num(T[41], 0)));
  V[43] = num(T[43], 0) === 0 ? 0 : uSizes.FO - V[41] - V[42];
  push('SacF', 13, V[43]);

  T[44] = q5 === 2
    ? 1
    : (num(T[43], 0) > 0 ? 0 : (ctx.runnerCount === 0 ? 1 : 1 - num(T[42], 0) - num(T[41], 0)));
  V[44] = num(T[43], 0) > 0 ? 0 : uSizes.FO - V[41] - V[42] - V[43];
  push('FO', 14, V[44]);

  T[46] = 1;
  V[46] = uSizes.PO;
  push('PO', 15, V[46]);

  if (q5 !== 2) {
    let usedGo = 0;
    const goRows = [
      { row: 48, code: 'GORA', order: 16 },
      { row: 49, code: 'FCH', order: 17 },
      { row: 50, code: 'FC', order: 18 },
      { row: 52, code: 'FC3rd', order: 20 },
      { row: 53, code: 'DPRun', order: 21 },
      { row: 54, code: 'DP', order: 22 },
      { row: 55, code: 'DP21', order: 23 },
      { row: 56, code: 'DP31', order: 24 },
      { row: 57, code: 'DPH1', order: 25 },
    ];

    goRows.forEach(({ row, code, order }) => {
      T[row] = goRateMap[code] ?? 0;
      if (num(T[row], 0) > 0) {
        V[row] = roundDown(num(T[row], 0) * uSizes.GO);
        usedGo += V[row];
        push(code, order, V[row]);
      }
    });

    V[51] = Math.max(0, uSizes.GO - usedGo);
    push('GO', 19, V[51]);
  }

  T[59] = 1;
  V[59] = uSizes.K;
  push('K', 26, V[59]);

  T[62] = q5 > 0 ? 0 : (hasRunner(ctx.Z12) && hasRunner(ctx.Z11) ? 1 : 0);
  T[63] = !u22 ? 0 : (num(T[62], 0) > 0 ? 0 : (q5 > 0 ? 0 : (ctx.runnerCount < 2 ? 0 : 0.25)));
  T[61] = num(T[62], 0) > 0 ? 0 : (
    q5 > 1 ? 0 : (ctx.runnerCount === 0 ? 0 : (num(ctx.Z11, 0) > 0 ? 0 : 1 - num(T[63], 0)))
  );

  if (ctx.runnerCount > 0 && q5 <= 1) {
    if (num(T[61], 0) > 0) {
      push('LODP', 27, roundDown(num(T[61], 0) * V21));
    }
    if (num(T[62], 0) > 0) {
      push('TP', 28, roundDown(num(T[62], 0) * V21));
    }
    if (num(T[63], 0) > 0) {
      push('LOTP', 29, roundDown(num(T[63], 0) * V21));
    }
  }

  return entries.sort((left, right) => left.order - right.order);
}

export function buildRangeTable({
  batterStats,
  pitcherStats,
  batterHand,
  pitcherHand,
  onFirst = false,
  onSecond = false,
  onThird = false,
  runnerSpeed,
  outs = 0,
  infieldIn = false,
  hitAndRun = false,
}) {
  const platoonMult = platoonMultiplier(batterHand, pitcherHand);
  const uSizes = computeBaseUSizes(batterStats, pitcherStats, platoonMult, infieldIn);
  const runners = buildRunnerSpeeds({ onFirst, onSecond, onThird, runnerSpeed });
  const ctx = buildRunnerContext(runners, { q5: 0, infieldIn, hitAndRun });

  const rawRows = computeRangeRows(uSizes, ctx);
  let low = 0;
  const rows = rawRows.map((row) => {
    const high = low + row.range - 1;
    const entry = {
      result: row.result,
      range: row.range,
      low,
      high,
    };
    low = high + 1;
    return entry;
  });

  return {
    rows,
    meta: {
      outs,
      platoonMult,
      uSizes,
      runners,
      brc: encodeBrc({ onFirst, onSecond, onThird, outs }),
    },
  };
}

export function encodeBrc({ onFirst, onSecond, onThird, outs }) {
  const baseMask = (onFirst ? 1 : 0) + (onSecond ? 2 : 0) + (onThird ? 4 : 0);
  return baseMask + (num(outs, 0) * 8);
}

export function decodeBrc(brc) {
  const value = num(brc, 0);
  return {
    onFirst: (value & 1) > 0,
    onSecond: (value & 2) > 0,
    onThird: (value & 4) > 0,
    outs: Math.floor(value / 8),
  };
}

export function lookupResult(diff, rows) {
  const value = num(diff, 0);
  const match = rows.find((row) => value >= row.low && value <= row.high);
  return match?.result ?? 'PANIC';
}
