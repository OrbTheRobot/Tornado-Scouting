import { SHEET_CONFIG, PLAYER_SHEET_COLUMNS, getSheetCsvUrl, normalizePlayRow } from './config.js';
import { buildRangeTable } from './rangeEngine.js';

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
const LAST_PITCH_COUNT = 10;
const SPIRAL_CANVAS_SIZE = 960;
const SPIRAL_RENDER_SCALE = 3;
const SPIRAL_MIN_RADIUS = 0.03;
const SPIRAL_MAX_RADIUS = 0.88;
const RANGE_MARKER_RADIUS = SPIRAL_MAX_RADIUS + 0.012;
const RANGE_MARKER_LABEL_RADIUS = SPIRAL_MAX_RADIUS + 0.045;
const RANGE_LINE_NUMBER_RADIUS = RANGE_MARKER_RADIUS + 0.018;
const SPIRAL_RADIUS_SCALE = 0.4;
const SPIRAL_POINT_RADIUS = 12;
const SPIRAL_LATEST_RADIUS = 14;
const SPIRAL_CONNECTOR_STEPS = 72;
const SPIRAL_CONNECTOR_OPACITY = 0.36;
const SPIRAL_TRANSITION_CONNECTOR_COLOR = 'rgba(154, 167, 181, 0.7)';
const DELTA_CHART_WIDTH = 900;
const DELTA_CHART_RENDER_SCALE = 2;
const DELTA_CHART_MAX_DELTA = 500;
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
  Other: '#9aa7b5',
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
const hypotheticalSwingToggle = document.getElementById('hypothetical-swing-toggle');
const hypotheticalSwingFields = document.getElementById('hypothetical-swing-fields');
const hypotheticalSwingInput = document.getElementById('hypothetical-swing-input');
const simulateSwingBtn = document.getElementById('simulate-swing-btn');
const pitchRecencySelect = document.getElementById('pitch-recency-select');
const syncSheetBtn = document.getElementById('sync-sheet-btn');
const statusEl = document.getElementById('status');
const rowCountEl = document.getElementById('row-count');
const chartGrid = document.getElementById('chart-grid');
const situationPanel = document.getElementById('situation-panel');
const matchupStackEl = document.getElementById('matchup-stack');

let allRows = [];
let playerStatsByName = new Map();
let isLoadingSheet = false;
let simulatedHypotheticalSwing = null;
let spiralRedraw = null;
let lastSelectedPitcher = '';

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
  syncSheetBtn.disabled = loading;
  syncSheetBtn.setAttribute('aria-busy', loading ? 'true' : 'false');
  syncSheetBtn.textContent = loading ? 'Syncing…' : 'Sync';
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

