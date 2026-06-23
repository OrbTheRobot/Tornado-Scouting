import {
  HISTORICAL_PLAYS_CONFIG,
  SHEET_CONFIG,
  PLAYER_SHEET_COLUMNS,
  getHistoricalPlaysCsvUrl,
  getSheetCsvUrl,
  normalizePlayRow,
} from './config.js';
import { buildRangeTable } from './rangeEngine.js';
import {
  formatTargetGameLabel,
  getRosterNames,
  inferSituationFromPlays,
  parseSessionDates,
  projectPlayOutcome,
  resolveSunTargetGame,
} from './liveScouting.js';

const PITCH_MIN = 1;
const PITCH_MAX = 1000;
const SWING_MIN = 0;
const SWING_MAX = 1000;
const HYPOTHETICAL_SWING_COLOR = 'rgba(255, 130, 130, 0.85)';
const RANGE_MARKER_OPACITY = 0.75;
const RANGE_BAND_FILL_OPACITY = 0.25;
const RANGE_MARKER_LINE_WIDTH = 3;
const RANGE_BOUNDARY_TICK_WIDTH = 3;
const HYPOTHETICAL_SWING_LINE_WIDTH = 3.5;
const MEME_PITCH_NUMBERS = [
  1, 69, 111, 222, 333, 404, 420, 444, 500, 501, 555, 569, 666, 669, 696, 711, 777, 888, 911, 999, 1000,
];
const LIVE_SPIRAL_GAME_COUNT = 3;
const SPIRAL_VISIBLE_PITCH_COUNT = 25;
const BUCKET_USAGE_RECENT_PITCH_COUNT = 100;
const FAVOURITE_PITCHES_LIMIT = 10;
const LIVE_MATSUMOTO_SEASON_COUNT = 3;
const SPIRAL_CANVAS_SIZE = 960;
const SPIRAL_RENDER_SCALE = 3;
const SPIRAL_TEXT_SCALE = 2;
const SPIRAL_MIN_RADIUS = 0.03;
const SPIRAL_MAX_RADIUS = 0.88;
const ATTACK_ZONE_WIDTH = 300;
const ATTACK_ZONE_BAND_INNER_RADIUS = SPIRAL_MAX_RADIUS - 0.028;
const ATTACK_ZONE_BAND_OUTER_RADIUS = SPIRAL_MAX_RADIUS + 0.014;
const ATTACK_ZONE_BAND_FILL = 'rgba(255, 130, 130, 0.08)';
const ATTACK_ZONE_BAND_STROKE = 'rgba(255, 130, 130, 0.72)';
const ATTACK_ZONE_HATCH_PITCH_STEP = 4;
const SPIRAL_GUIDE_OUTER_RADIUS = SPIRAL_MAX_RADIUS + 0.08;
const SPIRAL_AXIS_LABEL_OFFSET_PX = 16 * SPIRAL_TEXT_SCALE;
const BUCKET_USAGE_LABEL_COLOR = 'rgba(176, 156, 196, 0.95)';
const BUCKET_USAGE_RADIUS_OFFSET_PX = -4;
const BUCKET_USAGE_LINE_GAP_PX = 2;
const PITCH_DENSITY_BIN_COUNT = 250;
const PITCH_DENSITY_KERNEL_SIGMA_BINS = 9;
const PITCH_DENSITY_KERNEL_RADIUS_BINS = 24;
const PITCH_DENSITY_SAMPLE_COUNT = 360;
const PITCH_DENSITY_BASE_RADIUS = 0.055;
const PITCH_DENSITY_MAX_BUMP = 0.52;
const PITCH_DENSITY_STROKE_COLOR = 'rgba(156, 136, 186, 0.82)';
const PITCH_DENSITY_FILL_COLOR = 'rgba(156, 136, 186, 0.14)';
const SPIRAL_GUIDE_LABEL_CLEARANCE = 0.105;
const DELTA_BAND_THICKNESS = 0.038;
const DELTA_BAND_GAP = 0.012;
const LIVE_PROXIMITY_PITCH_TOLERANCE = 50;
const DELTA_BAND_INNER_RADIUS = SPIRAL_GUIDE_OUTER_RADIUS + SPIRAL_GUIDE_LABEL_CLEARANCE;
const DELTA_BAND_OUTER_RADIUS = DELTA_BAND_INNER_RADIUS + DELTA_BAND_THICKNESS;
const DELTA_BAND_MID_RADIUS = (DELTA_BAND_INNER_RADIUS + DELTA_BAND_OUTER_RADIUS) / 2;
const DELTA_BAND_MEDIAN_LABEL_ANGLE_OFFSET = 0.035;
const PROXIMITY_DELTA_BAND_INNER_RADIUS = DELTA_BAND_OUTER_RADIUS + DELTA_BAND_GAP;
const PROXIMITY_DELTA_BAND_OUTER_RADIUS = PROXIMITY_DELTA_BAND_INNER_RADIUS + DELTA_BAND_THICKNESS;
const PROXIMITY_DELTA_BAND_MID_RADIUS = (
  PROXIMITY_DELTA_BAND_INNER_RADIUS + PROXIMITY_DELTA_BAND_OUTER_RADIUS
) / 2;
const DELTA_WHISKER_LINE_WIDTH = 1.5;
const PROXIMITY_DELTA_BAND_COLOR = '#9a93a8';
const RANGE_BAND_GAP = 0.012;
const RANGE_MARKER_INNER_RADIUS = PROXIMITY_DELTA_BAND_OUTER_RADIUS + RANGE_BAND_GAP;
const RANGE_MARKER_OUTER_RADIUS = RANGE_MARKER_INNER_RADIUS + DELTA_BAND_THICKNESS;
const SITUATION_MINI_RADIUS = RANGE_MARKER_OUTER_RADIUS + 0.058;
const DELTA_BAND_RADIUS_OFFSET_PX = 15;
const SITUATION_MINI_PIXEL_SIZE = 48;
const SITUATION_RUNS_TEXT_COLOR = '#35bfa5';
const SITUATION_INNING_END_TEXT_COLOR = '#f5c842';
const SITUATION_VIEWBOX = { minX: 27, minY: 14, width: 46, height: 50 };
const SPIRAL_RADIUS_SCALE = 0.4;
const SPIRAL_POINT_RADIUS = 12;
const SPIRAL_LATEST_RADIUS = 14;
const SPIRAL_CONNECTOR_STEPS = 72;
const SPIRAL_CONNECTOR_OPACITY = 0.36;
const SPIRAL_TRANSITION_CONNECTOR_COLOR = 'rgba(176, 156, 196, 0.7)';
const CHART_CANVAS_COLOR = '#161020';
const CHART_TEXT_COLOR = '#efe8f5';
const CHART_CANVAS_STROKE = 'rgba(16, 12, 22, 0.9)';
const CHART_MUTED = 'rgba(176, 156, 196';
const SPIRAL_ZOOM_MIN = 0.6;
const SPIRAL_ZOOM_MAX = 8;
const SPIRAL_ZOOM_STEP = 1.12;
const SPIRAL_ZOOM_DEFAULT = 1 / (SPIRAL_ZOOM_STEP ** 2);
const TWO_PI = Math.PI * 2;

const BASE_HIT_RESULTS = new Set(['1B', '1BWH', '2B', '2BWH', '3B', 'BB', 'IF1B']);
const OUT_RESULTS = new Set(['FO', 'GO', 'GORA', 'PO', 'DP', 'DP31', 'DPH1', 'FC']);
const STRIKEOUT_RESULTS = new Set(['K']);
const HOME_RUN_RESULTS = new Set(['HR']);

const ON_BASE_RESULT_CODES = new Set([
  'HR', '3B', '2B', '2BWH', '1B', '1BWH', '1BWH2', 'IF1B', 'BB',
]);

const RESULT_CATEGORY_ORDER = ['Base Hit', 'Out', 'Strikeout', 'Home Run', 'Other'];

const RESULT_CATEGORY_COLORS = {
  'Base Hit': '#4f8cff',
  Out: '#f5a524',
  Strikeout: '#ef6b6b',
  'Home Run': '#35bfa5',
  Other: '#a895bd',
};

const DELTA_PLOT_CATEGORIES = [
  { key: 'Home Run', label: 'HR', color: RESULT_CATEGORY_COLORS['Home Run'] },
  { key: 'Base Hit', label: 'Hit', color: RESULT_CATEGORY_COLORS['Base Hit'] },
  { key: 'Out', label: 'Out', color: RESULT_CATEGORY_COLORS.Out },
  { key: 'Strikeout', label: 'K', color: RESULT_CATEGORY_COLORS.Strikeout },
];

const BATTING_STAT_FIELDS = [
  { key: 'handedness', label: 'Hand' },
  { key: 'con', label: 'CON' },
  { key: 'eye', label: 'EYE' },
  { key: 'pow', label: 'POW' },
  { key: 'spd', label: 'SPD' },
];

const PITCHING_STAT_FIELDS = [
  { key: 'handedness', label: 'Hand' },
  { key: 'con', label: 'MOV' },
  { key: 'eye', label: 'CMD' },
  { key: 'pow', label: 'VEL' },
  { key: 'spd', label: 'AWR' },
];

const pitcherSelect = document.getElementById('pitcher-select');
const batterSelect = document.getElementById('batter-select');
const liveGameContextEl = document.getElementById('live-game-context');
const gameScoreEl = document.getElementById('game-score');
const gameScoreTeamsEl = document.getElementById('game-score-teams');
const situationGraphicEl = document.getElementById('situation-graphic');
const firstPitchModeCheckbox = document.getElementById('first-pitch-mode');
const firstPitchModeBannerEl = document.getElementById('first-pitch-mode-banner');
const pitcherStatsEl = document.getElementById('pitcher-stats');
const batterStatsEl = document.getElementById('batter-stats');
const statusEl = document.getElementById('status');
const rowCountEl = document.getElementById('row-count');
const chartGrid = document.getElementById('chart-grid');

/*
 * LEGACY UI (removed from page, kept for reference):
 * const scoutModeInputs = document.querySelectorAll('input[name="scout-mode"]');
 * const hypotheticalSwingToggle = document.getElementById('hypothetical-swing-toggle');
 * const hypotheticalSwingFields = document.getElementById('hypothetical-swing-fields');
 * const hypotheticalSwingInput = document.getElementById('hypothetical-swing-input');
 * const simulateSwingBtn = document.getElementById('simulate-swing-btn');
 * const pitchRecencySelect = document.getElementById('pitch-recency-select');
 * const recencyControlEl = document.querySelector('.control-group--recency');
 * const syncSheetBtn = document.getElementById('sync-sheet-btn');
 * const situationPanel = document.getElementById('situation-panel');
 * const matchupStackEl = document.getElementById('matchup-stack');
 */

let allRows = [];
let historicalRows = [];
let allGames = [];
let sessionDates = [];
let liveTargetGame = null;
let playerStatsByName = new Map();
let pitcherRowsByName = new Map();
let pitcherAnalyticsByName = new Map();
let isLoadingSheet = false;
let spiralRedraw = null;
let lastSelectedPitcher = '';
let inferredSituation = null;
let firstPitchModeActive = false;

function isLiveScoutingMode() {
  return true;
}

/*
 * LEGACY: speculation mode toggle
 * function getSelectedScoutMode() { ... }
 */

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

function formatSyncTime(date) {
  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
  });
}

function setSyncLoading(loading) {
  isLoadingSheet = loading;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      if (row.some((value) => value.length > 0)) {
        rows.push(row);
      }
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((value) => value.length > 0)) {
      rows.push(row);
    }
  }

  return rows;
}

function rowsToObjects(matrix) {
  if (matrix.length === 0) {
    return [];
  }

  const headers = matrix[0];
  return matrix.slice(1).map((cells) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = cells[index] ?? '';
    });
    return record;
  });
}

function resolvePlaysHeaderRowIndex(matrix) {
  if (matrix.length < 2) {
    return 0;
  }

  const candidate = matrix[1].map((cell) => cell.trim().toLowerCase());

  if (candidate.includes('game') && candidate.includes('pitcher') && candidate.includes('play')) {
    return 1;
  }

  return 0;
}

function parsePlaysMatrix(matrix) {
  if (matrix.length === 0) {
    return [];
  }

  const headerIndex = resolvePlaysHeaderRowIndex(matrix);
  const headers = matrix[headerIndex];

  return matrix.slice(headerIndex + 1).map((cells) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = cells[index] ?? '';
    });
    return record;
  });
}

function populateSelect(selectEl, values, { previousValue = '', defaultValue = '' } = {}) {
  selectEl.replaceChildren();

  values.forEach((value) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    selectEl.appendChild(option);
  });

  if (previousValue && values.includes(previousValue)) {
    selectEl.value = previousValue;
  } else if (defaultValue && values.includes(defaultValue)) {
    selectEl.value = defaultValue;
  } else if (values.length > 0) {
    selectEl.value = values[0];
  }
}

function getUniquePitchers(rows) {
  const pitchers = new Set();

  rows.forEach((row) => {
    const pitcher = row[SHEET_CONFIG.filterColumn]?.trim();
    if (pitcher) {
      pitchers.add(pitcher);
    }
  });

  return [...pitchers].sort((a, b) => a.localeCompare(b));
}

function populatePitcherDropdown(pitchers, pitcherRows = []) {
  populateSelect(pitcherSelect, pitchers, {
    previousValue: pitcherSelect.value,
    defaultValue: isLiveScoutingMode()
      ? getDefaultLivePitcher(pitchers)
      : '',
  });
}

function getDefaultLivePitcher(pitchers) {
  const gameNumber = String(liveTargetGame?.game?.['Game#'] ?? '').trim();
  if (!gameNumber) {
    return pitchers[0] ?? '';
  }

  const gamePitchers = [...new Set(
    allRows
      .filter((row) => String(row.Game ?? '').trim() === gameNumber)
      .map((row) => row.Pitcher?.trim())
      .filter(Boolean),
  )];

  return gamePitchers.find((name) => pitchers.includes(name))
    ?? pitchers[0]
    ?? '';
}

function getDefaultLiveBatter(batters, pitcherRows) {
  const recent = getMostRecentBatter(pitcherRows);
  if (recent && batters.includes(recent)) {
    return recent;
  }

  const gameNumber = String(liveTargetGame?.game?.['Game#'] ?? '').trim();
  if (gameNumber) {
    const gameBatters = [...new Set(
      allRows
        .filter((row) => String(row.Game ?? '').trim() === gameNumber)
        .map((row) => row.Batter?.trim())
        .filter(Boolean),
    )];

    return gameBatters.find((name) => batters.includes(name))
      ?? batters[0]
      ?? '';
  }

  return batters[0] ?? '';
}

function getSpeculationPitchers() {
  return getUniquePitchers(allRows);
}

function getLiveScoutingPitchers() {
  if (!liveTargetGame?.opponentTeam) {
    return [];
  }

  const opponentPitchers = getRosterNames(playerStatsByName, {
    team: liveTargetGame.opponentTeam,
    role: 'pitcher',
  });

  if (opponentPitchers.length > 0) {
    return opponentPitchers;
  }

  return getUniquePitchers(allRows).filter((pitcher) => {
    const player = playerStatsByName.get(pitcher);
    return player?.team === liveTargetGame.opponentTeam && player?.primary === 'P';
  });
}

function getSpeculationBatters() {
  return getAllBatters();
}

function getLiveScoutingBatters() {
  return getRosterNames(playerStatsByName, {
    team: SHEET_CONFIG.scoutTeamAbv,
    role: 'all',
  });
}

