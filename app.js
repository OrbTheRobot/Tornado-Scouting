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
  resolveSunTargetGame,
} from './liveScouting.js';

const PITCH_MIN = 1;
const PITCH_MAX = 1000;
const SWING_MIN = 0;
const SWING_MAX = 1000;
const HYPOTHETICAL_SWING_COLOR = 'rgba(255, 130, 130, 0.85)';
const RANGE_MARKER_OPACITY = 0.75;
const RANGE_BAND_FILL_OPACITY = 0.25;
const RANGE_MARKER_THICKNESS_FRACTION = 0.0625;
const RANGE_MARKER_START_FRACTION = 1 - RANGE_MARKER_THICKNESS_FRACTION;
const RANGE_MARKER_LINE_WIDTH = 1;
const LIVE_SPIRAL_GAME_COUNT = 3;
const LIVE_MATSUMOTO_SEASON_COUNT = 3;
const SPIRAL_CANVAS_SIZE = 960;
const SPIRAL_RENDER_SCALE = 3;
const SPIRAL_MIN_RADIUS = 0.03;
const SPIRAL_MAX_RADIUS = 0.88;
const SPIRAL_GUIDE_OUTER_RADIUS = SPIRAL_MAX_RADIUS + 0.08;
const DELTA_BAND_THICKNESS = 0.038;
const DELTA_BAND_GAP = 0.012;
const LIVE_PROXIMITY_PITCH_TOLERANCE = 50;
const DELTA_BAND_INNER_RADIUS = SPIRAL_GUIDE_OUTER_RADIUS + 0.055;
const DELTA_BAND_OUTER_RADIUS = DELTA_BAND_INNER_RADIUS + DELTA_BAND_THICKNESS;
const DELTA_BAND_MID_RADIUS = (DELTA_BAND_INNER_RADIUS + DELTA_BAND_OUTER_RADIUS) / 2;
const DELTA_BAND_LABEL_RADIUS = DELTA_BAND_OUTER_RADIUS + 0.016;
const DELTA_BAND_NUMBER_RADIUS = DELTA_BAND_OUTER_RADIUS + 0.008;
const PROXIMITY_DELTA_BAND_INNER_RADIUS = DELTA_BAND_OUTER_RADIUS + DELTA_BAND_GAP;
const PROXIMITY_DELTA_BAND_OUTER_RADIUS = PROXIMITY_DELTA_BAND_INNER_RADIUS + DELTA_BAND_THICKNESS;
const PROXIMITY_DELTA_BAND_MID_RADIUS = (
  PROXIMITY_DELTA_BAND_INNER_RADIUS + PROXIMITY_DELTA_BAND_OUTER_RADIUS
) / 2;
const PROXIMITY_DELTA_BAND_NUMBER_RADIUS = PROXIMITY_DELTA_BAND_OUTER_RADIUS + 0.008;
const DELTA_WHISKER_LINE_WIDTH = 1.5;
const PROXIMITY_DELTA_BAND_COLOR = '#9a93a8';
const RANGE_MARKER_RADIUS = SPIRAL_MAX_RADIUS + 0.012;
const RANGE_MARKER_LABEL_RADIUS = SPIRAL_MAX_RADIUS + 0.045;
const RANGE_LINE_NUMBER_RADIUS = RANGE_MARKER_RADIUS + 0.018;
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
const TWO_PI = Math.PI * 2;

const BASE_HIT_RESULTS = new Set(['1B', '1BWH', '2B', '2BWH', '3B', 'BB', 'IF1B']);
const OUT_RESULTS = new Set(['FO', 'GO', 'GORA', 'PO', 'DP', 'DP31', 'DPH1', 'FC']);
const STRIKEOUT_RESULTS = new Set(['K']);
const HOME_RUN_RESULTS = new Set(['HR']);

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
let isLoadingSheet = false;
let spiralRedraw = null;
let lastSelectedPitcher = '';
let inferredSituation = null;

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