function populatePitcherDropdown(pitchers) {
  populateSelect(pitcherSelect, pitchers, { previousValue: pitcherSelect.value });
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
    defaultValue: getMostRecentBatter(pitcherRows),
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

function setHypotheticalSwingFieldsVisible(isVisible) {
  hypotheticalSwingFields.hidden = !isVisible;
}

function clearSimulatedHypotheticalSwing() {
  simulatedHypotheticalSwing = null;
  spiralRedraw?.();
}

function sanitizeHypotheticalSwingInput() {
  if (!hypotheticalSwingInput.value.trim()) {
    hypotheticalSwingInput.setCustomValidity('');
    return;
  }

  const parsed = parseSwingNumber(hypotheticalSwingInput.value);
  if (parsed === null) {
    hypotheticalSwingInput.setCustomValidity('Enter a whole number from 0 to 1000.');
    return;
  }

  hypotheticalSwingInput.setCustomValidity('');
  if (hypotheticalSwingInput.value !== String(parsed)) {
    hypotheticalSwingInput.value = String(parsed);
  }
}

function handleHypotheticalSwingToggle() {
  const isEnabled = hypotheticalSwingToggle.checked;
  setHypotheticalSwingFieldsVisible(isEnabled);

  if (!isEnabled) {
    clearSimulatedHypotheticalSwing();
  }

  updateDashboard();
}

function handleSimulateSwing() {
  sanitizeHypotheticalSwingInput();
  if (!hypotheticalSwingInput.reportValidity()) {
    return;
  }

  const swingNumber = parseSwingNumber(hypotheticalSwingInput.value);
  if (swingNumber === null) {
    hypotheticalSwingInput.setCustomValidity('Enter a whole number from 0 to 1000.');
    hypotheticalSwingInput.reportValidity();
    return;
  }

  simulatedHypotheticalSwing = swingNumber;
  spiralRedraw?.();
  updateDashboard();
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

function getActiveSimulatedSwing() {
  if (!hypotheticalSwingToggle.checked) {
    return null;
  }

  if (simulatedHypotheticalSwing !== null) {
    return simulatedHypotheticalSwing;
  }

  return parseSwingNumber(hypotheticalSwingInput.value);
}

function formatRangeBounds(row, simulatedSwing) {
  const { high, result } = row;

  if (result === 'K') {
    return {
      down: '—',
      up: '—',
    };
  }

  if (simulatedSwing === null) {
    return {
      down: `-${high}>`,
      up: `<${high}`,
    };
  }

  return {
    down: String(normalizePitchNumber(simulatedSwing - high)),
    up: String(normalizePitchNumber(simulatedSwing + high)),
  };
}

function hexToRgba(hex, alpha) {
  const normalized = hex.replace('#', '');
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

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
  const value = pitchRecencySelect?.value ?? '20';
  if (value === 'all') {
    return null;
  }

  const limit = Number.parseInt(value, 10);
  return Number.isFinite(limit) ? limit : 20;
}

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

function renderLastTenPitchesTable(rows) {
  const card = createChartCard(
    'Last 10 pitches',
    'Most recent pitches first, in chronological order.',
  );
  card.classList.add('chart-card--table', 'chart-card--pitches');

  const pitchRows = getChronologicalPitchRows(rows)
    .sort((a, b) => b.playOrder - a.playOrder)
    .slice(0, LAST_PITCH_COUNT);

  if (pitchRows.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No pitch data for this pitcher.';
    card.appendChild(empty);
    return card;
  }

  const tableWrap = document.createElement('div');
  tableWrap.className = 'table-wrap';

  const table = document.createElement('table');
  table.className = 'pitch-table';

  const columns = [
    { key: 'Pitch #', label: 'Pitch' },
    { key: 'delta', label: 'Δ' },
    { key: 'rotation', label: 'Dir' },
    { key: 'Swing #', label: 'Swing' },
    { key: 'Result', label: 'Result' },
    { key: 'Batter', label: 'Batter' },
    { key: 'Inning', label: 'Inning' },
  ];

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  columns.forEach(({ label }) => {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = label;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  const tbody = document.createElement('tbody');
  pitchRows.forEach((entry, index) => {
    const previousEntry = pitchRows[index + 1];
    const travelDelta = previousEntry
      ? getPitchTravelDelta(previousEntry.pitchNumber, entry.pitchNumber)
      : null;
    const rotation = previousEntry
      ? getPitchRotationDirection(previousEntry.pitchNumber, entry.pitchNumber)
      : '—';

    const tr = document.createElement('tr');
    columns.forEach(({ key }) => {
      const td = document.createElement('td');
      if (key === 'delta') {
        td.textContent = travelDelta === null ? '—' : String(travelDelta);
      } else if (key === 'rotation') {
        td.textContent = rotation;
        if (rotation === '↻') {
          td.title = 'Clockwise';
          td.setAttribute('aria-label', 'Clockwise');
        } else if (rotation === '↺') {
          td.title = 'Counter-clockwise';
          td.setAttribute('aria-label', 'Counter-clockwise');
        }
      } else {
        td.textContent = entry.row[key]?.trim() || '—';
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  table.append(thead, tbody);
  tableWrap.appendChild(table);
  card.appendChild(tableWrap);
  return card;
}

function renderMatchup(pitcherName, batterName) {
  const card = createChartCard('Matchup', '');
  card.classList.add('chart-card--stats');

  const caption = card.querySelector('.chart-caption');
  if (caption) {
    caption.remove();
  }

  const pitcher = playerStatsByName.get(pitcherName);
  const batter = playerStatsByName.get(batterName);

  if (!pitcherName && !batterName) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'Select a pitcher and batter.';
    card.appendChild(empty);
    return card;
  }

  const matchup = document.createElement('div');
  matchup.className = 'matchup-stats';

  appendStatColumn(matchup, 'Pitcher', getPlayerStatBlock(pitcher, 'pitching'), PITCHING_STAT_FIELDS);
  appendStatColumn(matchup, 'Batter', getPlayerStatBlock(batter, 'batting'), BATTING_STAT_FIELDS);

  card.appendChild(matchup);
  return card;
}

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

function formatDeltaMagnitudeLabel(signedDelta) {
  return String(Math.abs(signedDelta));
}

const DELTA_BOX_LABEL_INSET = 5;

function buildInsideBoxLabels(stats, plotLeft, plotWidth) {
  const q1X = signedDeltaToPlotX(stats.q1, plotLeft, plotWidth);
  const q3X = signedDeltaToPlotX(stats.q3, plotLeft, plotWidth);

  return [
    { x: q1X + DELTA_BOX_LABEL_INSET, value: stats.q1, textAlign: 'left' },
    { x: q3X - DELTA_BOX_LABEL_INSET, value: stats.q3, textAlign: 'right' },
  ];
}

function buildGapLabels(stats, plotLeft, plotWidth) {
  const minX = signedDeltaToPlotX(stats.min, plotLeft, plotWidth);
  const medianX = signedDeltaToPlotX(stats.median, plotLeft, plotWidth);
  const maxX = signedDeltaToPlotX(stats.max, plotLeft, plotWidth);

  const labels = [
    { x: minX, value: stats.min, textAlign: 'center' },
    { x: medianX, value: stats.median, textAlign: 'center' },
    { x: maxX, value: stats.max, textAlign: 'center' },
  ];

  const visible = [];

  labels.forEach((label) => {
    const text = formatDeltaMagnitudeLabel(label.value);
    const overlaps = visible.some(
      (existing) =>
        formatDeltaMagnitudeLabel(existing.value) === text &&
        Math.abs(existing.x - label.x) < 16,
    );

    if (!overlaps) {
      visible.push(label);
    }
  });

  return visible;
}

function drawDeltaStatLabels(context, labels, y, color, stroke = false) {
  context.font = '600 10px "Segoe UI", system-ui, sans-serif';
  context.textBaseline = 'middle';
  context.fillStyle = color;

  labels.forEach(({ x, value, textAlign }) => {
    const text = formatDeltaMagnitudeLabel(value);

    context.textAlign = textAlign;

    if (stroke) {
      context.lineWidth = 3;
      context.strokeStyle = '#121820';
      context.strokeText(text, x, y);
    }

    context.fillText(text, x, y);
  });
}

function signedDeltaToPlotX(signedDelta, plotLeft, plotWidth) {
  const clamped = Math.max(-DELTA_CHART_MAX_DELTA, Math.min(DELTA_CHART_MAX_DELTA, signedDelta));

  return plotLeft + ((clamped + DELTA_CHART_MAX_DELTA) / (DELTA_CHART_MAX_DELTA * 2)) * plotWidth;
}

function buildHorizontalBandLayout() {
  return {
    bandHeight: 40,
    bandGap: 40,
    outerGap: 40,
    innerGap: 14,
    axisArea: 42,
    marginLeft: 54,
    marginRight: 28,
    marginTop: 8,
  };
}

function computeDeltaChartHeight(layout) {
  const categoryCount = DELTA_PLOT_CATEGORIES.length;

  return (
    layout.marginTop +
    layout.outerGap +
    categoryCount * layout.bandHeight +
    (categoryCount - 1) * layout.bandGap +
    layout.innerGap +
    layout.axisArea
  );
}

function getCategoryBandBounds(layout, axisY, index) {
  const bandBottom = axisY - layout.innerGap - index * (layout.bandHeight + layout.bandGap);
  const bandTop = bandBottom - layout.bandHeight;
  const gapSize = index === DELTA_PLOT_CATEGORIES.length - 1 ? layout.outerGap : layout.bandGap;
  const labelY = bandTop - gapSize / 2;

  return { bandTop, bandBottom, labelY };
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

function buildPitchDeltaTransitions(pitchRows) {
  const chronological = [...pitchRows].sort((a, b) => a.playOrder - b.playOrder);
  const transitions = [];

  for (let index = 1; index < chronological.length; index += 1) {
    const previous = chronological[index - 1];
    const current = chronological[index];
    const signedDelta = getShortestPitchDelta(previous.pitchNumber, current.pitchNumber);
    const category = normalizeResultCategory(current.row.Result?.trim() || '');

    if (!DELTA_PLOT_CATEGORIES.some((entry) => entry.key === category)) {
      continue;
    }

    transitions.push({
      signedDelta,
      category,
      pitchNumber: current.pitchNumber,
    });
  }

  return transitions;
}

function drawDeltaSpectrumScene(context, transitions, layout, chartHeight) {
  const plotLeft = layout.marginLeft;
  const plotRight = DELTA_CHART_WIDTH - layout.marginRight;
  const plotWidth = plotRight - plotLeft;
  const axisY = chartHeight - layout.axisArea;

  context.clearRect(0, 0, DELTA_CHART_WIDTH, chartHeight);
  context.fillStyle = '#121820';
  context.fillRect(0, 0, DELTA_CHART_WIDTH, chartHeight);

  context.strokeStyle = 'rgba(154, 167, 181, 0.35)';
  context.lineWidth = 1.5;
  context.beginPath();
  context.moveTo(plotLeft, axisY);
  context.lineTo(plotRight, axisY);
  context.stroke();

  [
    { signedDelta: -500, label: '500' },
    { signedDelta: -250, label: '250' },
    { signedDelta: 0, label: '0' },
    { signedDelta: 250, label: '250' },
    { signedDelta: 500, label: '500' },
  ].forEach(({ signedDelta, label }) => {
    const x = signedDeltaToPlotX(signedDelta, plotLeft, plotWidth);

    context.beginPath();
    context.strokeStyle = signedDelta === 0 ? 'rgba(154, 167, 181, 0.55)' : 'rgba(154, 167, 181, 0.28)';
    context.lineWidth = signedDelta === 0 ? 2 : 1;
    context.moveTo(x, axisY);
    context.lineTo(x, axisY + 8);
    context.stroke();

    context.fillStyle = 'rgba(154, 167, 181, 0.9)';
    context.font = '600 11px "Segoe UI", system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'top';
    context.fillText(label, x, axisY + 12);
  });

  context.font = '600 13px "Segoe UI", system-ui, sans-serif';
  context.fillStyle = 'rgba(154, 167, 181, 0.85)';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('↺', plotLeft - 18, axisY);
  context.fillText('↻', plotRight + 18, axisY);

  DELTA_PLOT_CATEGORIES.forEach((category, index) => {
    const { bandTop, bandBottom, labelY } = getCategoryBandBounds(layout, axisY, index);
    const categoryTransitions = transitions.filter((entry) => entry.category === category.key);
    const deltas = categoryTransitions.map((entry) => entry.signedDelta);
    const stats = computeBoxPlotStats(deltas);

    context.strokeStyle = 'rgba(154, 167, 181, 0.18)';
    context.lineWidth = 1;
    context.strokeRect(plotLeft, bandTop, plotWidth, layout.bandHeight);

    context.fillStyle = category.color;
    context.font = '700 13px "Segoe UI", system-ui, sans-serif';
    context.textAlign = 'right';
    context.textBaseline = 'middle';
    context.fillText(category.label, plotLeft - 10, (bandTop + bandBottom) / 2);

    if (!stats) {
      context.fillStyle = 'rgba(154, 167, 181, 0.65)';
      context.font = '500 11px "Segoe UI", system-ui, sans-serif';
      context.textAlign = 'center';
      context.fillText('No data', plotLeft + plotWidth / 2, (bandTop + bandBottom) / 2);
      return;
    }

    const q1X = signedDeltaToPlotX(stats.q1, plotLeft, plotWidth);
    const q3X = signedDeltaToPlotX(stats.q3, plotLeft, plotWidth);
    const medianX = signedDeltaToPlotX(stats.median, plotLeft, plotWidth);
    const minX = signedDeltaToPlotX(stats.min, plotLeft, plotWidth);
    const maxX = signedDeltaToPlotX(stats.max, plotLeft, plotWidth);
    const midY = (bandTop + bandBottom) / 2;

    context.fillStyle = hexToRgba(category.color, 0.28);
    context.fillRect(q1X, bandTop + 2, q3X - q1X, layout.bandHeight - 4);

    context.strokeStyle = hexToRgba(category.color, 0.65);
    context.lineWidth = 1.5;
    context.beginPath();
    context.moveTo(minX, midY);
    context.lineTo(q1X, midY);
    context.moveTo(q3X, midY);
    context.lineTo(maxX, midY);
    context.stroke();

    context.beginPath();
    context.strokeStyle = category.color;
    context.lineWidth = 3;
    context.moveTo(medianX, bandTop + 3);
    context.lineTo(medianX, bandBottom - 3);
    context.stroke();

    context.beginPath();
    context.strokeStyle = category.color;
    context.lineWidth = 1.5;
    context.moveTo(minX, bandTop + 4);
    context.lineTo(minX, bandBottom - 4);
    context.moveTo(maxX, bandTop + 4);
    context.lineTo(maxX, bandBottom - 4);
    context.stroke();

    drawDeltaStatLabels(
      context,
      buildInsideBoxLabels(stats, plotLeft, plotWidth),
      midY,
      category.color,
      true,
    );
    drawDeltaStatLabels(
      context,
      buildGapLabels(stats, plotLeft, plotWidth),
      labelY,
      category.color,
    );
  });
}

function renderDeltaSpectrumLegend() {
  const legend = document.createElement('div');
  legend.className = 'result-legend result-legend--top';

  DELTA_PLOT_CATEGORIES.forEach((category) => {
    const item = document.createElement('span');
    item.className = 'result-legend-item';

    const swatch = document.createElement('span');
    swatch.className = 'result-legend-swatch';
    swatch.style.backgroundColor = category.color;

    const label = document.createElement('span');
    label.textContent = category.label;

    item.append(swatch, label);
    legend.appendChild(item);
  });

  return legend;
}

function renderPitchDeltaSpectrum(pitcherRows, pitcherName) {
  const card = createChartCard(
    'Matsumoto Plot',
    'Absolute delta from the previous pitch on a flat 500 ↺ to 500 ↻ axis. Each band shows aggregate min, Q1, median, Q3, and max for that result type.',
  );
  card.classList.add('chart-card--wide', 'chart-card--delta-spectrum');

  const pitchRows = getRecentChronologicalPitchRows(pitcherRows);
  const transitions = buildPitchDeltaTransitions(pitchRows);

  if (pitchRows.length < 2 || transitions.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = pitcherName
      ? 'Not enough pitch transitions to draw the Matsumoto Plot.'
      : 'Select a pitcher to view the Matsumoto Plot.';
    card.appendChild(empty);
    return card;
  }

  const stage = document.createElement('div');
  stage.className = 'delta-spectrum-stage';

  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'delta-spectrum-canvas-wrap';

  const canvas = document.createElement('canvas');
  canvas.className = 'delta-spectrum-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute(
    'aria-label',
    `Matsumoto Plot for ${pitcherName} showing aggregate box-plot stats by result type.`,
  );

  const layout = buildHorizontalBandLayout();
  const chartHeight = computeDeltaChartHeight(layout);

  canvas.width = DELTA_CHART_WIDTH * DELTA_CHART_RENDER_SCALE;
  canvas.height = chartHeight * DELTA_CHART_RENDER_SCALE;

  const context = canvas.getContext('2d');
  context.setTransform(DELTA_CHART_RENDER_SCALE, 0, 0, DELTA_CHART_RENDER_SCALE, 0, 0);
  drawDeltaSpectrumScene(context, transitions, layout, chartHeight);

  canvasWrap.appendChild(canvas);
  stage.append(renderDeltaSpectrumLegend(), canvasWrap);

  const meta = document.createElement('p');
  meta.className = 'spiral-legend';
  meta.textContent = 'Q1/Q3 on box center line inside shaded band · min, median, max in gap above each band';
  stage.appendChild(meta);
  card.appendChild(stage);

  return card;
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
  context.strokeStyle = 'rgba(154, 167, 181, 0.12)';
  context.lineWidth = 1;

  [SPIRAL_MIN_RADIUS, SPIRAL_MAX_RADIUS].forEach((radiusFraction) => {
    context.beginPath();
    context.arc(center, center, radiusFraction * maxRadius, 0, TWO_PI);
    context.stroke();
  });

  const guideRadius = (SPIRAL_MAX_RADIUS + 0.08) * maxRadius;

  for (let pitch = 0; pitch <= PITCH_MAX; pitch += 100) {
    const angle = pitchNumberToAngle(pitch);
    const x = center + Math.sin(angle) * guideRadius;
    const y = center - Math.cos(angle) * guideRadius;

    context.beginPath();
    context.moveTo(center, center);
    context.lineTo(x, y);
    context.stroke();
  }

  context.fillStyle = 'rgba(154, 167, 181, 0.85)';
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

  context.strokeStyle = 'rgba(15, 20, 25, 0.9)';
  context.lineWidth = 1;
  context.stroke();

  let fontSize = label.length >= 3 ? 7 : 8;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = '#e8edf2';

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
    context.strokeStyle = 'rgba(232, 237, 242, 0.95)';
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
  rangeRegions = [],
  swingAnchor = null,
) {
  drawSpiralGuide(context, center, maxRadius);

  if (rangeRegions.length > 0 && swingAnchor !== null) {
    drawRangeMarkers(context, center, maxRadius, rangeRegions, swingAnchor);
  }

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

  const simulatedSwing = getActiveSimulatedSwing();
  if (simulatedSwing !== null) {
    drawHypotheticalSwing(context, center, maxRadius, simulatedSwing);
  }
}

function renderSpiralLegend(categories) {
  const legend = document.createElement('div');
  legend.className = 'result-legend result-legend--top';

  categories.forEach((category) => {
    const item = document.createElement('span');
    item.className = 'result-legend-item';

    const swatch = document.createElement('span');
    swatch.className = 'result-legend-swatch';
    swatch.style.backgroundColor = RESULT_CATEGORY_COLORS[category];

    const label = document.createElement('span');
    label.textContent = category;

    item.append(swatch, label);
    legend.appendChild(item);
  });

  const transitionHeading = document.createElement('div');
  transitionHeading.className = 'result-legend-break';
  transitionHeading.textContent = 'Transitions';
  legend.appendChild(transitionHeading);

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
    legend.appendChild(item);
  });

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
    context.fillStyle = '#121820';
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
    'Pitch number sets angle from top (pitch # × 360 ÷ 1000). Color shows result type; line style marks inning and game transitions. Scroll to zoom.',
  );
  card.classList.add('chart-card--wide', 'chart-card--spiral');

  const allPitchRows = getChronologicalPitchRows(pitcherRows);
  const pitchRows = getRecentChronologicalPitchRows(pitcherRows);

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
  const legend = renderSpiralLegend(getActiveResultCategories(points));
  const rangeTable = buildMatchupRangeTable(pitcherName, batterName);

  const stage = document.createElement('div');
  stage.className = 'spiral-stage';

  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'spiral-canvas-wrap';

  const canvas = document.createElement('canvas');
  canvas.className = 'spiral-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute(
    'aria-label',
    `Spiral Scouting Graph for ${pitcherName} with ${pitchRows.length} pitches colored by result category.`,
  );

  canvasWrap.appendChild(canvas);
  stage.append(legend, canvasWrap);

  const spiralController = attachSpiralZoom(canvas, (context) => {
    const simulatedSwing = getActiveSimulatedSwing();
    const rangeRegions = simulatedSwing !== null && rangeTable
      ? buildRangeSpiralMarkers(rangeTable.rows, simulatedSwing)
      : [];

    drawPitchSpiralScene(context, center, maxRadius, points, rangeRegions, simulatedSwing);
  });
  spiralRedraw = spiralController.redraw;

  const meta = document.createElement('p');
  meta.className = 'spiral-legend';
  meta.textContent = pitchRows.length < allPitchRows.length
    ? `${pitchRows.length.toLocaleString()} of ${allPitchRows.length.toLocaleString()} pitches · scroll to zoom · white ring marks most recent pitch`
    : `${pitchRows.length.toLocaleString()} pitches · scroll to zoom · white ring marks most recent pitch`;

  stage.appendChild(meta);
  card.appendChild(stage);
  return card;
}

function getSituationState() {
  const readRunner = (name) => (
    document.querySelector(`input[name="${name}"]`)?.checked ?? false
  );

  return {
    onFirst: readRunner('runner-first'),
    onSecond: readRunner('runner-second'),
    onThird: readRunner('runner-third'),
    outs: Number(document.getElementById('outs-count')?.value ?? 0),
  };
}

function renderRangeTableCard(pitcherName, batterName) {
  const card = createChartCard('Range table', '');
  card.classList.add('chart-card--table', 'chart-card--range');

  const caption = card.querySelector('.chart-caption');
  if (caption) {
    caption.remove();
  }

  const pitcher = playerStatsByName.get(pitcherName);
  const batter = playerStatsByName.get(batterName);

  if (!pitcher || !batter) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = pitcherName && batterName
      ? 'Player ratings were not found for this matchup.'
      : 'Select a pitcher and batter to view the range table.';
    card.appendChild(empty);
    return card;
  }

  const simulatedSwing = getActiveSimulatedSwing();
  const rangeTable = buildMatchupRangeTable(pitcherName, batterName);

  const tableWrap = document.createElement('div');
  tableWrap.className = 'range-table-wrap';

  const table = document.createElement('table');
  table.className = 'range-table';

  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th scope="col">Result</th>
      <th scope="col">Down</th>
      <th scope="col">Up</th>
    </tr>
  `;

  const tbody = document.createElement('tbody');
  rangeTable.rows.forEach((row) => {
    const bounds = formatRangeBounds(row, simulatedSwing);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${row.result}</td>
      <td>${bounds.down}</td>
      <td>${bounds.up}</td>
    `;
    tbody.appendChild(tr);
  });

  table.append(thead, tbody);
  tableWrap.appendChild(table);
  card.appendChild(tableWrap);
  return card;
}

function renderDashboard(pitcherRows, pitcherName, batterName) {
  spiralRedraw = null;
  chartGrid.replaceChildren();

  matchupStackEl?.replaceChildren(
    renderMatchup(pitcherName, batterName),
    renderRangeTableCard(pitcherName, batterName),
  );

  const lastTenCard = renderLastTenPitchesTable(pitcherRows);
  lastTenCard.classList.add('chart-card--wide');

  chartGrid.append(
    lastTenCard,
    renderPitchSpiral(pitcherRows, pitcherName, batterName),
    renderPitchDeltaSpectrum(pitcherRows, pitcherName),
  );
}

function updateDashboard() {
  const selectedPitcher = pitcherSelect.value;
  if (selectedPitcher !== lastSelectedPitcher) {
    simulatedHypotheticalSwing = null;
    lastSelectedPitcher = selectedPitcher;
  }

  if (!selectedPitcher) {
    rowCountEl.textContent = '0 plays';
    batterSelect.replaceChildren();
    matchupStackEl?.replaceChildren();
    chartGrid.replaceChildren();
    return;
  }

  const filteredRows = filterRowsByPitcher(allRows, selectedPitcher);
  const batters = getAllBatters();
  populateBatterDropdown(batters, filteredRows);

  const selectedBatter = batterSelect.value;
  rowCountEl.textContent = `${filteredRows.length.toLocaleString()} plays`;
  renderDashboard(filteredRows, selectedPitcher, selectedBatter);
}

async function loadSheetData({ forceRefresh = false } = {}) {
  if (isLoadingSheet) {
    return;
  }

  setSyncLoading(true);
  setStatus(forceRefresh ? 'Syncing sheet data...' : 'Loading sheet data...');

  try {
    const [playsResponse, playerStats] = await Promise.all([
      fetch(getSheetCsvUrl(SHEET_CONFIG.sheetName, { bustCache: forceRefresh }), {
        cache: forceRefresh ? 'no-store' : 'default',
      }),
      loadPlayerStatsByName({ forceRefresh }),
    ]);

    if (!playsResponse.ok) {
      throw new Error(`Plays sheet request failed (${playsResponse.status})`);
    }

    const playsCsvText = await playsResponse.text();
    const playsMatrix = parseCsv(playsCsvText);
    allRows = rowsToObjects(playsMatrix).map(normalizePlayRow);
    playerStatsByName = playerStats;

    const pitchers = getUniquePitchers(allRows);
    populatePitcherDropdown(pitchers);

    updateDashboard();
    setStatus(
      `${forceRefresh ? 'Synced' : 'Loaded'} ${allRows.length.toLocaleString()} plays · ${playerStatsByName.size.toLocaleString()} players · ${formatSyncTime(new Date())}`,
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
hypotheticalSwingToggle.addEventListener('change', handleHypotheticalSwingToggle);
hypotheticalSwingInput.addEventListener('input', () => {
  sanitizeHypotheticalSwingInput();
  if (hypotheticalSwingToggle.checked) {
    updateDashboard();
  }
});
simulateSwingBtn.addEventListener('click', handleSimulateSwing);
syncSheetBtn.addEventListener('click', () => loadSheetData({ forceRefresh: true }));

pitchRecencySelect?.addEventListener('change', () => {
  if (pitcherSelect.value) {
    updateDashboard();
  }
});

situationPanel?.addEventListener('change', () => {
  if (pitcherSelect.value) {
    updateDashboard();
  }
});

loadSheetData();