function refreshLiveTargetGame() {
  liveTargetGame = resolveSunTargetGame({
    sessions: sessionDates,
    games: allGames,
    playRows: allRows,
    scoutTeam: SHEET_CONFIG.scoutTeamAbv,
  });
}

function updateLiveGameContext() {
  if (!liveGameContextEl) {
    return;
  }

  liveGameContextEl.textContent = formatTargetGameLabel(
    liveTargetGame,
    SHEET_CONFIG.scoutTeamAbv,
  );
}

function updateGameScore() {
  const game = liveTargetGame?.game;

  if (!gameScoreEl) {
    return;
  }

  if (!game) {
    gameScoreEl.textContent = '—';
    if (gameScoreTeamsEl) {
      gameScoreTeamsEl.textContent = '';
    }
    return;
  }

  const away = String(game.Away ?? '').trim();
  const home = String(game.Home ?? '').trim();
  const awayScore = String(game.a_Scr ?? '').trim() || '0';
  const homeScore = String(game.h_Scr ?? '').trim() || '0';

  gameScoreEl.textContent = `${awayScore}–${homeScore}`;
  if (gameScoreTeamsEl) {
    gameScoreTeamsEl.textContent = `${away} @ ${home}`;
  }
}

function updateHeroStatus() {
  inferredSituation = getInferredLiveSituation();
  updateGameScore();
  updateLiveGameContext();
  renderInferredSituationGraphic(inferredSituation, situationGraphicEl);
  updateFirstPitchModeBanner();
}

function updateFirstPitchModeBanner() {
  if (!firstPitchModeBannerEl) {
    return;
  }

  firstPitchModeBannerEl.hidden = !firstPitchModeActive;
}

function getAvailablePitchers() {
  return getLiveScoutingPitchers();
}

function getAvailableBatters() {
  return getLiveScoutingBatters();
}

function getAllBatters() {
  return [...playerStatsByName.keys()].sort((a, b) => a.localeCompare(b));
}

function getMostRecentBatter(rows) {
  let latest = null;

  rows.forEach((row) => {
    const batter = row.Batter?.trim();
    const playOrder = parsePlayOrder(row);
    if (!batter || playOrder === null) {
      return;
    }

    if (!latest || playOrder > latest.playOrder) {
      latest = { batter, playOrder };
    }
  });

  return latest?.batter ?? '';
}

function populateBatterDropdown(batters, pitcherRows) {
  populateSelect(batterSelect, batters, {
    previousValue: batterSelect.value,
    defaultValue: isLiveScoutingMode()
      ? getDefaultLiveBatter(batters, pitcherRows)
      : getMostRecentBatter(pitcherRows),
  });
}

function filterRowsByPitcher(rows, pitcher) {
  return rows.filter((row) => row[SHEET_CONFIG.filterColumn] === pitcher);
}

function parseSwingNumber(value) {
  const swingNumber = Number.parseInt(String(value).trim(), 10);
  if (!Number.isFinite(swingNumber)) {
    return null;
  }

  if (swingNumber < SWING_MIN || swingNumber > SWING_MAX) {
    return null;
  }

  return swingNumber;
}

function getPitchHundredBucketIndex(pitchNumber) {
  return Math.floor((pitchNumber - 1) / 100);
}

function getPitchHundredBucketBounds(bucketIndex) {
  return {
    target: Math.min(PITCH_MAX, bucketIndex * 100 + 50),
  };
}

function getAttackZoneBoundsFromTarget(target) {
  const halfWidth = ATTACK_ZONE_WIDTH / 2;

  return {
    target,
    attackMin: Math.round(normalizePitchNumber(target - halfWidth)),
    attackMax: Math.round(normalizePitchNumber(target + halfWidth)),
  };
}

function getAttackZoneFromPitchRows(pitchRows) {
  if (!pitchRows?.length) {
    return null;
  }

  const bucketCounts = new Map();

  pitchRows.forEach(({ pitchNumber }) => {
    const bucketIndex = getPitchHundredBucketIndex(pitchNumber);
    bucketCounts.set(bucketIndex, (bucketCounts.get(bucketIndex) ?? 0) + 1);
  });

  let winningBucketIndex = 0;
  let winningCount = -1;

  bucketCounts.forEach((count, bucketIndex) => {
    if (
      count > winningCount
      || (count === winningCount && bucketIndex > winningBucketIndex)
    ) {
      winningCount = count;
      winningBucketIndex = bucketIndex;
    }
  });

  return {
    bucketIndex: winningBucketIndex,
    bucketCount: winningCount,
    ...getAttackZoneBoundsFromTarget(getPitchHundredBucketBounds(winningBucketIndex).target),
  };
}

function parsePitchNumber(row) {
  const pitchNumber = Number.parseInt(row['Pitch #'], 10);
  if (!Number.isFinite(pitchNumber)) {
    return null;
  }

  if (pitchNumber < PITCH_MIN || pitchNumber > PITCH_MAX) {
    return null;
  }

  return pitchNumber;
}

function normalizePitchNumber(value) {
  if (!Number.isFinite(value)) {
    return SWING_MIN;
  }

  const mod = SWING_MAX + 1;
  return ((value % mod) + mod) % mod;
}

