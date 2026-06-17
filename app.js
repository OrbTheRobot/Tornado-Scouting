import { SHEET_CONFIG, PLAYER_SHEET_COLUMNS, getSheetCsvUrl } from './config.js';
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
const syncSheetBtn = document.getElementById('sync-sheet-btn');
const statusEl = document.getElementById('status');
const rowCountEl = document.getElementById('row-count');
const chartGrid = document.getElementById('chart-grid');
const situationPanel = document.getElementById('situation-panel');

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

function getUniqueBatters(rows) {
  const batters = new Set();

  rows.forEach((row) => {
    const batter = row.Batter?.trim();
    if (batter) {
      batters.add(batter);
    }
  });

  return [...batters].sort((a, b) => a.localeCompare(b));
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
  pitchRows.forEach(({ row }) => {
    const tr = document.createElement('tr');
    columns.forEach(({ key }) => {
      const td = document.createElement('td');
      td.textContent = row[key]?.trim() || '—';
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

  context.strokeStyle = 'rgba(154, 167, 181, 0.35)';
  context.lineWidth = 2;
  context.lineCap = 'round';
  context.lineJoin = 'round';

  for (let index = 1; index < points.length; index += 1) {
    drawSpiralConnector(context, points[index - 1], points[index], center, maxRadius);
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
    'Pitch spiral',
    'Pitch number sets angle from top (pitch # × 360 ÷ 1000). Color shows result type; line style marks inning and game transitions. Scroll to zoom.',
  );
  card.classList.add('chart-card--wide', 'chart-card--spiral');

  const pitchRows = getChronologicalPitchRows(pitcherRows);

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
    `Pitch spiral for ${pitcherName} with ${pitchRows.length} pitches colored by result category.`,
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
  meta.textContent = `${pitchRows.length.toLocaleString()} pitches · scroll to zoom · white ring marks most recent pitch`;

  stage.appendChild(meta);
  card.appendChild(stage);
  return card;
}

function getSituationState() {
  const readRunner = (name) => (
    document.querySelector(`input[name="${name}"]:checked`)?.value === 'on'
  );

  return {
    onFirst: readRunner('runner-first'),
    onSecond: readRunner('runner-second'),
    onThird: readRunner('runner-third'),
    outs: Number(document.querySelector('input[name="outs-count"]:checked')?.value ?? 0),
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

  const topRow = document.createElement('div');
  topRow.className = 'chart-row';

  const matchupStack = document.createElement('div');
  matchupStack.className = 'matchup-stack';
  matchupStack.append(
    renderMatchup(pitcherName, batterName),
    renderRangeTableCard(pitcherName, batterName),
  );

  topRow.append(
    renderLastTenPitchesTable(pitcherRows),
    matchupStack,
  );

  chartGrid.append(
    topRow,
    renderPitchSpiral(pitcherRows, pitcherName, batterName),
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
    chartGrid.replaceChildren();
    return;
  }

  const filteredRows = filterRowsByPitcher(allRows, selectedPitcher);
  const batters = getUniqueBatters(filteredRows);
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
    allRows = rowsToObjects(playsMatrix);
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

situationPanel?.addEventListener('change', () => {
  if (pitcherSelect.value) {
    updateDashboard();
  }
});

loadSheetData();