function getCombinedRangeMedianPitch(forwardDeltaOverlay, proximityDeltaOverlay) {
  if (!forwardDeltaOverlay || !proximityDeltaOverlay) {
    return null;
  }

  const avgDelta = (
    forwardDeltaOverlay.stats.median + proximityDeltaOverlay.stats.median
  ) / 2;

  return pitchFromDisplayDelta(forwardDeltaOverlay.anchorPitch, avgDelta);
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

function bandMidPitchNumber(swingAnchor, innerHigh, outerHigh, direction) {
  const midOffset = (innerHigh + outerHigh) / 2;

  if (direction === 'down') {
    return normalizePitchNumber(swingAnchor - midOffset);
  }

  return normalizePitchNumber(swingAnchor + midOffset);
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

function createRangeRegion(result, swingAnchor, innerHigh, outerHigh, baseColor, isCenterWedge) {
  const fillColor = hexToRgba(baseColor, RANGE_BAND_FILL_OPACITY);
  const lineColor = hexToRgba(baseColor, RANGE_MARKER_OPACITY);

  return {
    result,
    fillColor,
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
    labelPitchNumbers: isCenterWedge
      ? [normalizePitchNumber(swingAnchor)]
      : [
        bandMidPitchNumber(swingAnchor, innerHigh, outerHigh, 'down'),
        bandMidPitchNumber(swingAnchor, innerHigh, outerHigh, 'up'),
      ],
  };
}

function buildRangeSpiralMarkers(rangeRows, swingAnchor) {
  if (swingAnchor === null) {
    return [];
  }

  const regions = [];
  const kRow = rangeRows.find((row) => row.result === 'K');
  const bracketRows = rangeRows.filter((row) => row.result !== 'K');

  bracketRows.forEach((row, index) => {
    const innerHigh = index === 0 ? 0 : bracketRows[index - 1].high;
    const category = normalizeResultCategory(row.result);
    regions.push(createRangeRegion(
      row.result,
      swingAnchor,
      innerHigh,
      row.high,
      RESULT_CATEGORY_COLORS[category],
      row.result === 'HR',
    ));
  });

  if (kRow) {
    const innermostOutHigh = bracketRows[bracketRows.length - 1]?.high ?? 0;
    regions.push(createRangeRegion(
      'K',
      swingAnchor,
      innermostOutHigh,
      kRow.high,
      RESULT_CATEGORY_COLORS.Strikeout,
      false,
    ));
  }

  return regions;
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
  const archiveRows = filterRowsByPitcher(historicalRows, pitcherName);
  const currentRows = filterRowsByPitcher(allRows, pitcherName);
  return dedupePlayRowsByGamePlay([...archiveRows, ...currentRows]);
}

function getPitcherDisplayRows(pitcherName) {
  const seasonSet = new Set(getMatsumotoSeasons());

  return getPitcherRowsForMatsumoto(pitcherName).filter((row) => {
    const season = parseGameSeason(row.Game);
    return season !== null && seasonSet.has(season);
  });
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

function getSpiralPitchRows(pitcherRows) {
  const pitchRows = getChronologicalPitchRows(pitcherRows);
  const recentGames = getRecentGameIds(pitcherRows, LIVE_SPIRAL_GAME_COUNT);
  return filterChronologicalPitchRowsByGames(pitchRows, recentGames);
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

  if (OUT_RESULTS.has(code)) {
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

function renderMatchupStatsInline(pitcherName, batterName) {
  pitcherStatsEl?.replaceChildren();
  batterStatsEl?.replaceChildren();

  if (pitcherName && pitcherStatsEl) {
    const pitcher = playerStatsByName.get(pitcherName);
    appendStatCells(
      pitcherStatsEl,
      getPlayerStatBlock(pitcher, 'pitching'),
      PITCHING_STAT_FIELDS,
    );
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
    numberRadiusFraction: DELTA_BAND_NUMBER_RADIUS,
  };
}

function getProximityDeltaBandGeometry() {
  return {
    innerRadiusFraction: PROXIMITY_DELTA_BAND_INNER_RADIUS,
    outerRadiusFraction: PROXIMITY_DELTA_BAND_OUTER_RADIUS,
    midRadiusFraction: PROXIMITY_DELTA_BAND_MID_RADIUS,
    numberRadiusFraction: PROXIMITY_DELTA_BAND_NUMBER_RADIUS,
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
    innerRadiusFraction = DELTA_BAND_INNER_RADIUS,
    outerRadiusFraction = DELTA_BAND_OUTER_RADIUS,
    numberRadiusFraction = DELTA_BAND_NUMBER_RADIUS,
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

  const numberPoint = polarToCanvas(angle, numberRadiusFraction, center, maxRadius);
  context.fillStyle = color;
  context.font = '600 7px "Segoe UI", system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(String(pitchNumber), numberPoint.x, numberPoint.y);

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

  const historyRows = getMatsumotoPitchRows(pitcherRows);
  const historyChronological = [...historyRows].sort((a, b) => a.playOrder - b.playOrder);
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
    numberRadiusFraction,
  } = bandGeometry;
  const tickOptions = {
    innerRadiusFraction,
    outerRadiusFraction,
    numberRadiusFraction,
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
    });
  }

  drawDeltaBandBoundaryTick(context, center, maxRadius, q1Pitch, color, tickOptions);
  drawDeltaBandBoundaryTick(context, center, maxRadius, q3Pitch, color, tickOptions);

  if (stats.max !== stats.q3) {
    drawDeltaBandBoundaryTick(context, center, maxRadius, maxPitch, color, {
      ...tickOptions,
      lineWidth: 1.5,
    });
  }

  drawDeltaBandBoundaryTick(context, center, maxRadius, medianPitch, color, {
    ...tickOptions,
    lineWidth: 3,
    showPitchNumber: true,
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

function drawSpiralGuide(context, center, maxRadius) {
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
  context.font = '10px "Segoe UI", system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  for (let pitch = 0; pitch <= PITCH_MAX; pitch += 100) {
    const angle = pitchNumberToAngle(pitch);
    const labelRadius = guideRadius + 16;
    const x = center + Math.sin(angle) * labelRadius;
    const y = center - Math.cos(angle) * labelRadius;
    const label = pitch === 0 ? '0/1000' : String(pitch);
    context.fillText(label, x, y);
  }

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

  let fontSize = label.length >= 3 ? 7 : 8;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = CHART_TEXT_COLOR;

  while (fontSize > 5) {
    context.font = `600 ${fontSize}px "Segoe UI", system-ui, sans-serif`;
    if (context.measureText(label).width <= radius * 1.5) {
      break;
    }
    fontSize -= 1;
  }

  context.fillText(label, point.x, point.y);

  if (isLatest) {
    context.beginPath();
    context.strokeStyle = 'rgba(239, 232, 245, 0.95)';
    context.lineWidth = 2;
    context.arc(point.x, point.y, radius + 3, 0, TWO_PI);
    context.stroke();
  }
}

function drawHypotheticalSwing(context, center, maxRadius, swingNumber) {
  const angle = pitchNumberToAngle(swingNumber);
  const point = polarToCanvas(angle, SPIRAL_MAX_RADIUS, center, maxRadius);
  const targetRadius = 10;

  context.save();
  context.strokeStyle = HYPOTHETICAL_SWING_COLOR;
  context.fillStyle = HYPOTHETICAL_SWING_COLOR;
  context.lineWidth = 2;
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

function drawAnnularPitchBand(context, center, maxRadius, pitchA, pitchB, fillColor) {
  const innerRadius = RANGE_MARKER_RADIUS * RANGE_MARKER_START_FRACTION;
  const outerRadius = RANGE_MARKER_RADIUS;
  const steps = Math.max(4, Math.ceil(Math.abs(getShortestPitchDelta(pitchA, pitchB)) / 16));

  context.fillStyle = fillColor;
  context.beginPath();

  for (let step = 0; step <= steps; step += 1) {
    const pitchNumber = interpolatePitchNumber(pitchA, pitchB, step / steps);
    const point = polarToCanvas(pitchNumberToAngle(pitchNumber), outerRadius, center, maxRadius);
    if (step === 0) {
      context.moveTo(point.x, point.y);
    } else {
      context.lineTo(point.x, point.y);
    }
  }

  for (let step = steps; step >= 0; step -= 1) {
    const pitchNumber = interpolatePitchNumber(pitchA, pitchB, step / steps);
    const point = polarToCanvas(pitchNumberToAngle(pitchNumber), innerRadius, center, maxRadius);
    context.lineTo(point.x, point.y);
  }

  context.closePath();
  context.fill();
}

function drawRangeBoundaryTick(context, center, maxRadius, pitchNumber, lineColor) {
  const markerStartRadius = RANGE_MARKER_RADIUS * RANGE_MARKER_START_FRACTION;
  const angle = pitchNumberToAngle(pitchNumber);
  const start = polarToCanvas(angle, markerStartRadius, center, maxRadius);
  const end = polarToCanvas(angle, RANGE_MARKER_RADIUS, center, maxRadius);
  const numberPoint = polarToCanvas(angle, RANGE_LINE_NUMBER_RADIUS, center, maxRadius);

  context.strokeStyle = lineColor;
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(end.x, end.y);
  context.stroke();

  context.fillStyle = lineColor;
  context.font = '600 7px "Segoe UI", system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(String(pitchNumber), numberPoint.x, numberPoint.y);
}

function drawRangeMarkers(context, center, maxRadius, regions, swingAnchor) {
  if (regions.length === 0) {
    return;
  }

  context.save();

  regions.forEach((region) => {
    region.bands.forEach((band) => {
      const { pitchA, pitchB } = getBandPitchEndpoints(
        swingAnchor,
        band.innerHigh,
        band.outerHigh,
        band.variant,
      );
      drawAnnularPitchBand(context, center, maxRadius, pitchA, pitchB, region.fillColor);
    });
  });

  context.lineCap = 'round';
  context.lineWidth = RANGE_MARKER_LINE_WIDTH;

  const drawnBoundaryLines = new Set();
  regions.forEach((region) => {
    region.boundaryLines.forEach((pitchNumber) => {
      if (drawnBoundaryLines.has(pitchNumber)) {
        return;
      }

      drawnBoundaryLines.add(pitchNumber);
      drawRangeBoundaryTick(context, center, maxRadius, pitchNumber, region.lineColor);
    });
  });

  context.font = '600 8px "Segoe UI", system-ui, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  regions.forEach((region) => {
    context.fillStyle = region.lineColor;
    region.labelPitchNumbers.forEach((labelPitchNumber) => {
      const labelAngle = pitchNumberToAngle(labelPitchNumber);
      const labelPoint = polarToCanvas(labelAngle, RANGE_MARKER_LABEL_RADIUS, center, maxRadius);
      context.fillText(region.result, labelPoint.x, labelPoint.y);
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
  rangeTargetPitch = null,
) {
  drawSpiralGuide(context, center, maxRadius);

  context.lineWidth = 2;
  context.lineCap = 'round';
  context.lineJoin = 'round';

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

  points.forEach((point, index) => {
    drawSpiralPoint(context, point, index === points.length - 1);
  });

  if (forwardDeltaOverlay) {
    drawSpiralDeltaOverlay(context, center, maxRadius, forwardDeltaOverlay);
  }

  if (proximityDeltaOverlay) {
    drawSpiralDeltaOverlay(context, center, maxRadius, proximityDeltaOverlay);
  }

  if (rangeTargetPitch !== null) {
    drawHypotheticalSwing(context, center, maxRadius, rangeTargetPitch);
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

function renderSpiralLegend(categories, forwardDeltaOverlay = null, proximityDeltaOverlay = null) {
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

  legend.appendChild(resultsRow);

  if (forwardDeltaOverlay || proximityDeltaOverlay) {
    const overlayRow = document.createElement('div');
    overlayRow.className = 'result-legend-row';

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

    legend.appendChild(overlayRow);
  }

  return legend;
}

function attachSpiralZoom(canvas, drawScene) {
  const view = { scale: 1 };
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

    const zoomMultiplier = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    view.scale = Math.min(
      SPIRAL_ZOOM_MAX,
      Math.max(SPIRAL_ZOOM_MIN, view.scale * zoomMultiplier),
    );
    redraw();
  }, { passive: false });

  redraw();

  return { redraw };
}

function renderPitchSpiral(pitcherRows, pitcherName, batterName) {
  const card = createChartCard(
    'Spiral Scouting Graph',
    'Pitch number sets angle from top (pitch # × 360 ÷ 1000). Color shows result type; inner ring = next-pitch Δ by result category, outer grey ring = next-pitch Δ for any result when pitch # is ±50 of latest (seasons 11–13). Scroll to zoom.',
  );
  card.classList.add('chart-card--wide', 'chart-card--spiral');

  const allPitchRows = getChronologicalPitchRows(pitcherRows);
  const pitchRows = getSpiralPitchRows(pitcherRows);

  if (pitchRows.length === 0) {
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
  const points = buildSpiralPoints(pitchRows, center, maxRadius);
  const matsumotoSourceRows = getPitcherDisplayRows(pitcherName);
  const forwardDeltaOverlay = buildSpiralForwardDeltaOverlay(matsumotoSourceRows, pitchRows);
  const proximityDeltaOverlay = buildSpiralProximityDeltaOverlay(matsumotoSourceRows, pitchRows);
  const rangeTargetPitch = getCombinedRangeMedianPitch(forwardDeltaOverlay, proximityDeltaOverlay);
  const legend = renderSpiralLegend(
    getActiveResultCategories(points),
    forwardDeltaOverlay,
    proximityDeltaOverlay,
  );

  const stage = document.createElement('div');
  stage.className = 'spiral-stage';

  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'spiral-canvas-wrap';

  const canvas = document.createElement('canvas');
  canvas.className = 'spiral-canvas';
  canvas.setAttribute('role', 'img');
  const overlayLabels = [
    forwardDeltaOverlay ? `${forwardDeltaOverlay.categoryLabel} category overlay` : null,
    proximityDeltaOverlay ? `pitch ±${LIVE_PROXIMITY_PITCH_TOLERANCE} overlay` : null,
  ].filter(Boolean);
  canvas.setAttribute(
    'aria-label',
    overlayLabels.length > 0
      ? `Spiral Scouting Graph for ${pitcherName} with ${pitchRows.length} pitches and ${overlayLabels.join(' and ')}.`
      : `Spiral Scouting Graph for ${pitcherName} with ${pitchRows.length} pitches colored by result category.`,
  );

  canvasWrap.appendChild(canvas);
  stage.append(legend, canvasWrap);

  const spiralController = attachSpiralZoom(canvas, (context) => {
    drawPitchSpiralScene(
      context,
      center,
      maxRadius,
      points,
      forwardDeltaOverlay,
      proximityDeltaOverlay,
      rangeTargetPitch,
    );
  });
  spiralRedraw = spiralController.redraw;

  const meta = document.createElement('p');
  meta.className = 'spiral-legend';
  const metaParts = [];

  if (pitchRows.length < allPitchRows.length) {
    const recentGames = getRecentGameIds(pitcherRows, LIVE_SPIRAL_GAME_COUNT);
    metaParts.push(`Last ${recentGames.length} game${recentGames.length === 1 ? '' : 's'} · ${pitchRows.length.toLocaleString()} of ${allPitchRows.length.toLocaleString()} pitches`);
  } else {
    metaParts.push(`${pitchRows.length.toLocaleString()} pitches`);
  }

  if (forwardDeltaOverlay) {
    metaParts.push(formatForwardDeltaCaption(forwardDeltaOverlay));
  }

  if (proximityDeltaOverlay) {
    metaParts.push(formatForwardDeltaCaption(proximityDeltaOverlay));
  }

  if (rangeTargetPitch !== null) {
    metaParts.push(`simulated swing target · pitch ${rangeTargetPitch}`);
  }

  metaParts.push('scroll to zoom · white ring marks most recent pitch');
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

function renderDashboard(pitcherRows, pitcherName, batterName) {
  spiralRedraw = null;
  chartGrid.replaceChildren(renderPitchSpiral(pitcherRows, pitcherName, batterName));
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
  const batters = getAvailableBatters();
  populateBatterDropdown(batters, filteredRows);

  const selectedBatter = batterSelect.value;
  rowCountEl.textContent = `${filteredRows.length.toLocaleString()} plays`;
  renderMatchupStatsInline(selectedPitcher, selectedBatter);
  renderDashboard(filteredRows, selectedPitcher, selectedBatter);
}

async function loadSheetData({ forceRefresh = false } = {}) {
  if (isLoadingSheet) {
    return;
  }

  setSyncLoading(true);
  setStatus(forceRefresh ? 'Syncing sheet data...' : 'Loading sheet data...');

  try {
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
    historicalRows = await loadHistoricalPlays(forceRefresh);
    allGames = rowsToObjects(gamesMatrix);
    sessionDates = parseSessionDates(rowsToObjects(datesMatrix));
    playerStatsByName = playerStats;
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
    setSyncLoading(false);
  }
}

pitcherSelect.addEventListener('change', updateDashboard);
batterSelect.addEventListener('change', updateDashboard);

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

loadSheetData({ forceRefresh: true });