function hexToRgba(hex, alpha) {
  const normalized = hex.replace('#', '');
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

/*
 * LEGACY: range table
 * function buildMatchupRangeTable(pitcherName, batterName) { ... }
 * function formatRangeBounds(row, simulatedSwing) { ... }
 * function renderRangeTableCard(pitcherName, batterName) { ... }
 */

function buildMatchupRangeTable(pitcherName, batterName) {
  const pitcher = playerStatsByName.get(pitcherName);
  const batter = playerStatsByName.get(batterName);

  if (!pitcher || !batter) {
    return null;
  }

  const situation = getSituationState();

  return buildRangeTable({
    batterStats: getPlayerStatBlock(batter, 'batting'),
    pitcherStats: getPlayerStatBlock(pitcher, 'pitching'),
    batterHand: batter.handedness,
    pitcherHand: pitcher.handedness,
    onFirst: situation.onFirst,
    onSecond: situation.onSecond,
    onThird: situation.onThird,
    runnerSpeed: getPlayerStatBlock(batter, 'batting')?.spd,
    outs: situation.outs,
  });
}

function getOnBasePitchRange(rangeRows, swingAnchor) {
  if (!rangeRows?.length || swingAnchor === null) {
    return null;
  }

  const onBaseHighs = rangeRows
    .filter((row) => ON_BASE_RESULT_CODES.has(String(row.result ?? '').trim().toUpperCase()))
    .map((row) => row.high);

  if (onBaseHighs.length === 0) {
    return null;
  }

  const maxHigh = Math.max(...onBaseHighs);
  return {
    min: normalizePitchNumber(swingAnchor - maxHigh),
    max: normalizePitchNumber(swingAnchor + maxHigh),
  };
}

function buildSpiralSwingSummary(attackZone, rangeRows) {
  if (!attackZone) {
    return null;
  }

  const onBaseRange = rangeRows?.length
    ? getOnBasePitchRange(rangeRows, attackZone.target)
    : null;

  return {
    attackMin: attackZone.attackMin,
    attackMax: attackZone.attackMax,
    target: attackZone.target,
    onBaseMin: onBaseRange?.min !== null ? Math.round(onBaseRange.min) : null,
    onBaseMax: onBaseRange?.max !== null ? Math.round(onBaseRange.max) : null,
  };
}

function buildSpiralRangeChartRow(label, overlay) {
  return {
    label,
    accentColor: overlay.color,
    values: [
      Math.round(overlay.minPitch),
      Math.round(overlay.q1Pitch),
      Math.round(overlay.medianPitch),
      Math.round(overlay.q3Pitch),
      Math.round(overlay.maxPitch),
    ],
  };
}

function buildSpiralRangeOverlaySummary(forwardDeltaOverlay, proximityDeltaOverlay, options = {}) {
  const { firstPitchMode = false } = options;
  const rows = [];

  if (firstPitchMode) {
    if (proximityDeltaOverlay) {
      rows.push(buildSpiralRangeChartRow('First Pitches', proximityDeltaOverlay));
    }
  } else {
    if (forwardDeltaOverlay) {
      rows.push(buildSpiralRangeChartRow('By Result', forwardDeltaOverlay));
    }

    if (proximityDeltaOverlay) {
      rows.push(buildSpiralRangeChartRow('By Value', proximityDeltaOverlay));
    }
  }

  if (rows.length === 0) {
    return null;
  }

  return {
    columns: ['Low', 'Q1', 'Median', 'Q3', 'High'],
    rows,
  };
}

function createSpiralRangeOverlay(summary) {
  return createSpiralPanelOverlay('spiral-panel-overlay--range', () => {
    if (!summary) {
      return null;
    }

    const table = document.createElement('table');
    table.className = 'spiral-range-chart';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    const corner = document.createElement('th');
    corner.className = 'spiral-range-chart__corner';
    corner.setAttribute('scope', 'col');
    headerRow.appendChild(corner);

    summary.columns.forEach((column, index) => {
      const heading = document.createElement('th');
      heading.className = 'spiral-range-chart__column';
      heading.setAttribute('scope', 'col');
      heading.textContent = column;
      if (index === 2) {
        heading.classList.add('spiral-range-chart__column--median');
      }
      headerRow.appendChild(heading);
    });

    thead.appendChild(headerRow);
    table.append(thead);

    const tbody = document.createElement('tbody');
    summary.rows.forEach((row) => {
      const tableRow = document.createElement('tr');

      const rowLabel = document.createElement('th');
      rowLabel.className = 'spiral-range-chart__row-label';
      rowLabel.setAttribute('scope', 'row');
      rowLabel.style.color = row.accentColor;
      rowLabel.textContent = row.label;
      tableRow.appendChild(rowLabel);

      row.values.forEach((value, index) => {
        const cell = document.createElement('td');
        cell.className = 'spiral-range-chart__value';
        cell.textContent = String(value);
        if (index === 2) {
          cell.classList.add('spiral-range-chart__value--median');
        }
        tableRow.appendChild(cell);
      });

      tbody.appendChild(tableRow);
    });

    table.appendChild(tbody);
    return table;
  });
}

function buildSpiralPanelOverlayRows(rows, options = {}) {
  const { highlightValueLabels = [] } = options;
  const fragment = document.createDocumentFragment();

  rows.forEach(([label, value]) => {
    const row = document.createElement('div');
    row.className = 'spiral-panel-overlay__row';

    const labelEl = document.createElement('span');
    labelEl.className = 'spiral-panel-overlay__label';
    labelEl.textContent = `${label}:`;

    const valueEl = document.createElement('span');
    valueEl.className = 'spiral-panel-overlay__value';
    if (highlightValueLabels.includes(label)) {
      valueEl.classList.add('spiral-panel-overlay__value--highlight');
    }
    valueEl.textContent = value;

    row.append(labelEl, document.createTextNode(' '), valueEl);
    fragment.appendChild(row);
  });

  return fragment;
}

function createSpiralPanelOverlay(className, contentFactory) {
  const overlay = document.createElement('div');
  overlay.className = `spiral-panel-overlay ${className}`;

  const content = contentFactory(overlay);
  if (!content) {
    overlay.hidden = true;
    return overlay;
  }

  overlay.appendChild(content);
  return overlay;
}

function createSpiralSwingOverlay(summary) {
  return createSpiralPanelOverlay('spiral-panel-overlay--swing', () => {
    if (!summary) {
      return null;
    }

    return buildSpiralPanelOverlayRows([
      ['Attack Zone', `${summary.attackMin} to ${summary.attackMax}`],
      ['Recommended Swing', String(summary.target)],
      [
        'On Base Range',
        summary.onBaseMin !== null && summary.onBaseMax !== null
          ? `${summary.onBaseMin} to ${summary.onBaseMax}`
          : '—',
      ],
    ], {
      highlightValueLabels: ['Recommended Swing'],
    });
  });
}

function createSpiralFirstPitchModeOverlay() {
  return createSpiralPanelOverlay('spiral-panel-overlay--first-pitch', () => {
    const label = document.createElement('div');
    label.textContent = 'First Pitch Mode Active';
    return label;
  });
}

function getBandPitchEndpoints(swingAnchor, innerHigh, outerHigh, variant) {
  if (variant === 'center') {
    return {
      pitchA: normalizePitchNumber(swingAnchor - outerHigh),
      pitchB: normalizePitchNumber(swingAnchor + outerHigh),
    };
  }

  if (variant === 'down') {
    return {
      pitchA: normalizePitchNumber(swingAnchor - outerHigh),
      pitchB: normalizePitchNumber(swingAnchor - innerHigh),
    };
  }

  return {
    pitchA: normalizePitchNumber(swingAnchor + innerHigh),
    pitchB: normalizePitchNumber(swingAnchor + outerHigh),
  };
}

function bandMidPitchNumber(swingAnchor, innerHigh, outerHigh, variant) {
  const midOffset = (innerHigh + outerHigh) / 2;

  if (variant === 'down') {
    return normalizePitchNumber(swingAnchor - midOffset);
  }

  if (variant === 'up') {
    return normalizePitchNumber(swingAnchor + midOffset);
  }

  return normalizePitchNumber(swingAnchor);
}

function isOutTransitionGroup(group, baseSituation) {
  const baseOuts = Number(baseSituation?.outs ?? 0);

  if (group.inningEnded || group.situation.outs > baseOuts) {
    return true;
  }

  return group.results.some((result) => {
    const category = normalizeResultCategory(result);
    return category === 'Out' || category === 'Strikeout';
  });
}

function getSituationMarkerColor(group, baseSituation) {
  if (isOutTransitionGroup(group, baseSituation)) {
    return RESULT_CATEGORY_COLORS.Out;
  }

  const category = normalizeResultCategory(group.results[0]);
  return RESULT_CATEGORY_COLORS[category] ?? RESULT_CATEGORY_COLORS.Other;
}

function collectOutTransitionBoundaries(regions, swingAnchor) {
  const pitches = new Set();

  regions.forEach((region) => {
    if (!region.isOutTransition) {
      return;
    }

    if (region.isCenter) {
      pitches.add(normalizePitchNumber(swingAnchor));
      return;
    }

    pitches.add(normalizePitchNumber(swingAnchor - region.innerHigh));
    pitches.add(normalizePitchNumber(swingAnchor + region.innerHigh));
  });

  return pitches;
}

function getSituationKey(situation) {
  return [
    situation.onFirst ? 1 : 0,
    situation.onSecond ? 1 : 0,
    situation.onThird ? 1 : 0,
    situation.outs ?? 0,
  ].join(':');
}

function createSituationRegion(
  situation,
  swingAnchor,
  innerHigh,
  outerHigh,
  markerColor,
  isCenterWedge,
  { runsScored = 0, inningEnded = false, isOutTransition = false } = {},
) {
  const lineColor = hexToRgba(markerColor, RANGE_MARKER_OPACITY);

  return {
    situation,
    runsScored,
    inningEnded,
    isOutTransition,
    isCenter: isCenterWedge,
    innerHigh,
    outerHigh,
    markerColor,
    lineColor,
    bands: isCenterWedge
      ? [{ innerHigh, outerHigh, variant: 'center' }]
      : [
        { innerHigh, outerHigh, variant: 'down' },
        { innerHigh, outerHigh, variant: 'up' },
      ],
    boundaryLines: [
      normalizePitchNumber(swingAnchor - outerHigh),
      normalizePitchNumber(swingAnchor + outerHigh),
    ],
    bandMarkers: isCenterWedge
      ? [{ pitchNumber: normalizePitchNumber(swingAnchor), variant: 'center' }]
      : [
        {
          pitchNumber: bandMidPitchNumber(swingAnchor, innerHigh, outerHigh, 'down'),
          variant: 'down',
        },
        {
          pitchNumber: bandMidPitchNumber(swingAnchor, innerHigh, outerHigh, 'up'),
          variant: 'up',
        },
      ],
  };
}

function buildRangeSpiralMarkers(rangeRows, swingAnchor, baseSituation) {
  if (swingAnchor === null || !baseSituation) {
    return [];
  }

  const kRow = rangeRows.find((row) => row.result === 'K');
  const bracketRows = rangeRows.filter((row) => row.result !== 'K');
  const entries = bracketRows.map((row, index) => {
    const outcome = projectPlayOutcome(baseSituation, row.result);
    return {
      result: row.result,
      innerHigh: index === 0 ? 0 : bracketRows[index - 1].high,
      outerHigh: row.high,
      situation: outcome.situation,
      runsScored: outcome.runsScored,
      inningEnded: outcome.inningEnded,
      isCenter: row.result === 'HR',
    };
  });

  if (kRow) {
    const outcome = projectPlayOutcome(baseSituation, 'K');
    entries.push({
      result: 'K',
      innerHigh: bracketRows[bracketRows.length - 1]?.high ?? 0,
      outerHigh: kRow.high,
      situation: outcome.situation,
      runsScored: outcome.runsScored,
      inningEnded: outcome.inningEnded,
      isCenter: false,
    });
  }

  const groups = [];
  entries.forEach((entry) => {
    const key = getSituationKey(entry.situation);
    const last = groups[groups.length - 1];

    if (last && last.key === key && !last.isCenter && !entry.isCenter) {
      last.outerHigh = entry.outerHigh;
      last.results.push(entry.result);
      last.runsScored = Math.max(last.runsScored, entry.runsScored);
      last.inningEnded = last.inningEnded || entry.inningEnded;
      return;
    }

    groups.push({
      key,
      situation: entry.situation,
      innerHigh: entry.innerHigh,
      outerHigh: entry.outerHigh,
      isCenter: entry.isCenter,
      results: [entry.result],
      runsScored: entry.runsScored,
      inningEnded: entry.inningEnded,
    });
  });

  return groups.map((group) => {
    const markerColor = getSituationMarkerColor(group, baseSituation);
    return createSituationRegion(
      group.situation,
      swingAnchor,
      group.innerHigh,
      group.outerHigh,
      markerColor,
      group.isCenter,
      {
        runsScored: group.runsScored,
        inningEnded: group.inningEnded,
        isOutTransition: isOutTransitionGroup(group, baseSituation),
      },
    );
  });
}

function parsePlayOrder(row) {
  const playOrder = Number.parseInt(row.Play, 10);
  if (!Number.isFinite(playOrder)) {
    return null;
  }

  return playOrder;
}

function getChronologicalPitchRows(rows) {
  return rows
    .map((row) => {
      const pitchNumber = parsePitchNumber(row);
      const playOrder = parsePlayOrder(row);
      if (pitchNumber === null || playOrder === null) {
        return null;
      }

      return { row, pitchNumber, playOrder };
    })
    .filter(Boolean);
}

function getPitchRecencyLimit() {
  return null;
}

function getMatsumotoSeasons() {
  const seasons = [];

  for (
    let season = HISTORICAL_PLAYS_CONFIG.minSeason;
    season <= HISTORICAL_PLAYS_CONFIG.maxSeason;
    season += 1
  ) {
    seasons.push(season);
  }

  return seasons;
}

function buildHistoricalSeasonQuery() {
  const { minSeason, maxSeason } = HISTORICAL_PLAYS_CONFIG;
  return `select * where A >= ${minSeason} and A <= ${maxSeason}`;
}

function isPlaysDataMatrix(matrix) {
  if (matrix.length < 2) {
    return false;
  }

  const headers = matrix[0].map((header) => header.trim().toLowerCase());
  return headers.includes('game')
    && headers.includes('pitcher')
    && headers.includes('play');
}

function dedupePlayRowsByGamePlay(rows, { preferLast = true } = {}) {
  const seen = new Map();

  rows.forEach((row) => {
    const game = String(row.Game ?? '').trim();
    const play = String(row.Play ?? '').trim();

    if (!game || !play) {
      return;
    }

    const key = `${game}|${play}`;

    if (!preferLast && seen.has(key)) {
      return;
    }

    seen.set(key, row);
  });

  return [...seen.values()];
}

function getPitcherRowsForMatsumoto(pitcherName) {
  return pitcherRowsByName.get(pitcherName) ?? [];
}

function getPitcherAnalyticsCacheKey(pitcherName) {
  return `${pitcherName}|${firstPitchModeActive ? 'first-pitch' : 'all'}`;
}

function extractFirstPitchRows(rows) {
  const firstByGame = new Map();

  getChronologicalPitchRows(rows).forEach((entry) => {
    const game = String(entry.row.Game ?? '').trim();
    if (!game) {
      return;
    }

    const existing = firstByGame.get(game);
    if (!existing || entry.playOrder < existing.playOrder) {
      firstByGame.set(game, entry);
    }
  });

  return [...firstByGame.values()]
    .sort((left, right) => left.playOrder - right.playOrder)
    .map((entry) => entry.row);
}

function filterRowsForPitchScope(rows) {
  if (!firstPitchModeActive) {
    return rows;
  }

  return extractFirstPitchRows(rows);
}

function rebuildPitcherIndex() {
  pitcherRowsByName = new Map();
  pitcherAnalyticsByName = new Map();
  const seasonSet = new Set(getMatsumotoSeasons());
  const combinedRows = dedupePlayRowsByGamePlay([...historicalRows, ...allRows]);

  combinedRows.forEach((row) => {
    const season = parseGameSeason(row.Game);
    if (season === null || !seasonSet.has(season)) {
      return;
    }

    const pitcher = row[SHEET_CONFIG.filterColumn]?.trim();
    if (!pitcher) {
      return;
    }

    if (!pitcherRowsByName.has(pitcher)) {
      pitcherRowsByName.set(pitcher, []);
    }

    pitcherRowsByName.get(pitcher).push(row);
  });
}

function buildPitchNumberCounts(pitchRows) {
  const counts = new Map();

  pitchRows.forEach(({ pitchNumber }) => {
    counts.set(pitchNumber, (counts.get(pitchNumber) ?? 0) + 1);
  });

  return counts;
}

function getFavouritePitchesFromCounts(counts) {
  const ranked = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .sort((left, right) => right[1] - left[1] || left[0] - right[0])
    .map(([pitchNumber, count]) => ({ pitchNumber, count }));

  if (ranked.length <= FAVOURITE_PITCHES_LIMIT) {
    return ranked;
  }

  const cutoffIndex = FAVOURITE_PITCHES_LIMIT - 1;
  const cutoffCount = ranked[cutoffIndex].count;
  const nextCount = ranked[FAVOURITE_PITCHES_LIMIT].count;

  const result = cutoffCount === nextCount
    ? ranked.filter(({ count }) => count !== cutoffCount)
    : ranked.slice(0, FAVOURITE_PITCHES_LIMIT);

  return result.slice(0, FAVOURITE_PITCHES_LIMIT);
}

function getFavouriteMemesFromCounts(counts) {
  return MEME_PITCH_NUMBERS
    .map((pitchNumber) => ({
      pitchNumber,
      count: counts.get(pitchNumber) ?? 0,
    }))
    .filter(({ count }) => count > 0);
}

function getPitcherAnalytics(pitcherName) {
  if (!pitcherName) {
    return null;
  }

  const cacheKey = getPitcherAnalyticsCacheKey(pitcherName);
  if (pitcherAnalyticsByName.has(cacheKey)) {
    return pitcherAnalyticsByName.get(cacheKey);
  }

  const rows = getPitcherDisplayRows(pitcherName);
  const allPitchRows = getChronologicalPitchRows(rows)
    .sort((left, right) => left.playOrder - right.playOrder);
  const visiblePitchRows = allPitchRows.length <= SPIRAL_VISIBLE_PITCH_COUNT
    ? allPitchRows
    : allPitchRows.slice(-SPIRAL_VISIBLE_PITCH_COUNT);
  const pitchCounts = buildPitchNumberCounts(allPitchRows);

  const analytics = {
    rows,
    allPitchRows,
    visiblePitchRows,
    pitchCounts,
    bucketUsageStats: buildBucketUsageStats(allPitchRows),
    pitchDensityProfile: buildPitchDensityProfile(allPitchRows),
    attackZone: getAttackZoneFromPitchRows(allPitchRows),
    favouritePitches: getFavouritePitchesFromCounts(pitchCounts),
    favouriteMemes: getFavouriteMemesFromCounts(pitchCounts),
    overlays: null,
  };

  pitcherAnalyticsByName.set(cacheKey, analytics);
  return analytics;
}

function getSpiralOverlays(pitcherName, pitcherRows, allPitchRows) {
  const analytics = getPitcherAnalytics(pitcherName);

  if (!analytics.overlays) {
    if (firstPitchModeActive) {
      analytics.overlays = {
        forward: null,
        proximity: buildSpiralFirstPitchOverlay(pitcherRows),
      };
    } else {
      analytics.overlays = {
        forward: buildSpiralForwardDeltaOverlay(pitcherRows, allPitchRows),
        proximity: buildSpiralProximityDeltaOverlay(pitcherRows, allPitchRows),
      };
    }
  }

  return analytics.overlays;
}

function getPitcherDisplayRows(pitcherName) {
  return filterRowsForPitchScope(getPitcherRowsForMatsumoto(pitcherName));
}

async function loadHistoricalPlays(forceRefresh = false) {
  const seasonQuery = buildHistoricalSeasonQuery();

  try {
    const response = await fetch(getHistoricalPlaysCsvUrl(seasonQuery, { bustCache: forceRefresh }), {
      cache: forceRefresh ? 'no-store' : 'default',
    });

    if (!response.ok) {
      throw new Error(`Historical plays request failed (${response.status})`);
    }

    const matrix = parseCsv(await response.text());

    if (!isPlaysDataMatrix(matrix)) {
      return [];
    }

    return rowsToObjects(matrix).map(normalizePlayRow);
  } catch (error) {
    console.warn('Historical plays unavailable', error);
    return [];
  }
}

function parseGameSeason(gameId) {
  const game = String(gameId ?? '').trim();
  if (game.length < 2) {
    return null;
  }

  const season = Number.parseInt(game.slice(0, 2), 10);
  return Number.isFinite(season) ? season : null;
}

function getRecentGameIds(rows, count = LIVE_SPIRAL_GAME_COUNT) {
  const games = new Map();

  rows.forEach((row) => {
    const game = String(row.Game ?? '').trim();
    const playOrder = parsePlayOrder(row);
    if (!game || playOrder === null) {
      return;
    }

    const existing = games.get(game);
    if (!existing || playOrder > existing.maxPlay) {
      games.set(game, { game, maxPlay: playOrder });
    }
  });

  return [...games.values()]
    .sort((a, b) => a.maxPlay - b.maxPlay)
    .slice(-count)
    .map((entry) => entry.game);
}

function getRecentSeasons(rows, count = LIVE_MATSUMOTO_SEASON_COUNT) {
  const seasons = new Set();

  rows.forEach((row) => {
    const season = parseGameSeason(row.Game);
    if (season !== null) {
      seasons.add(season);
    }
  });

  return [...seasons].sort((a, b) => a - b).slice(-count);
}

function filterChronologicalPitchRowsByGames(pitchRows, gameIds) {
  const gameSet = new Set(gameIds);
  return pitchRows.filter((entry) => gameSet.has(String(entry.row.Game ?? '').trim()));
}

function filterChronologicalPitchRowsBySeasons(pitchRows, seasons) {
  const seasonSet = new Set(seasons);
  return pitchRows.filter((entry) => {
    const season = parseGameSeason(entry.row.Game);
    return season !== null && seasonSet.has(season);
  });
}

function getAllSeasonPitchRows(pitcherRows) {
  return getChronologicalPitchRows(pitcherRows);
}

function getSpiralVisiblePitchRows(pitcherRows) {
  const pitchRows = getChronologicalPitchRows(pitcherRows);

  if (pitchRows.length <= SPIRAL_VISIBLE_PITCH_COUNT) {
    return pitchRows;
  }

  return pitchRows.slice(-SPIRAL_VISIBLE_PITCH_COUNT);
}

function getSpiralPitchRows(pitcherRows) {
  return getAllSeasonPitchRows(pitcherRows);
}

function getMatsumotoPitchRows(pitcherRows) {
  const pitchRows = getChronologicalPitchRows(pitcherRows);
  return filterChronologicalPitchRowsBySeasons(pitchRows, getMatsumotoSeasons());
}

/*
 * LEGACY: recency dropdown / speculation chart windows
 * function updateLiveModeControls() { ... }
 * function getRecentChronologicalPitchRows(rows) { ... pitch count limit ... }
 */

function getRecentChronologicalPitchRows(rows) {
  const pitchRows = getChronologicalPitchRows(rows);
  const limit = getPitchRecencyLimit();

  if (limit === null || pitchRows.length <= limit) {
    return [...pitchRows].sort((a, b) => a.playOrder - b.playOrder);
  }

  return [...pitchRows]
    .sort((a, b) => b.playOrder - a.playOrder)
    .slice(0, limit)
    .sort((a, b) => a.playOrder - b.playOrder);
}

function isOutResult(code) {
  return OUT_RESULTS.has(code)
    || code.startsWith('DP')
    || code === 'LODP'
    || code === 'LOTP';
}

function normalizeResultCategory(result) {
  const code = result?.trim() || '';

  if (HOME_RUN_RESULTS.has(code)) {
    return 'Home Run';
  }

  if (STRIKEOUT_RESULTS.has(code)) {
    return 'Strikeout';
  }

  if (BASE_HIT_RESULTS.has(code)) {
    return 'Base Hit';
  }

  if (isOutResult(code)) {
    return 'Out';
  }

  return 'Other';
}

function getActiveResultCategories(points) {
  return RESULT_CATEGORY_ORDER.filter((category) => (
    points.some((point) => point.category === category)
  ));
}

function isPlayerStatsMatrix(matrix) {
  if (!matrix || matrix.length < 2) {
    return false;
  }

  const header = matrix[0].map((cell) => cell.trim().toLowerCase());
  if (header.includes('government name')) {
    return true;
  }

  const sample = matrix[1];
  if (!sample?.[PLAYER_SHEET_COLUMNS.name]?.trim()) {
    return false;
  }

  return Boolean(sample[PLAYER_SHEET_COLUMNS.batting.con]?.trim())
    || Boolean(sample[PLAYER_SHEET_COLUMNS.pitching.con]?.trim());
}

function parsePlayerUniverseImportTarget(matrix) {
  for (const row of matrix) {
    if (row.length < 2) {
      continue;
    }

    if (!row[0].toLowerCase().includes('player universe')) {
      continue;
    }

    const match = row[1].match(/IMPORTRANGE\("([^"]+)","([^"]+)"\)/i);
    if (!match) {
      continue;
    }

    const [, spreadsheetId, rangeRef] = match;
    const sheetMatch = rangeRef.match(/^'([^']+)'!/);
    if (!sheetMatch) {
      continue;
    }

    return {
      spreadsheetId,
      sheetName: sheetMatch[1],
    };
  }

  return null;
}

async function fetchSheetMatrix(sheetName, { forceRefresh = false, spreadsheetId } = {}) {
  const response = await fetch(getSheetCsvUrl(sheetName, {
    bustCache: forceRefresh,
    spreadsheetId,
  }), {
    cache: forceRefresh ? 'no-store' : 'default',
  });

  if (!response.ok) {
    throw new Error(`${sheetName} sheet request failed (${response.status})`);
  }

  const csvText = await response.text();
  return parseCsv(csvText);
}

async function loadPlayerStatsByName({ forceRefresh = false } = {}) {
  const maps = [];

  try {
    const playersMatrix = await fetchSheetMatrix(SHEET_CONFIG.playersSheetName, { forceRefresh });
    if (isPlayerStatsMatrix(playersMatrix)) {
      maps.push(buildPlayerStatsMap(playersMatrix));
    }
  } catch (error) {
    console.warn('Players tab unavailable', error);
  }

  try {
    const importMatrix = await fetchSheetMatrix(SHEET_CONFIG.playersImportSheetName, { forceRefresh });
    if (isPlayerStatsMatrix(importMatrix)) {
      maps.push(buildPlayerStatsMap(importMatrix));
    } else {
      const importTarget = parsePlayerUniverseImportTarget(importMatrix);
      if (importTarget) {
        const importedMatrix = await fetchSheetMatrix(importTarget.sheetName, {
          forceRefresh,
          spreadsheetId: importTarget.spreadsheetId,
        });

        if (isPlayerStatsMatrix(importedMatrix)) {
          maps.push(buildPlayerStatsMap(importedMatrix));
        }
      }
    }
  } catch (error) {
    console.warn('import_players tab unavailable', error);
  }

  if (maps.length === 0) {
    throw new Error('Player import sheets did not contain player ratings.');
  }

  return mergePlayerStatsMaps(...maps);
}

function buildPlayerStatsFromRow(cells) {
  const readGroup = (group) => ({
    con: cells[group.con]?.trim() || '',
    eye: cells[group.eye]?.trim() || '',
    pow: cells[group.pow]?.trim() || '',
    spd: cells[group.spd]?.trim() || '',
  });

  return {
    name: cells[PLAYER_SHEET_COLUMNS.name]?.trim() || '',
    team: cells[PLAYER_SHEET_COLUMNS.team]?.trim() || '',
    status: cells[PLAYER_SHEET_COLUMNS.status]?.trim() || '',
    primary: cells[PLAYER_SHEET_COLUMNS.primary]?.trim() || '',
    handedness: cells[PLAYER_SHEET_COLUMNS.handedness]?.trim() || '',
    batting: readGroup(PLAYER_SHEET_COLUMNS.batting),
    pitching: readGroup(PLAYER_SHEET_COLUMNS.pitching),
  };
}

function buildPlayerStatsMap(matrix) {
  const statsByName = new Map();

  matrix.slice(1).forEach((cells) => {
    const player = buildPlayerStatsFromRow(cells);
    if (!player.name) {
      return;
    }

    statsByName.set(player.name, player);
  });

  return statsByName;
}

function mergePlayerStatsMaps(...maps) {
  const merged = new Map();

  maps.forEach((statsByName) => {
    statsByName.forEach((player, name) => {
      merged.set(name, player);
    });
  });

  return merged;
}

function getPlayerStatBlock(player, statGroup) {
  if (!player) {
    return null;
  }

  return {
    handedness: player.handedness,
    con: player[statGroup]?.con || '',
    eye: player[statGroup]?.eye || '',
    pow: player[statGroup]?.pow || '',
    spd: player[statGroup]?.spd || '',
  };
}

function appendStatCells(container, stats, statFields) {
  const row = document.createElement('div');
  row.className = 'matchup-stat-row matchup-stat-row--cells-only';

  const cells = document.createElement('div');
  cells.className = 'matchup-stat-row__cells';

  statFields.forEach(({ key, label }) => {
    const cell = document.createElement('div');
    cell.className = 'matchup-stat-cell';

    const statLabel = document.createElement('span');
    statLabel.className = 'matchup-stat-cell__label';
    statLabel.textContent = label;

    const statValue = document.createElement('span');
    statValue.className = 'matchup-stat-cell__value';
    statValue.textContent = stats?.[key] || '—';

    cell.append(statLabel, statValue);
    cells.appendChild(cell);
  });

  row.appendChild(cells);
  container.appendChild(row);
}

/*
 * LEGACY: last-10 pitches table
 * function renderLastTenPitchesTable(rows) { ... }
 */

function appendStatRowHorizontal(container, title, stats, statFields) {
  const row = document.createElement('div');
  row.className = 'matchup-stat-row';

  const heading = document.createElement('h3');
  heading.className = 'matchup-stat-row__title';
  heading.textContent = title;

  const cells = document.createElement('div');
  cells.className = 'matchup-stat-row__cells';

  statFields.forEach(({ key, label }) => {
    const cell = document.createElement('div');
    cell.className = 'matchup-stat-cell';

    const statLabel = document.createElement('span');
    statLabel.className = 'matchup-stat-cell__label';
    statLabel.textContent = label;

    const statValue = document.createElement('span');
    statValue.className = 'matchup-stat-cell__value';
    statValue.textContent = stats?.[key] || '—';

    cell.append(statLabel, statValue);
    cells.appendChild(cell);
  });

  row.append(heading, cells);
  container.appendChild(row);
}

/*
 * LEGACY: vertical stat columns
 * function appendStatColumn(container, title, stats, statFields) { ... }
 */
function appendStatColumn(container, title, stats, statFields) {
  const column = document.createElement('div');
  column.className = 'matchup-column';

  const heading = document.createElement('h3');
  heading.className = 'matchup-column-title';
  heading.textContent = title;

  const statList = document.createElement('dl');
  statList.className = 'stats-list';

  statFields.forEach(({ key, label }) => {
    const row = document.createElement('div');
    row.className = 'stat-row';

    const dt = document.createElement('dt');
    dt.className = 'stat-label';
    dt.textContent = label;

    const dd = document.createElement('dd');
    dd.className = 'stat-value';
    dd.textContent = stats?.[key] || '—';

    row.append(dt, dd);
    statList.appendChild(row);
  });

  column.append(heading, statList);
  container.appendChild(column);
}

function createChartCard(title, description) {
  const card = document.createElement('article');
  card.className = 'chart-card';

  const heading = document.createElement('h2');
  heading.textContent = title;

  const caption = document.createElement('p');
  caption.className = 'chart-caption';
  caption.textContent = description;

  card.append(heading, caption);
  return card;
}

function getPitchNumberCounts(pitcherRows) {
  return buildPitchNumberCounts(
    getChronologicalPitchRows(pitcherRows)
      .sort((left, right) => left.playOrder - right.playOrder),
  );
}

function getFavouritePitches(pitcherRows) {
  return getFavouritePitchesFromCounts(getPitchNumberCounts(pitcherRows));
}

function getFavouriteMemes(pitcherRows) {
  return getFavouriteMemesFromCounts(getPitchNumberCounts(pitcherRows));
}

function appendPitchCountLine(container, labelText, entries, { showEmptyFallback = true } = {}) {
  const line = document.createElement('div');
  line.className = 'favourite-pitches-line';

  const label = document.createElement('span');
  label.className = 'favourite-pitches-line__label';
  label.textContent = labelText;
  line.appendChild(label);

  if (entries.length === 0 && showEmptyFallback) {
    line.append('—');
  } else {
    entries.forEach((entry, index) => {
      if (index > 0) {
        line.append(' ');
      }

      line.append(String(entry.pitchNumber));

      const count = document.createElement('sup');
      count.className = 'favourite-pitches-line__count';
      count.textContent = String(entry.count);
      line.append(count);
    });
  }

  container.appendChild(line);
}

function appendFavouritePitchesLine(container, favouritePitches) {
  appendPitchCountLine(container, 'Favourite Pitches: ', favouritePitches);
}

function appendFavouriteMemesLine(container, favouriteMemes) {
  appendPitchCountLine(container, 'Favourite Memes: ', favouriteMemes);
}

function renderMatchupStatsInline(pitcherName, batterName, pitcherAnalytics = null) {
  pitcherStatsEl?.replaceChildren();
  batterStatsEl?.replaceChildren();

  if (pitcherName && pitcherStatsEl) {
    const pitcher = playerStatsByName.get(pitcherName);
    const analytics = pitcherAnalytics ?? getPitcherAnalytics(pitcherName);
    appendStatCells(
      pitcherStatsEl,
      getPlayerStatBlock(pitcher, 'pitching'),
      PITCHING_STAT_FIELDS,
    );
    if (analytics) {
      appendFavouritePitchesLine(pitcherStatsEl, analytics.favouritePitches);
      appendFavouriteMemesLine(pitcherStatsEl, analytics.favouriteMemes);
    }
  }

  if (batterName && batterStatsEl) {
    const batter = playerStatsByName.get(batterName);
    appendStatCells(
      batterStatsEl,
      getPlayerStatBlock(batter, 'batting'),
      BATTING_STAT_FIELDS,
    );
  }
}

/*
 * LEGACY: matchup card with embedded situation graphic
 * function renderMatchup(pitcherName, batterName) { ... }
 */

function pitchNumberToAngle(pitchNumber) {
  return (pitchNumber / PITCH_MAX) * TWO_PI;
}

function getShortestPitchDelta(fromPitch, toPitch) {
  let delta = toPitch - fromPitch;

  if (delta > PITCH_MAX / 2) {
    delta -= PITCH_MAX;
  } else if (delta < -PITCH_MAX / 2) {
    delta += PITCH_MAX;
  }

  return delta;
}

function getPitchTravelDelta(fromPitch, toPitch) {
  return Math.abs(getShortestPitchDelta(fromPitch, toPitch));
}

function getClockwisePitchDistance(fromPitch, toPitch) {
  let delta = toPitch - fromPitch;

  if (delta <= 0) {
    delta += PITCH_MAX;
  }

  return delta;
}

function pitchAtClockwiseOffset(fromPitch, offset) {
  return pitchFromDisplayDelta(fromPitch, offset);
}

function findWidestEmptyGapBoundaries(uniqueSortedPitches) {
  if (uniqueSortedPitches.length === 0) {
    return null;
  }

  if (uniqueSortedPitches.length === 1) {
    const pitch = uniqueSortedPitches[0];
    return {
      clusterStart: pitch,
      clusterEnd: pitch,
      clusterArcLength: 0,
    };
  }

  let widestGap = -1;
  let gapStart = uniqueSortedPitches[0];
  let gapEnd = uniqueSortedPitches[0];

  for (let index = 0; index < uniqueSortedPitches.length; index += 1) {
    const from = uniqueSortedPitches[index];
    const to = uniqueSortedPitches[(index + 1) % uniqueSortedPitches.length];
    const gap = index === uniqueSortedPitches.length - 1
      ? (PITCH_MAX - from) + to
      : to - from;

    if (gap > widestGap) {
      widestGap = gap;
      gapStart = from;
      gapEnd = to;
    }
  }

  const clusterStart = gapEnd;
  const clusterEnd = gapStart;

  return {
    clusterStart,
    clusterEnd,
    clusterArcLength: getClockwisePitchDistance(clusterStart, clusterEnd),
  };
}

function computeFirstPitchGapCenteredStats(pitchNumbers) {
  const uniqueSortedPitches = [...new Set(pitchNumbers)].sort((left, right) => left - right);
  const boundaries = findWidestEmptyGapBoundaries(uniqueSortedPitches);

  if (!boundaries) {
    return null;
  }

  const { clusterStart, clusterEnd, clusterArcLength } = boundaries;

  if (uniqueSortedPitches.length === 1) {
    return {
      anchorPitch: clusterStart,
      minPitch: clusterStart,
      q1Pitch: clusterStart,
      medianPitch: clusterStart,
      q3Pitch: clusterStart,
      maxPitch: clusterStart,
      stats: {
        min: 0,
        q1: 0,
        median: 0,
        q3: 0,
        max: 0,
      },
    };
  }

  const arcOffsets = pitchNumbers.map((pitch) => (
    getClockwisePitchDistance(clusterStart, pitch)
  ));
  const offsetStats = computeBoxPlotStats(arcOffsets);

  if (!offsetStats) {
    return null;
  }

  const anchorPitch = pitchAtClockwiseOffset(clusterStart, clusterArcLength / 2);
  const minPitch = clusterStart;
  const maxPitch = clusterEnd;
  const q1Pitch = pitchAtClockwiseOffset(clusterStart, offsetStats.q1);
  const medianPitch = pitchAtClockwiseOffset(clusterStart, offsetStats.median);
  const q3Pitch = pitchAtClockwiseOffset(clusterStart, offsetStats.q3);

  return {
    anchorPitch,
    minPitch,
    q1Pitch,
    medianPitch,
    q3Pitch,
    maxPitch,
    stats: {
      min: getShortestPitchDelta(anchorPitch, minPitch),
      q1: getShortestPitchDelta(anchorPitch, q1Pitch),
      median: getShortestPitchDelta(anchorPitch, medianPitch),
      q3: getShortestPitchDelta(anchorPitch, q3Pitch),
      max: getShortestPitchDelta(anchorPitch, maxPitch),
    },
  };
}

function getPitchRotationDirection(fromPitch, toPitch) {
  const delta = getShortestPitchDelta(fromPitch, toPitch);

  if (delta === 0) {
    return '—';
  }

  return delta > 0 ? '↻' : '↺';
}

function computeBoxPlotStats(values) {
  if (values.length === 0) {
    return null;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const quantile = (probability) => {
    const position = (sorted.length - 1) * probability;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);

    if (lower === upper) {
      return sorted[lower];
    }

    return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
  };

  return {
    min: sorted[0],
    q1: quantile(0.25),
    median: quantile(0.5),
    q3: quantile(0.75),
    max: sorted[sorted.length - 1],
  };
}

function getDeltaPlotCategoryMeta(category) {
  return DELTA_PLOT_CATEGORIES.find((entry) => entry.key === category) ?? null;
}

function getPrimaryDeltaBandGeometry() {
  return {
    innerRadiusFraction: DELTA_BAND_INNER_RADIUS,
    outerRadiusFraction: DELTA_BAND_OUTER_RADIUS,
    midRadiusFraction: DELTA_BAND_MID_RADIUS,
  };
}

function getProximityDeltaBandGeometry() {
  return {
    innerRadiusFraction: PROXIMITY_DELTA_BAND_INNER_RADIUS,
    outerRadiusFraction: PROXIMITY_DELTA_BAND_OUTER_RADIUS,
    midRadiusFraction: PROXIMITY_DELTA_BAND_MID_RADIUS,
  };
}

function collectForwardPitchDeltas(chronologicalRows, options = {}) {
  const {
    targetCategory = null,
    anchorPitch = null,
    proximityTolerance = null,
  } = options;
  const deltas = [];

  for (let index = 0; index < chronologicalRows.length - 1; index += 1) {
    const current = chronologicalRows[index];

    if (
      targetCategory !== null
      && normalizeResultCategory(current.row.Result) !== targetCategory
    ) {
      continue;
    }

    if (
      proximityTolerance !== null
      && anchorPitch !== null
      && getPitchTravelDelta(current.pitchNumber, anchorPitch) > proximityTolerance
    ) {
      continue;
    }

    const next = chronologicalRows[index + 1];
    deltas.push(getShortestPitchDelta(current.pitchNumber, next.pitchNumber));
  }

  return deltas;
}

function pitchFromDisplayDelta(anchorPitch, signedDelta) {
  let pitch = anchorPitch + signedDelta;
  pitch = ((pitch % PITCH_MAX) + PITCH_MAX) % PITCH_MAX;

  if (pitch === 0) {
    pitch = PITCH_MAX;
  }

  return pitch;
}

function interpolateDisplayDelta(fromDelta, toDelta, progress) {
  return fromDelta + (toDelta - fromDelta) * progress;
}

function drawOuterAnnularBandByDelta(
  context,
  center,
  maxRadius,
  anchorPitch,
  deltaA,
  deltaB,
  innerRadiusFraction,
  outerRadiusFraction,
  fillColor,
) {
  const steps = Math.max(4, Math.ceil(Math.abs(deltaB - deltaA) / 8));

  context.fillStyle = fillColor;
  context.beginPath();

  for (let step = 0; step <= steps; step += 1) {
    const delta = interpolateDisplayDelta(deltaA, deltaB, step / steps);
    const pitchNumber = pitchFromDisplayDelta(anchorPitch, delta);
    const point = polarToCanvas(
      pitchNumberToAngle(pitchNumber),
      outerRadiusFraction,
      center,
      maxRadius,
    );

    if (step === 0) {
      context.moveTo(point.x, point.y);
    } else {
      context.lineTo(point.x, point.y);
    }
  }

  for (let step = steps; step >= 0; step -= 1) {
    const delta = interpolateDisplayDelta(deltaA, deltaB, step / steps);
    const pitchNumber = pitchFromDisplayDelta(anchorPitch, delta);
    const point = polarToCanvas(
      pitchNumberToAngle(pitchNumber),
      innerRadiusFraction,
      center,
      maxRadius,
    );
    context.lineTo(point.x, point.y);
  }

  context.closePath();
  context.fill();
}

function drawOuterPitchArcStrokeByDelta(
  context,
  center,
  maxRadius,
  anchorPitch,
  deltaA,
  deltaB,
  radiusFraction,
  strokeStyle,
  lineWidth,
) {
  const steps = Math.max(4, Math.ceil(Math.abs(deltaB - deltaA) / 8));

  context.save();
  context.strokeStyle = strokeStyle;
  context.lineWidth = lineWidth;
  context.lineCap = 'round';
  context.beginPath();

  for (let step = 0; step <= steps; step += 1) {
    const delta = interpolateDisplayDelta(deltaA, deltaB, step / steps);
    const pitchNumber = pitchFromDisplayDelta(anchorPitch, delta);
    const point = polarToCanvas(
      pitchNumberToAngle(pitchNumber),
      radiusFraction,
      center,
      maxRadius,
    );

    if (step === 0) {
      context.moveTo(point.x, point.y);
    } else {
      context.lineTo(point.x, point.y);
    }
  }

  context.stroke();
  context.restore();
}

function pitchLabelAngleOffsetToward(fromPitch, towardPitch, magnitude = 0.055) {
  const delta = getShortestPitchDelta(fromPitch, towardPitch);
  if (delta === 0) {
    return 0;
  }

  return magnitude * Math.sign(delta);
}

function offsetRadiusFraction(radiusFraction, maxRadius, pixelOffset) {
  return radiusFraction + pixelOffset / maxRadius;
}

function getOffsetBandGeometry(bandGeometry, maxRadius) {
  return {
    innerRadiusFraction: offsetRadiusFraction(
      bandGeometry.innerRadiusFraction,
      maxRadius,
      DELTA_BAND_RADIUS_OFFSET_PX,
    ),
    outerRadiusFraction: offsetRadiusFraction(
      bandGeometry.outerRadiusFraction,
      maxRadius,
      DELTA_BAND_RADIUS_OFFSET_PX,
    ),
    midRadiusFraction: offsetRadiusFraction(
      bandGeometry.midRadiusFraction,
      maxRadius,
      DELTA_BAND_RADIUS_OFFSET_PX,
    ),
  };
}

function getRangeMarkerInnerRadiusFraction(maxRadius) {
  return offsetRadiusFraction(
    RANGE_MARKER_INNER_RADIUS,
    maxRadius,
    DELTA_BAND_RADIUS_OFFSET_PX,
  );
}

function getRangeMarkerOuterRadiusFraction(maxRadius) {
  return offsetRadiusFraction(
    RANGE_MARKER_OUTER_RADIUS,
    maxRadius,
    DELTA_BAND_RADIUS_OFFSET_PX,
  );
}

function getSituationMiniRadiusFraction(maxRadius) {
  return offsetRadiusFraction(
    SITUATION_MINI_RADIUS,
    maxRadius,
    DELTA_BAND_RADIUS_OFFSET_PX,
  );
}

function normalizeSpiralAngle(angle) {
  return ((angle % TWO_PI) + TWO_PI) % TWO_PI;
}

function shouldFlipTangentText(angle) {
  const normalized = normalizeSpiralAngle(angle);
  return normalized > Math.PI / 2 && normalized < (3 * Math.PI) / 2;
}

function isVerticalSpiralPole(normalized) {
  return Math.abs(normalized - Math.PI / 2) < 1e-6
    || Math.abs(normalized - (3 * Math.PI) / 2) < 1e-6;
}

function getBucketArcLabelRotation(angle) {
  const normalized = normalizeSpiralAngle(angle);

  if (
    normalized > Math.PI / 2
    && normalized < (3 * Math.PI) / 2
    && !isVerticalSpiralPole(normalized)
  ) {
    return angle + Math.PI;
  }

  return angle;
}

function shouldTraverseArcBackward(angle) {
  const normalized = normalizeSpiralAngle(angle);
  const cosAngle = Math.cos(normalized);
  const sinAngle = Math.sin(normalized);

  if (cosAngle < -1e-6) {
    return true;
  }

  if (Math.abs(cosAngle) <= 1e-6 && sinAngle < -1e-6) {
    return true;
  }

  return false;
}

function getReadableTangentRotation(angle) {
  return shouldFlipTangentText(angle) ? angle + Math.PI : angle;
}

function getSpiralAxisLabelRadiusFraction(maxRadius) {
  return SPIRAL_GUIDE_OUTER_RADIUS + SPIRAL_AXIS_LABEL_OFFSET_PX / maxRadius;
}

function getBucketUsageLabelRadiusPx(maxRadius) {
  return getSpiralAxisLabelRadiusFraction(maxRadius) * maxRadius + BUCKET_USAGE_RADIUS_OFFSET_PX;
}

function getClockwiseTangentOffset(angle, amount) {
  return {
    dx: Math.cos(angle) * amount,
    dy: Math.sin(angle) * amount,
  };
}

function drawDeltaBandPitchLabel(
  context,
  center,
  maxRadius,
  pitchNumber,
  color,
  {
    innerRadiusFraction,
    outerRadiusFraction,
    midRadiusFraction = null,
    placement = 'outside',
    referencePitch = null,
  },
) {
  const labelText = String(Math.round(pitchNumber));
  const fontSize = 7 * SPIRAL_TEXT_SCALE;
  let labelAngle = pitchNumberToAngle(pitchNumber);
  const bandMidRadius = midRadiusFraction ?? (innerRadiusFraction + outerRadiusFraction) / 2;
  let labelRadius = bandMidRadius;
  let tangentialPx = 0;
  let textAlign = 'center';
  let textBaseline = 'middle';

  if (placement === 'inside-box') {
    if (referencePitch !== null) {
      labelAngle += pitchLabelAngleOffsetToward(pitchNumber, referencePitch, 0.045);
    }
  } else if (placement === 'inside-median-left') {
    labelAngle -= DELTA_BAND_MEDIAN_LABEL_ANGLE_OFFSET;
    textAlign = 'right';
    tangentialPx = -fontSize * 0.17;
  } else if (placement === 'tail-along-whisker') {
    if (referencePitch !== null) {
      labelAngle += pitchLabelAngleOffsetToward(referencePitch, pitchNumber, 0.04);
    }
  }

  const rotation = getReadableTangentRotation(labelAngle);
  const anchor = polarToCanvas(labelAngle, labelRadius, center, maxRadius);
  const tangential = getClockwiseTangentOffset(labelAngle, tangentialPx);

  context.save();
  context.font = `600 ${fontSize}px "Segoe UI", system-ui, sans-serif`;
  context.fillStyle = color;
  context.translate(
    anchor.x + tangential.dx,
    anchor.y + tangential.dy,
  );
  context.rotate(rotation);
  context.textAlign = textAlign;
  context.textBaseline = textBaseline;
  context.fillText(labelText, 0, 0);
  context.restore();
}

function drawDeltaBandBoundaryTick(
  context,
  center,
  maxRadius,
  pitchNumber,
  color,
  options = {},
) {
  const {
    lineWidth = 1,
    showPitchNumber = true,
    labelPlacement = 'outside',
    referencePitch = null,
    midRadiusFraction = null,
    innerRadiusFraction = DELTA_BAND_INNER_RADIUS,
    outerRadiusFraction = DELTA_BAND_OUTER_RADIUS,
  } = options;
  const angle = pitchNumberToAngle(pitchNumber);
  const start = polarToCanvas(angle, innerRadiusFraction, center, maxRadius);
  const end = polarToCanvas(angle, outerRadiusFraction, center, maxRadius);

  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(end.x, end.y);
  context.stroke();

  if (!showPitchNumber) {
    return pitchNumber;
  }

  drawDeltaBandPitchLabel(context, center, maxRadius, pitchNumber, color, {
    innerRadiusFraction,
    outerRadiusFraction,
    midRadiusFraction,
    placement: labelPlacement,
    referencePitch,
  });

  return pitchNumber;
}

function buildSpiralDeltaOverlay(pitcherRows, spiralPitchRows, options = {}) {
  const {
    proximityTolerance = null,
    filterByCategory = true,
    scopeLabel = 'category',
    bandGeometry = getPrimaryDeltaBandGeometry(),
  } = options;
  const spiralChronological = [...spiralPitchRows].sort((a, b) => a.playOrder - b.playOrder);

  if (spiralChronological.length === 0) {
    return null;
  }

  const latest = spiralChronological[spiralChronological.length - 1];
  const anchorPitch = latest.pitchNumber;
  let category = null;
  let categoryLabel = 'any result';
  let latestResult = '';

  if (filterByCategory) {
    latestResult = latest.row.Result?.trim() || '';

    if (!latestResult) {
      return null;
    }

    category = normalizeResultCategory(latestResult);

    if (category === 'Other') {
      return null;
    }

    categoryLabel = getDeltaPlotCategoryMeta(category)?.label ?? category;
  }

  const historyChronological = getChronologicalPitchRows(pitcherRows)
    .sort((left, right) => left.playOrder - right.playOrder);
  const forwardDeltas = collectForwardPitchDeltas(historyChronological, {
    targetCategory: filterByCategory ? category : null,
    anchorPitch: proximityTolerance === null ? null : anchorPitch,
    proximityTolerance,
  });

  if (forwardDeltas.length === 0) {
    return null;
  }

  const stats = computeBoxPlotStats(forwardDeltas);

  if (!stats) {
    return null;
  }

  const pitchAtDelta = (delta) => pitchFromDisplayDelta(anchorPitch, delta);

  return {
    anchorPitch,
    stats,
    minPitch: pitchAtDelta(stats.min),
    q1Pitch: pitchAtDelta(stats.q1),
    medianPitch: pitchAtDelta(stats.median),
    q3Pitch: pitchAtDelta(stats.q3),
    maxPitch: pitchAtDelta(stats.max),
    latestResult,
    category,
    categoryLabel,
    color: filterByCategory
      ? (RESULT_CATEGORY_COLORS[category] ?? RESULT_CATEGORY_COLORS.Other)
      : PROXIMITY_DELTA_BAND_COLOR,
    sampleCount: forwardDeltas.length,
    seasonCount: getMatsumotoSeasons().length,
    scopeLabel,
    proximityTolerance,
    bandGeometry,
  };
}

function buildSpiralForwardDeltaOverlay(pitcherRows, spiralPitchRows) {
  return buildSpiralDeltaOverlay(pitcherRows, spiralPitchRows, {
    scopeLabel: 'category',
    bandGeometry: getPrimaryDeltaBandGeometry(),
  });
}

function buildSpiralProximityDeltaOverlay(pitcherRows, spiralPitchRows) {
  return buildSpiralDeltaOverlay(pitcherRows, spiralPitchRows, {
    filterByCategory: false,
    proximityTolerance: LIVE_PROXIMITY_PITCH_TOLERANCE,
    scopeLabel: 'proximity',
    bandGeometry: getProximityDeltaBandGeometry(),
  });
}

function buildSpiralFirstPitchOverlay(pitcherRows) {
  const historyChronological = getChronologicalPitchRows(pitcherRows)
    .sort((left, right) => left.playOrder - right.playOrder);

  if (historyChronological.length === 0) {
    return null;
  }

  const pitchNumbers = historyChronological.map((entry) => entry.pitchNumber);
  const gapCenteredStats = computeFirstPitchGapCenteredStats(pitchNumbers);

  if (!gapCenteredStats) {
    return null;
  }

  const {
    anchorPitch,
    minPitch,
    q1Pitch,
    medianPitch,
    q3Pitch,
    maxPitch,
    stats,
  } = gapCenteredStats;

  return {
    anchorPitch,
    stats,
    minPitch,
    q1Pitch,
    medianPitch,
    q3Pitch,
    maxPitch,
    latestResult: '',
    category: null,
    categoryLabel: 'First Pitches',
    color: PROXIMITY_DELTA_BAND_COLOR,
    sampleCount: pitchNumbers.length,
    seasonCount: getMatsumotoSeasons().length,
    scopeLabel: 'first-pitch',
    proximityTolerance: null,
    bandGeometry: getPrimaryDeltaBandGeometry(),
  };
}

function formatForwardDeltaCaption(overlay) {
  const { stats, categoryLabel, seasonCount, sampleCount, scopeLabel, proximityTolerance } = overlay;
  const direction = stats.median === 0
    ? '0'
    : stats.median > 0
      ? `+${stats.median} ↻`
      : `${stats.median} ↺`;

  if (scopeLabel === 'proximity') {
    return `Next-pitch Δ · pitch ±${proximityTolerance} of latest · any result · median ${direction} · Q1–Q3 band · min–max whiskers · last ${seasonCount} season${seasonCount === 1 ? '' : 's'} · n=${sampleCount.toLocaleString()}`;
  }

  if (scopeLabel === 'first-pitch') {
    return `First pitch distribution · gap-centered anchor ${overlay.anchorPitch} · median ${direction} · Q1–Q3 band · min–max at widest gap · last ${seasonCount} season${seasonCount === 1 ? '' : 's'} · n=${sampleCount.toLocaleString()}`;
  }

  return `Next-pitch Δ for ${categoryLabel} · median ${direction} · Q1–Q3 band · min–max whiskers · last ${seasonCount} season${seasonCount === 1 ? '' : 's'} · n=${sampleCount.toLocaleString()}`;
}

function drawSpiralDeltaOverlay(context, center, maxRadius, overlay) {
  const {
    anchorPitch,
    minPitch,
    q1Pitch,
    medianPitch,
    q3Pitch,
    maxPitch,
    color,
    stats,
    bandGeometry,
  } = overlay;
  const {
    innerRadiusFraction,
    outerRadiusFraction,
    midRadiusFraction,
  } = getOffsetBandGeometry(bandGeometry, maxRadius);
  const tickOptions = {
    innerRadiusFraction,
    outerRadiusFraction,
    midRadiusFraction,
    showPitchNumber: false,
  };

  context.save();

  if (stats.min !== stats.q1) {
    drawOuterPitchArcStrokeByDelta(
      context,
      center,
      maxRadius,
      anchorPitch,
      stats.min,
      stats.q1,
      midRadiusFraction,
      color,
      DELTA_WHISKER_LINE_WIDTH,
    );
  }

  if (stats.max !== stats.q3) {
    drawOuterPitchArcStrokeByDelta(
      context,
      center,
      maxRadius,
      anchorPitch,
      stats.q3,
      stats.max,
      midRadiusFraction,
      color,
      DELTA_WHISKER_LINE_WIDTH,
    );
  }

  drawOuterAnnularBandByDelta(
    context,
    center,
    maxRadius,
    anchorPitch,
    stats.q1,
    stats.q3,
    innerRadiusFraction,
    outerRadiusFraction,
    hexToRgba(color, 0.28),
  );

  if (stats.min !== stats.q1) {
    drawDeltaBandBoundaryTick(context, center, maxRadius, minPitch, color, {
      ...tickOptions,
      lineWidth: 1.5,
      labelPlacement: 'tail-along-whisker',
      referencePitch: q1Pitch,
    });
  }

  drawDeltaBandBoundaryTick(context, center, maxRadius, q1Pitch, color, {
    ...tickOptions,
    labelPlacement: 'inside-box',
    referencePitch: medianPitch,
  });
  drawDeltaBandBoundaryTick(context, center, maxRadius, q3Pitch, color, {
    ...tickOptions,
    labelPlacement: 'inside-box',
    referencePitch: medianPitch,
  });

  if (stats.max !== stats.q3) {
    drawDeltaBandBoundaryTick(context, center, maxRadius, maxPitch, color, {
      ...tickOptions,
      lineWidth: 1.5,
      labelPlacement: 'tail-along-whisker',
      referencePitch: q3Pitch,
    });
  }

  drawDeltaBandBoundaryTick(context, center, maxRadius, medianPitch, color, {
    ...tickOptions,
    lineWidth: 3,
    labelPlacement: 'inside-median-left',
  });

  context.restore();
}

function interpolatePitchNumber(fromPitch, toPitch, progress) {
  const delta = getShortestPitchDelta(fromPitch, toPitch);
  let pitch = fromPitch + delta * progress;

  pitch = ((pitch % PITCH_MAX) + PITCH_MAX) % PITCH_MAX;
  if (pitch === 0) {
    pitch = PITCH_MAX;
  }

  return pitch;
}

function polarToCanvas(angle, radiusFraction, center, maxRadius) {
  const radius = radiusFraction * maxRadius;
  return {
    x: center + Math.sin(angle) * radius,
    y: center - Math.cos(angle) * radius,
    angle,
    radius: radiusFraction,
  };
}

function buildSpiralPoints(pitchRows, center, maxRadius) {
  const chronological = [...pitchRows].sort((a, b) => a.playOrder - b.playOrder);
  const count = chronological.length;

  return chronological.map((entry, index) => {
    const progress = count === 1 ? 1 : index / (count - 1);
    const radiusFraction = SPIRAL_MIN_RADIUS
      + progress * (SPIRAL_MAX_RADIUS - SPIRAL_MIN_RADIUS);
    const angle = pitchNumberToAngle(entry.pitchNumber);
    const point = polarToCanvas(angle, radiusFraction, center, maxRadius);
    const result = entry.row.Result?.trim() || 'Unknown';
    const category = normalizeResultCategory(result);

    return {
      ...point,
      pitchNumber: entry.pitchNumber,
      result,
      category,
      color: RESULT_CATEGORY_COLORS[category],
      game: entry.row.Game?.trim() || '',
      inning: entry.row.Inning?.trim() || '',
      playOrder: entry.playOrder,
    };
  });
}

function getConnectorLineDash(fromPoint, toPoint) {
  if (fromPoint.game !== toPoint.game) {
    return [14, 8];
  }

  if (fromPoint.inning !== toPoint.inning) {
    return [2, 6];
  }

  return [];
}

function buildBucketUsageStats(pitchRows) {
  if (!pitchRows.length) {
    return [];
  }

  const allTimeCounts = Array.from({ length: 10 }, () => 0);
  pitchRows.forEach(({ pitchNumber }) => {
    allTimeCounts[getPitchHundredBucketIndex(pitchNumber)] += 1;
  });

  const recentPitches = pitchRows.slice(-BUCKET_USAGE_RECENT_PITCH_COUNT);
  const recentCounts = Array.from({ length: 10 }, () => 0);
  recentPitches.forEach(({ pitchNumber }) => {
    recentCounts[getPitchHundredBucketIndex(pitchNumber)] += 1;
  });

  return Array.from({ length: 10 }, (_, bucketIndex) => ({
    bucketIndex,
    midAngle: pitchNumberToAngle(bucketIndex * 100 + 50),
    last100Pct: recentPitches.length
      ? Math.round((recentCounts[bucketIndex] / recentPitches.length) * 100)
      : 0,
    allTimePct: Math.round((allTimeCounts[bucketIndex] / pitchRows.length) * 100),
  }));
}

function formatBucketUsageLabels(stats) {
  return [
    `Last 100: ${stats.last100Pct}%`,
    `All Time: ${stats.allTimePct}%`,
  ];
}

function buildCircularGaussianKernel(sigma, radius) {
  const kernel = [];

  for (let offset = -radius; offset <= radius; offset += 1) {
    kernel.push(Math.exp(-(offset * offset) / (2 * sigma * sigma)));
  }

  return kernel;
}

function circularConvolve1d(values, kernel) {
  const length = values.length;
  const radius = Math.floor(kernel.length / 2);
  const result = new Float64Array(length);

  for (let index = 0; index < length; index += 1) {
    let sum = 0;
    let weightSum = 0;

    for (let offset = -radius; offset <= radius; offset += 1) {
      const sampleIndex = ((index + offset) % length + length) % length;
      const weight = kernel[offset + radius];
      sum += values[sampleIndex] * weight;
      weightSum += weight;
    }

    result[index] = weightSum > 0 ? sum / weightSum : 0;
  }

  return result;
}

function pitchNumberToDensityBinPosition(pitchNumber) {
  return ((pitchNumber - 1) / PITCH_MAX) * PITCH_DENSITY_BIN_COUNT;
}

function sampleCircularArray(values, position) {
  const length = values.length;
  const wrapped = ((position % length) + length) % length;
  const lower = Math.floor(wrapped);
  const upper = (lower + 1) % length;
  const progress = wrapped - lower;

  return values[lower] * (1 - progress) + values[upper] * progress;
}

function buildPitchDensityProfile(pitchRows) {
  if (!pitchRows.length) {
    return null;
  }

  const counts = new Float64Array(PITCH_DENSITY_BIN_COUNT);
  pitchRows.forEach(({ pitchNumber }) => {
    const binIndex = Math.min(
      PITCH_DENSITY_BIN_COUNT - 1,
      Math.floor(pitchNumberToDensityBinPosition(pitchNumber)),
    );
    counts[binIndex] += 1;
  });

  const kernel = buildCircularGaussianKernel(
    PITCH_DENSITY_KERNEL_SIGMA_BINS,
    PITCH_DENSITY_KERNEL_RADIUS_BINS,
  );
  const smoothed = circularConvolve1d(counts, kernel);
  const samples = [];

  for (let index = 0; index < PITCH_DENSITY_SAMPLE_COUNT; index += 1) {
    const pitchNumber = 1 + (index / PITCH_DENSITY_SAMPLE_COUNT) * (PITCH_MAX - 1);
    const density = sampleCircularArray(smoothed, pitchNumberToDensityBinPosition(pitchNumber));
    samples.push({
      pitchNumber,
      angle: pitchNumberToAngle(pitchNumber),
      density,
    });
  }

  const maxDensity = Math.max(...samples.map((sample) => sample.density));
  if (maxDensity <= 0) {
    return null;
  }

  samples.forEach((sample) => {
    const normalized = sample.density / maxDensity;
    sample.normalized = normalized;
    sample.radiusFraction = PITCH_DENSITY_BASE_RADIUS + (PITCH_DENSITY_MAX_BUMP * normalized);
  });

  return {
    samples,
    maxDensity,
    sampleCount: pitchRows.length,
  };
}

function drawPitchDensityRing(context, center, maxRadius, pitchDensityProfile) {
  if (!pitchDensityProfile?.samples?.length) {
    return;
  }

  const { samples } = pitchDensityProfile;

  context.save();
  context.beginPath();

  samples.forEach((sample, index) => {
    const point = polarToCanvas(sample.angle, sample.radiusFraction, center, maxRadius);
    if (index === 0) {
      context.moveTo(point.x, point.y);
    } else {
      context.lineTo(point.x, point.y);
    }
  });

  for (let index = samples.length - 1; index >= 0; index -= 1) {
    const point = polarToCanvas(
      samples[index].angle,
      PITCH_DENSITY_BASE_RADIUS,
      center,
      maxRadius,
    );
    context.lineTo(point.x, point.y);
  }

  context.closePath();
  context.fillStyle = PITCH_DENSITY_FILL_COLOR;
  context.fill();
  context.strokeStyle = PITCH_DENSITY_STROKE_COLOR;
  context.lineWidth = 2.5;
  context.lineJoin = 'round';
  context.lineCap = 'round';
  context.stroke();
  context.restore();
}

function drawTextAlongArc(context, center, maxRadius, text, midAngle, radiusFraction, color, fontSize) {
  context.save();
  context.font = `600 ${fontSize}px "Segoe UI", system-ui, sans-serif`;
  context.fillStyle = color;

  const radius = radiusFraction * maxRadius;
  const totalWidth = context.measureText(text).width;
  const arcSpan = totalWidth / radius;
  const traverseBackward = shouldTraverseArcBackward(midAngle);
  const chars = [...text];
  let angle = traverseBackward
    ? midAngle + arcSpan / 2
    : midAngle - arcSpan / 2;

  for (const char of chars) {
    const charWidth = context.measureText(char).width;
    const charAngle = charWidth / radius;
    const charMidAngle = traverseBackward
      ? angle - charAngle / 2
      : angle + charAngle / 2;
    const point = polarToCanvas(charMidAngle, radiusFraction, center, maxRadius);
    const rotation = getBucketArcLabelRotation(charMidAngle);

    context.save();
    context.translate(point.x, point.y);
    context.rotate(rotation);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(char, 0, 0);
    context.restore();

    angle += traverseBackward ? -charAngle : charAngle;
  }

  context.restore();
}

function drawSpiralBucketUsageLabels(context, center, maxRadius, bucketUsageStats) {
  if (!bucketUsageStats.length) {
    return;
  }

  context.save();
  const fontSize = 9 * SPIRAL_TEXT_SCALE;
  const centerRadiusPx = getBucketUsageLabelRadiusPx(maxRadius);
  const lineHalfSeparationPx = (fontSize / 2) + (BUCKET_USAGE_LINE_GAP_PX / 2);
  const recentRadiusFraction = (centerRadiusPx - lineHalfSeparationPx) / maxRadius;
  const allTimeRadiusFraction = (centerRadiusPx + lineHalfSeparationPx) / maxRadius;

  bucketUsageStats.forEach((stats) => {
    const [recentLine, allTimeLine] = formatBucketUsageLabels(stats);
    drawTextAlongArc(
      context,
      center,
      maxRadius,
      recentLine,
      stats.midAngle,
      recentRadiusFraction,
      BUCKET_USAGE_LABEL_COLOR,
      fontSize,
    );
    drawTextAlongArc(
      context,
      center,
      maxRadius,
      allTimeLine,
      stats.midAngle,
      allTimeRadiusFraction,
      BUCKET_USAGE_LABEL_COLOR,
      fontSize,
    );
  });

  context.restore();
}

function drawSpiralGuide(context, center, maxRadius, bucketUsageStats = []) {
  context.save();
  context.strokeStyle = `${CHART_MUTED}, 0.12)`;
  context.lineWidth = 1;

  [SPIRAL_MIN_RADIUS, SPIRAL_MAX_RADIUS].forEach((radiusFraction) => {
    context.beginPath();
    context.arc(center, center, radiusFraction * maxRadius, 0, TWO_PI);
    context.stroke();
  });

  const guideRadius = SPIRAL_GUIDE_OUTER_RADIUS * maxRadius;

  for (let pitch = 0; pitch <= PITCH_MAX; pitch += 100) {
    const angle = pitchNumberToAngle(pitch);
    const x = center + Math.sin(angle) * guideRadius;
    const y = center - Math.cos(angle) * guideRadius;

    context.beginPath();
    context.moveTo(center, center);
    context.lineTo(x, y);
    context.stroke();
  }

  context.fillStyle = `${CHART_MUTED}, 0.85)`;
  context.font = `${10 * SPIRAL_TEXT_SCALE}px "Segoe UI", system-ui, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  for (let pitch = 0; pitch <= PITCH_MAX; pitch += 100) {
    const angle = pitchNumberToAngle(pitch);
    const labelRadius = getSpiralAxisLabelRadiusFraction(maxRadius) * maxRadius;
    const x = center + Math.sin(angle) * labelRadius;
    const y = center - Math.cos(angle) * labelRadius;
    const label = pitch === 0 ? '1000' : String(pitch);
    context.fillText(label, x, y);
  }

  drawSpiralBucketUsageLabels(context, center, maxRadius, bucketUsageStats);

  context.restore();
}

function drawSpiralConnector(context, fromPoint, toPoint, center, maxRadius) {
  const lineDash = getConnectorLineDash(fromPoint, toPoint);

  context.beginPath();
  context.moveTo(fromPoint.x, fromPoint.y);

  for (let step = 1; step <= SPIRAL_CONNECTOR_STEPS; step += 1) {
    const progress = step / SPIRAL_CONNECTOR_STEPS;
    const pitchNumber = interpolatePitchNumber(
      fromPoint.pitchNumber,
      toPoint.pitchNumber,
      progress,
    );
    const radiusFraction = fromPoint.radius
      + (toPoint.radius - fromPoint.radius) * progress;
    const sample = polarToCanvas(
      pitchNumberToAngle(pitchNumber),
      radiusFraction,
      center,
      maxRadius,
    );
    context.lineTo(sample.x, sample.y);
  }

  context.setLineDash(lineDash);
  context.stroke();
  context.setLineDash([]);
}

function drawSpiralPoint(context, point, isLatest) {
  const radius = isLatest ? SPIRAL_LATEST_RADIUS : SPIRAL_POINT_RADIUS;
  const label = String(point.pitchNumber);

  context.beginPath();
  context.fillStyle = point.color;
  context.arc(point.x, point.y, radius, 0, TWO_PI);
  context.fill();

  context.strokeStyle = CHART_CANVAS_STROKE;
  context.lineWidth = 1;
  context.stroke();

  let fontSize = label.length >= 3 ? 7 * SPIRAL_TEXT_SCALE : 8 * SPIRAL_TEXT_SCALE;
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  while (fontSize > 5 * SPIRAL_TEXT_SCALE) {
    context.font = `600 ${fontSize}px "Segoe UI", system-ui, sans-serif`;
    if (context.measureText(label).width <= radius * 1.5) {
      break;
    }
    fontSize -= 1;
  }

  context.font = `600 ${fontSize}px "Segoe UI", system-ui, sans-serif`;
  context.lineJoin = 'round';
  context.lineWidth = Math.max(1, fontSize * 0.11);
  context.strokeStyle = '#000000';
  context.strokeText(label, point.x, point.y);
  context.fillStyle = '#ffffff';
  context.fillText(label, point.x, point.y);

  if (isLatest) {
    context.beginPath();
    context.strokeStyle = 'rgba(239, 232, 245, 0.95)';
    context.lineWidth = 2;
    context.arc(point.x, point.y, radius + 3, 0, TWO_PI);
    context.stroke();
  }
}

function traceAnnularBandByPitch(
  context,
  center,
  maxRadius,
  pitchA,
  pitchB,
  innerRadiusFraction,
  outerRadiusFraction,
) {
  const steps = Math.max(4, Math.ceil(Math.abs(getShortestPitchDelta(pitchA, pitchB)) / 8));

  context.beginPath();

  for (let step = 0; step <= steps; step += 1) {
    const pitchNumber = interpolatePitchNumber(pitchA, pitchB, step / steps);
    const point = polarToCanvas(
      pitchNumberToAngle(pitchNumber),
      outerRadiusFraction,
      center,
      maxRadius,
    );

    if (step === 0) {
      context.moveTo(point.x, point.y);
    } else {
      context.lineTo(point.x, point.y);
    }
  }

  for (let step = steps; step >= 0; step -= 1) {
    const pitchNumber = interpolatePitchNumber(pitchA, pitchB, step / steps);
    const point = polarToCanvas(
      pitchNumberToAngle(pitchNumber),
      innerRadiusFraction,
      center,
      maxRadius,
    );
    context.lineTo(point.x, point.y);
  }

  context.closePath();
}

function drawRadialHatchInAnnularBand(
  context,
  center,
  maxRadius,
  pitchA,
  pitchB,
  innerRadiusFraction,
  outerRadiusFraction,
  hatchColor,
) {
  context.save();
  traceAnnularBandByPitch(
    context,
    center,
    maxRadius,
    pitchA,
    pitchB,
    innerRadiusFraction,
    outerRadiusFraction,
  );
  context.clip();

  const pitchSpan = Math.abs(getShortestPitchDelta(pitchA, pitchB));
  const steps = Math.max(6, Math.ceil(pitchSpan / ATTACK_ZONE_HATCH_PITCH_STEP));

  context.strokeStyle = hatchColor;
  context.lineWidth = 1.1;
  context.lineCap = 'round';

  for (let step = 0; step <= steps; step += 1) {
    const pitchNumber = interpolatePitchNumber(pitchA, pitchB, step / steps);
    const angle = pitchNumberToAngle(pitchNumber);
    const inner = polarToCanvas(angle, innerRadiusFraction, center, maxRadius);
    const outer = polarToCanvas(angle, outerRadiusFraction, center, maxRadius);

    context.beginPath();
    context.moveTo(inner.x, inner.y);
    context.lineTo(outer.x, outer.y);
    context.stroke();
  }

  context.restore();
}

function drawOuterAnnularBandByPitch(
  context,
  center,
  maxRadius,
  pitchA,
  pitchB,
  innerRadiusFraction,
  outerRadiusFraction,
  fillColor,
  strokeColor = null,
) {
  context.fillStyle = fillColor;
  traceAnnularBandByPitch(
    context,
    center,
    maxRadius,
    pitchA,
    pitchB,
    innerRadiusFraction,
    outerRadiusFraction,
  );
  context.fill();

  if (strokeColor) {
    context.strokeStyle = strokeColor;
    context.lineWidth = 1.5;
    context.stroke();
  }
}

function drawAttackZoneBand(context, center, maxRadius, attackMin, attackMax) {
  context.save();

  drawOuterAnnularBandByPitch(
    context,
    center,
    maxRadius,
    attackMin,
    attackMax,
    ATTACK_ZONE_BAND_INNER_RADIUS,
    ATTACK_ZONE_BAND_OUTER_RADIUS,
    ATTACK_ZONE_BAND_FILL,
    ATTACK_ZONE_BAND_STROKE,
  );

  drawRadialHatchInAnnularBand(
    context,
    center,
    maxRadius,
    attackMin,
    attackMax,
    ATTACK_ZONE_BAND_INNER_RADIUS,
    ATTACK_ZONE_BAND_OUTER_RADIUS,
    ATTACK_ZONE_BAND_STROKE,
  );

  context.restore();
}

function drawHypotheticalSwing(context, center, maxRadius, swingNumber) {
  const angle = pitchNumberToAngle(swingNumber);
  const point = polarToCanvas(angle, SPIRAL_MAX_RADIUS, center, maxRadius);
  const targetRadius = 10;

  context.save();
  context.strokeStyle = HYPOTHETICAL_SWING_COLOR;
  context.fillStyle = HYPOTHETICAL_SWING_COLOR;
  context.lineWidth = HYPOTHETICAL_SWING_LINE_WIDTH;
  context.lineCap = 'round';

  context.beginPath();
  context.moveTo(center, center);
  context.lineTo(point.x, point.y);
  context.stroke();

  context.beginPath();
  context.arc(point.x, point.y, targetRadius, 0, TWO_PI);
  context.stroke();

  context.beginPath();
  context.arc(point.x, point.y, targetRadius * 0.35, 0, TWO_PI);
  context.stroke();

  context.beginPath();
  context.moveTo(point.x - targetRadius - 3, point.y);
  context.lineTo(point.x + targetRadius + 3, point.y);
  context.moveTo(point.x, point.y - targetRadius - 3);
  context.lineTo(point.x, point.y + targetRadius + 3);
  context.stroke();

  context.restore();
}

function mapSituationViewPoint(centerX, centerY, pixelSize, x, y) {
  const scale = pixelSize / SITUATION_VIEWBOX.width;
  return {
    x: centerX + (x - SITUATION_VIEWBOX.minX - SITUATION_VIEWBOX.width / 2) * scale,
    y: centerY + (y - SITUATION_VIEWBOX.minY - SITUATION_VIEWBOX.height / 2) * scale,
  };
}

function drawMiniSituationGraphic(
  context,
  centerX,
  centerY,
  pixelSize,
  situation,
  accentColor,
  { runsScored = 0, inningEnded = false } = {},
) {
  const baseShapes = [
    {
      active: situation.onSecond,
      points: [[50, 21], [58, 29], [50, 37], [42, 29]],
    },
    {
      active: situation.onThird,
      points: [[41, 30], [49, 38], [41, 46], [33, 38]],
    },
    {
      active: situation.onFirst,
      points: [[59, 30], [67, 38], [59, 46], [51, 38]],
    },
  ];
  const outCircles = [
    { active: situation.outs >= 1, x: 44.75, y: 56, radius: 4.5 },
    { active: situation.outs >= 2, x: 55.25, y: 56, radius: 4.5 },
  ];
  const scale = pixelSize / SITUATION_VIEWBOX.width;

  context.save();
  context.lineWidth = Math.max(0.8, scale * 1.4);
  context.strokeStyle = `${CHART_MUTED}, 0.9)`;

  baseShapes.forEach(({ active, points }) => {
    context.beginPath();
    points.forEach(([x, y], index) => {
      const mapped = mapSituationViewPoint(centerX, centerY, pixelSize, x, y);
      if (index === 0) {
        context.moveTo(mapped.x, mapped.y);
      } else {
        context.lineTo(mapped.x, mapped.y);
      }
    });
    context.closePath();
    if (active) {
      context.fillStyle = accentColor;
      context.fill();
    }
    context.stroke();
  });

  outCircles.forEach(({ active, x, y, radius }) => {
    const mapped = mapSituationViewPoint(centerX, centerY, pixelSize, x, y);
    context.beginPath();
    context.arc(mapped.x, mapped.y, radius * scale, 0, TWO_PI);
    if (active) {
      context.fillStyle = accentColor;
      context.fill();
    }
    context.stroke();
  });

  const annotationFontSize = Math.max(9 * SPIRAL_TEXT_SCALE, Math.round(scale * 5.8 * SPIRAL_TEXT_SCALE));
  const lineHeight = annotationFontSize + 2;
  let textY = mapSituationViewPoint(centerX, centerY, pixelSize, 50, 64).y + Math.max(4, scale * 1.8);

  context.textAlign = 'center';
  context.textBaseline = 'top';
  context.font = `600 ${annotationFontSize}px "Segoe UI", system-ui, sans-serif`;

  if (runsScored > 0) {
    context.fillStyle = SITUATION_RUNS_TEXT_COLOR;
    context.fillText(
      `+${runsScored} run${runsScored === 1 ? '' : 's'}`,
      centerX,
      textY,
    );
    textY += lineHeight;
  }

  if (inningEnded) {
    context.fillStyle = SITUATION_INNING_END_TEXT_COLOR;
    context.fillText('Inning ends', centerX, textY);
  }

  context.restore();
}

function drawRangeBoundaryTick(context, center, maxRadius, pitchNumber, lineColor) {
  const angle = pitchNumberToAngle(pitchNumber);
  const start = polarToCanvas(angle, getRangeMarkerInnerRadiusFraction(maxRadius), center, maxRadius);
  const end = polarToCanvas(angle, getRangeMarkerOuterRadiusFraction(maxRadius), center, maxRadius);

  context.strokeStyle = lineColor;
  context.lineWidth = RANGE_BOUNDARY_TICK_WIDTH;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(end.x, end.y);
  context.stroke();
}

function drawRangeMarkers(context, center, maxRadius, regions, swingAnchor) {
  if (regions.length === 0) {
    return;
  }

  context.save();
  context.lineCap = 'round';

  const outTransitionBoundaries = collectOutTransitionBoundaries(regions, swingAnchor);
  const drawnBoundaryLines = new Set();
  regions.forEach((region) => {
    region.boundaryLines.forEach((pitchNumber) => {
      if (drawnBoundaryLines.has(pitchNumber)) {
        return;
      }

      drawnBoundaryLines.add(pitchNumber);
      const tickColor = outTransitionBoundaries.has(pitchNumber)
        ? hexToRgba(RESULT_CATEGORY_COLORS.Out, RANGE_MARKER_OPACITY)
        : region.lineColor;
      drawRangeBoundaryTick(context, center, maxRadius, pitchNumber, tickColor);
    });
  });

  context.restore();
}

function drawRangeStartSituationMarkers(context, center, maxRadius, regions) {
  if (regions.length === 0) {
    return;
  }

  context.save();

  const drawnBandMarkers = new Set();
  regions.forEach((region) => {
    region.bandMarkers.forEach((marker) => {
      const markerKey = `${marker.variant}:${marker.pitchNumber}:${getSituationKey(region.situation)}`;
      if (drawnBandMarkers.has(markerKey)) {
        return;
      }

      drawnBandMarkers.add(markerKey);
      const labelAngle = pitchNumberToAngle(marker.pitchNumber);
      const labelPoint = polarToCanvas(
        labelAngle,
        getSituationMiniRadiusFraction(maxRadius),
        center,
        maxRadius,
      );
      drawMiniSituationGraphic(
        context,
        labelPoint.x,
        labelPoint.y,
        SITUATION_MINI_PIXEL_SIZE,
        region.situation,
        region.markerColor,
        {
          runsScored: region.runsScored,
          inningEnded: region.inningEnded,
        },
      );
    });
  });

  context.restore();
}

function drawPitchSpiralScene(
  context,
  center,
  maxRadius,
  points,
  forwardDeltaOverlay = null,
  proximityDeltaOverlay = null,
  attackZone = null,
  rangeRegions = [],
  bucketUsageStats = [],
  pitchDensityProfile = null,
  options = {},
) {
  const { skipConnectors = false } = options;
  drawSpiralGuide(context, center, maxRadius, bucketUsageStats);
  drawPitchDensityRing(context, center, maxRadius, pitchDensityProfile);

  context.lineWidth = 2;
  context.lineCap = 'round';
  context.lineJoin = 'round';

  if (!skipConnectors) {
    for (let index = 1; index < points.length; index += 1) {
      const fromPoint = points[index - 1];
      const toPoint = points[index];
      const isTransition = fromPoint.game !== toPoint.game
        || fromPoint.inning !== toPoint.inning;

      context.strokeStyle = isTransition
        ? SPIRAL_TRANSITION_CONNECTOR_COLOR
        : hexToRgba(fromPoint.color, SPIRAL_CONNECTOR_OPACITY);
      drawSpiralConnector(context, fromPoint, toPoint, center, maxRadius);
    }
  }

  if (attackZone) {
    drawAttackZoneBand(context, center, maxRadius, attackZone.attackMin, attackZone.attackMax);
  }

  points.forEach((point, index) => {
    drawSpiralPoint(context, point, index === points.length - 1);
  });

  if (forwardDeltaOverlay) {
    drawSpiralDeltaOverlay(context, center, maxRadius, forwardDeltaOverlay);
  }

  if (proximityDeltaOverlay) {
    drawSpiralDeltaOverlay(context, center, maxRadius, proximityDeltaOverlay);
  }

  if (rangeRegions.length > 0 && attackZone) {
    drawRangeMarkers(context, center, maxRadius, rangeRegions, attackZone.target);
  }

  if (rangeRegions.length > 0 && attackZone) {
    drawRangeStartSituationMarkers(context, center, maxRadius, rangeRegions);
  }

  if (attackZone) {
    drawHypotheticalSwing(context, center, maxRadius, attackZone.target);
  }
}

function appendDeltaOverlayLegendItem(parent, overlay, label) {
  if (!overlay) {
    return;
  }

  const item = document.createElement('span');
  item.className = 'result-legend-item';

  const swatch = document.createElement('span');
  swatch.className = 'result-legend-swatch result-legend-swatch--ring';
  swatch.style.borderColor = overlay.color;
  swatch.style.backgroundColor = hexToRgba(overlay.color, 0.28);

  const text = document.createElement('span');
  text.textContent = label;

  item.append(swatch, text);
  parent.appendChild(item);
}

function appendAttackZoneLegendItem(parent) {
  const item = document.createElement('span');
  item.className = 'result-legend-item';

  const swatch = document.createElement('span');
  swatch.className = 'result-legend-swatch result-legend-swatch--ring result-legend-swatch--attack-zone';
  swatch.style.borderColor = ATTACK_ZONE_BAND_STROKE;

  const text = document.createElement('span');
  text.textContent = 'Attack Zone';

  item.append(swatch, text);
  parent.appendChild(item);
}

function appendPitchDensityLegendItem(parent) {
  const item = document.createElement('span');
  item.className = 'result-legend-item';

  const swatch = document.createElement('span');
  swatch.className = 'connector-line-swatch';
  swatch.style.borderTopColor = PITCH_DENSITY_STROKE_COLOR;

  const text = document.createElement('span');
  text.textContent = 'Pitch Density';

  item.append(swatch, text);
  parent.appendChild(item);
}

function renderSpiralLegend(
  categories,
  forwardDeltaOverlay = null,
  proximityDeltaOverlay = null,
  attackZone = null,
  options = {},
) {
  const { firstPitchMode = false, pitchDensityProfile = null } = options;
  const legend = document.createElement('div');
  legend.className = 'result-legend result-legend--top';

  const resultsRow = document.createElement('div');
  resultsRow.className = 'result-legend-row';

  categories.forEach((category) => {
    const item = document.createElement('span');
    item.className = 'result-legend-item';

    const swatch = document.createElement('span');
    swatch.className = 'result-legend-swatch';
    swatch.style.backgroundColor = RESULT_CATEGORY_COLORS[category];

    const label = document.createElement('span');
    label.textContent = category;

    item.append(swatch, label);
    resultsRow.appendChild(item);
  });

  if (!firstPitchMode) {
    [
      { label: 'Inning change', swatchClass: 'connector-line-swatch connector-line-swatch--dotted' },
      { label: 'Game change', swatchClass: 'connector-line-swatch connector-line-swatch--dashed' },
    ].forEach(({ label, swatchClass }) => {
      const item = document.createElement('span');
      item.className = 'result-legend-item';

      const swatch = document.createElement('span');
      swatch.className = swatchClass;

      const text = document.createElement('span');
      text.textContent = label;

      item.append(swatch, text);
      resultsRow.appendChild(item);
    });
  }

  legend.appendChild(resultsRow);

  if (pitchDensityProfile || forwardDeltaOverlay || proximityDeltaOverlay || attackZone) {
    const overlayRow = document.createElement('div');
    overlayRow.className = 'result-legend-row';

    if (pitchDensityProfile) {
      appendPitchDensityLegendItem(overlayRow);
    }

    if (attackZone) {
      appendAttackZoneLegendItem(overlayRow);
    }

    if (firstPitchMode) {
      appendDeltaOverlayLegendItem(
        overlayRow,
        proximityDeltaOverlay,
        'First Pitches',
      );
    } else {
      appendDeltaOverlayLegendItem(
        overlayRow,
        forwardDeltaOverlay,
        'Next Pitch Range by Result',
      );
      appendDeltaOverlayLegendItem(
        overlayRow,
        proximityDeltaOverlay,
        'Next Pitch Range by Number',
      );
    }

    legend.appendChild(overlayRow);
  }

  return legend;
}

function attachSpiralZoom(canvas, drawScene) {
  const view = { scale: SPIRAL_ZOOM_DEFAULT };
  const center = SPIRAL_CANVAS_SIZE / 2;
  const pixelSize = SPIRAL_CANVAS_SIZE * SPIRAL_RENDER_SCALE;

  canvas.width = pixelSize;
  canvas.height = pixelSize;

  function redraw() {
    const context = canvas.getContext('2d');
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = CHART_CANVAS_COLOR;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.scale(SPIRAL_RENDER_SCALE, SPIRAL_RENDER_SCALE);
    context.translate(center, center);
    context.scale(view.scale, view.scale);
    context.translate(-center, -center);
    drawScene(context);
    context.restore();
  }

  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();

    const zoomMultiplier = event.deltaY < 0 ? SPIRAL_ZOOM_STEP : 1 / SPIRAL_ZOOM_STEP;
    view.scale = Math.min(
      SPIRAL_ZOOM_MAX,
      Math.max(SPIRAL_ZOOM_MIN, view.scale * zoomMultiplier),
    );
    redraw();
  }, { passive: false });

  redraw();

  return { redraw };
}

function renderPitchSpiral(pitcherAnalytics, pitcherName, batterName) {
  const card = createChartCard(
    'Tornado Graph',
    'Pitch number sets angle from top (pitch # × 360 ÷ 1000). Shows the last 25 pitches; stats and overlays use all available seasons. A smoothed pitch-density ring in the inner chart grows outward where that pitch number appears more often. Purple curved labels between axis ticks show each 100-pitch bucket’s share of the last 100 pitches vs all-time. Scroll to zoom.',
  );
  card.classList.add('chart-card--wide', 'chart-card--spiral');

  const {
    allPitchRows,
    visiblePitchRows,
    bucketUsageStats,
    pitchDensityProfile,
    attackZone,
    rows: pitcherRows,
  } = pitcherAnalytics;

  if (allPitchRows.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = pitcherName
      ? `No pitch data for ${pitcherName}.`
      : 'Select a pitcher to view pitch history.';
    card.appendChild(empty);
    return card;
  }

  const center = SPIRAL_CANVAS_SIZE / 2;
  const maxRadius = SPIRAL_CANVAS_SIZE * SPIRAL_RADIUS_SCALE;
  const points = buildSpiralPoints(visiblePitchRows, center, maxRadius);
  const { forward: forwardDeltaOverlay, proximity: proximityDeltaOverlay } = getSpiralOverlays(
    pitcherName,
    pitcherRows,
    allPitchRows,
  );
  const rangeTable = buildMatchupRangeTable(pitcherName, batterName);
  const baseSituation = getSituationState();
  const rangeRegions = attackZone && rangeTable
    ? buildRangeSpiralMarkers(rangeTable.rows, attackZone.target, baseSituation)
    : [];
  const rangeOverlaySummary = buildSpiralRangeOverlaySummary(
    forwardDeltaOverlay,
    proximityDeltaOverlay,
    { firstPitchMode: firstPitchModeActive },
  );
  const swingSummary = buildSpiralSwingSummary(
    attackZone,
    rangeTable?.rows ?? null,
  );
  const legend = renderSpiralLegend(
    getActiveResultCategories(points),
    forwardDeltaOverlay,
    proximityDeltaOverlay,
    attackZone,
    { firstPitchMode: firstPitchModeActive, pitchDensityProfile },
  );

  const stage = document.createElement('div');
  stage.className = 'spiral-stage';

  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'spiral-canvas-wrap';

  const canvas = document.createElement('canvas');
  canvas.className = 'spiral-canvas';
  canvas.setAttribute('role', 'img');
  const overlayLabels = firstPitchModeActive
    ? (proximityDeltaOverlay ? ['First Pitches overlay'] : [])
    : [
      forwardDeltaOverlay ? `${forwardDeltaOverlay.categoryLabel} category overlay` : null,
      proximityDeltaOverlay ? `pitch ±${LIVE_PROXIMITY_PITCH_TOLERANCE} overlay` : null,
    ].filter(Boolean);
  canvas.setAttribute(
    'aria-label',
    overlayLabels.length > 0
      ? `Tornado Graph for ${pitcherName} with last ${visiblePitchRows.length} of ${allPitchRows.length.toLocaleString()} pitches and ${overlayLabels.join(' and ')}.`
      : `Tornado Graph for ${pitcherName} with last ${visiblePitchRows.length} of ${allPitchRows.length.toLocaleString()} pitches colored by result category.`,
  );

  canvasWrap.appendChild(canvas);
  canvasWrap.appendChild(createSpiralSwingOverlay(swingSummary));
  canvasWrap.appendChild(createSpiralRangeOverlay(rangeOverlaySummary));
  if (firstPitchModeActive) {
    canvasWrap.appendChild(createSpiralFirstPitchModeOverlay());
  }
  stage.append(legend, canvasWrap);

  const spiralController = attachSpiralZoom(canvas, (context) => {
    drawPitchSpiralScene(
      context,
      center,
      maxRadius,
      points,
      forwardDeltaOverlay,
      proximityDeltaOverlay,
      attackZone,
      rangeRegions,
      bucketUsageStats,
      pitchDensityProfile,
      { skipConnectors: firstPitchModeActive },
    );
  });
  spiralRedraw = spiralController.redraw;

  const meta = document.createElement('p');
  meta.className = 'spiral-legend';
  const metaParts = [];

  metaParts.push(`${allPitchRows.length.toLocaleString()} pitches · last ${visiblePitchRows.length} shown`);

  if (pitchDensityProfile) {
    metaParts.push('smoothed pitch-density ring · all history by pitch number');
  }

  if (firstPitchModeActive) {
    metaParts.push('first pitch mode · one pitch per game');
  }

  if (forwardDeltaOverlay) {
    metaParts.push(formatForwardDeltaCaption(forwardDeltaOverlay));
  }

  if (proximityDeltaOverlay) {
    metaParts.push(formatForwardDeltaCaption(proximityDeltaOverlay));
  }

  if (rangeRegions.length > 0) {
    metaParts.push(`projected situation bands · ${rangeRegions.length} situations`);
  }

  metaParts.push(firstPitchModeActive
    ? 'scroll to zoom · white ring marks most recent first pitch'
    : 'scroll to zoom · white ring marks most recent pitch');
  meta.textContent = metaParts.join(' · ');
  stage.appendChild(meta);
  card.appendChild(stage);
  return card;
}

function getInferredLiveSituation() {
  return inferSituationFromPlays(allRows, {
    gameNumber: liveTargetGame?.game?.['Game#'],
    offenseTeam: SHEET_CONFIG.scoutTeamAbv,
  });
}

function formatInferredSituationCaption(situation) {
  if (situation.source !== 'inferred') {
    return 'Waiting for SUN offensive plays in the locked game.';
  }

  const details = [
    situation.inning ? `Inning ${situation.inning}` : '',
    situation.play ? `Play ${situation.play}` : '',
  ].filter(Boolean);

  return details.length > 0
    ? `Inferred from ${details.join(' · ')}`
    : 'Inferred from the latest SUN offensive play';
}

function renderInferredSituationGraphic(situation, container) {
  if (!container) {
    return;
  }

  container.querySelector('.situation-base--first')
    ?.classList.toggle('is-active', situation.onFirst);
  container.querySelector('.situation-base--second')
    ?.classList.toggle('is-active', situation.onSecond);
  container.querySelector('.situation-base--third')
    ?.classList.toggle('is-active', situation.onThird);
  container.querySelector('.situation-out--1')
    ?.classList.toggle('is-active', situation.outs >= 1);
  container.querySelector('.situation-out--2')
    ?.classList.toggle('is-active', situation.outs >= 2);

  const labelParts = [];
  if (situation.onFirst) {
    labelParts.push('runner on first');
  }
  if (situation.onSecond) {
    labelParts.push('runner on second');
  }
  if (situation.onThird) {
    labelParts.push('runner on third');
  }
  labelParts.push(`${situation.outs} out${situation.outs === 1 ? '' : 's'}`);

  container.setAttribute('aria-label', labelParts.join(', '));
  container.title = formatInferredSituationCaption(situation);
}

function getSituationState() {
  return inferredSituation ?? getInferredLiveSituation();
}

/*
 * LEGACY: range table card and manual situation panel
 * function renderRangeTableCard(pitcherName, batterName) { ... }
 * function updateSituationPanel() { ... }
 * function getManualSituationState() { ... }
 */

function renderDashboard(pitcherAnalytics, pitcherName, batterName) {
  spiralRedraw = null;

  if (!pitcherAnalytics || pitcherAnalytics.allPitchRows.length === 0) {
    chartGrid.replaceChildren();
    return;
  }

  const loading = document.createElement('p');
  loading.className = 'empty-state';
  loading.textContent = 'Rendering tornado graph...';
  chartGrid.replaceChildren(loading);

  requestAnimationFrame(() => {
    chartGrid.replaceChildren(renderPitchSpiral(pitcherAnalytics, pitcherName, batterName));
  });
}

function updateDashboard() {
  refreshLiveTargetGame();
  updateHeroStatus();

  const pitchers = getAvailablePitchers();
  populatePitcherDropdown(pitchers);

  const selectedPitcher = pitcherSelect.value;
  if (selectedPitcher !== lastSelectedPitcher) {
    lastSelectedPitcher = selectedPitcher;
  }

  if (!selectedPitcher) {
    rowCountEl.textContent = '0 plays';
    batterSelect.replaceChildren();
    pitcherStatsEl?.replaceChildren();
    batterStatsEl?.replaceChildren();
    chartGrid.replaceChildren();
    return;
  }

  const filteredRows = getPitcherDisplayRows(selectedPitcher);
  const pitcherAnalytics = getPitcherAnalytics(selectedPitcher);
  const batters = getAvailableBatters();
  populateBatterDropdown(batters, filteredRows);

  const selectedBatter = batterSelect.value;
  rowCountEl.textContent = `${filteredRows.length.toLocaleString()} plays`;
  renderMatchupStatsInline(selectedPitcher, selectedBatter, pitcherAnalytics);
  renderDashboard(pitcherAnalytics, selectedPitcher, selectedBatter);
}

async function loadSheetData({ forceRefresh = false } = {}) {
  if (isLoadingSheet) {
    return;
  }

  isLoadingSheet = true;
  setSyncLoading(true);
  setStatus(forceRefresh ? 'Syncing sheet data...' : 'Loading sheet data...');

  try {
    const historicalPromise = loadHistoricalPlays(forceRefresh);
    const [playsResponse, playerStats, gamesMatrix, datesMatrix] = await Promise.all([
      fetch(getSheetCsvUrl(SHEET_CONFIG.sheetName, { bustCache: forceRefresh }), {
        cache: forceRefresh ? 'no-store' : 'default',
      }),
      loadPlayerStatsByName({ forceRefresh }),
      fetchSheetMatrix(SHEET_CONFIG.gamesSheetName, { forceRefresh }).catch((error) => {
        console.warn('Games tab unavailable', error);
        return [];
      }),
      fetchSheetMatrix(SHEET_CONFIG.datesSheetName, { forceRefresh }).catch((error) => {
        console.warn('Dates tab unavailable', error);
        return [];
      }),
    ]);

    if (!playsResponse.ok) {
      throw new Error(`Plays sheet request failed (${playsResponse.status})`);
    }

    const playsCsvText = await playsResponse.text();
    const playsMatrix = parseCsv(playsCsvText);
    allRows = parsePlaysMatrix(playsMatrix).map(normalizePlayRow);
    allGames = rowsToObjects(gamesMatrix);
    sessionDates = parseSessionDates(rowsToObjects(datesMatrix));
    playerStatsByName = playerStats;
    historicalRows = [];
    rebuildPitcherIndex();
    refreshLiveTargetGame();
    updateDashboard();
    setStatus(
      `${forceRefresh ? 'Synced' : 'Loaded'} ${allRows.length.toLocaleString()} plays · loading historical...`,
    );

    historicalRows = await historicalPromise;
    rebuildPitcherIndex();
    refreshLiveTargetGame();
    updateDashboard();
    setStatus(
      `${forceRefresh ? 'Synced' : 'Loaded'} ${allRows.length.toLocaleString()} plays`
      + `${historicalRows.length > 0 ? ` · ${historicalRows.length.toLocaleString()} historical` : ''}`
      + ` · ${playerStatsByName.size.toLocaleString()} players · ${formatSyncTime(new Date())}`,
    );
  } catch (error) {
    console.error(error);
    setStatus(`Failed to load sheet: ${error.message}`, true);
  } finally {
    isLoadingSheet = false;
    setSyncLoading(false);
  }
}

pitcherSelect.addEventListener('change', updateDashboard);
batterSelect.addEventListener('change', updateDashboard);
firstPitchModeCheckbox?.addEventListener('change', () => {
  firstPitchModeActive = firstPitchModeCheckbox.checked;
  updateFirstPitchModeBanner();
  updateDashboard();
});

/*
 * LEGACY event listeners:
 * scoutModeInputs.forEach((input) => input.addEventListener('change', updateDashboard));
 * hypotheticalSwingToggle.addEventListener('change', handleHypotheticalSwingToggle);
 * hypotheticalSwingInput.addEventListener('input', ...);
 * simulateSwingBtn.addEventListener('click', handleSimulateSwing);
 * syncSheetBtn.addEventListener('click', () => loadSheetData({ forceRefresh: true }));
 * pitchRecencySelect?.addEventListener('change', ...);
 * situationPanel?.addEventListener('change', ...);
 */

loadSheetData({ forceRefresh: false });
