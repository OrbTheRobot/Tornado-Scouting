import { SHEET_CONFIG, getSheetCsvUrl } from './config.js';

const PITCH_MIN = 1;
const PITCH_MAX = 1000;
const LAST_PITCH_COUNT = 10;
const SPIRAL_CANVAS_SIZE = 960;
const SPIRAL_RENDER_SCALE = 3;
const SPIRAL_MIN_RADIUS = 0.03;
const SPIRAL_MAX_RADIUS = 0.88;
const SPIRAL_RADIUS_SCALE = 0.4;
const SPIRAL_POINT_RADIUS = 12;
const SPIRAL_LATEST_RADIUS = 14;
const SPIRAL_CONNECTOR_STEPS = 72;
const SPIRAL_ZOOM_MIN = 0.6;
const SPIRAL_ZOOM_MAX = 8;
const TWO_PI = Math.PI * 2;

const RESULT_PALETTE = [
  '#4f8cff',
  '#35bfa5',
  '#7c5cff',
  '#f5a524',
  '#ef6b6b',
  '#56cfe1',
  '#ff8fab',
  '#80ed99',
  '#ffd166',
  '#9b5de5',
  '#f15bb5',
  '#00bbf9',
  '#fee440',
  '#00f5d4',
  '#fb5607',
  '#caffbf',
  '#bdb2ff',
  '#ffc6ff',
  '#fdffb6',
  '#a0c4ff',
];

const pitcherSelect = document.getElementById('pitcher-select');
const statusEl = document.getElementById('status');
const rowCountEl = document.getElementById('row-count');
const chartGrid = document.getElementById('chart-grid');

let allRows = [];

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
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
  const previous = pitcherSelect.value;
  pitcherSelect.replaceChildren();

  pitchers.forEach((pitcher) => {
    const option = document.createElement('option');
    option.value = pitcher;
    option.textContent = pitcher;
    pitcherSelect.appendChild(option);
  });

  if (previous && pitchers.includes(previous)) {
    pitcherSelect.value = previous;
  } else if (pitchers.length > 0) {
    pitcherSelect.value = pitchers[0];
  }
}

function filterRowsByPitcher(rows, pitcher) {
  return rows.filter((row) => row[SHEET_CONFIG.filterColumn] === pitcher);
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

function getUniqueResults(rows) {
  const counts = new Map();

  rows.forEach((row) => {
    const result = row.Result?.trim() || 'Unknown';
    counts.set(result, (counts.get(result) ?? 0) + 1);
  });

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([result]) => result);
}

function buildResultColorMap(results) {
  const colorMap = new Map();

  results.forEach((result, index) => {
    colorMap.set(result, RESULT_PALETTE[index % RESULT_PALETTE.length]);
  });

  return colorMap;
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
  card.classList.add('chart-card--table');

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

  const table = document.createElement('table');
  table.className = 'pitch-table';

  const columns = [
    { key: 'Pitch #', label: 'Pitch #' },
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
  card.appendChild(table);
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

function buildSpiralPoints(pitchRows, center, maxRadius, resultColorMap) {
  const chronological = [...pitchRows].sort((a, b) => a.playOrder - b.playOrder);
  const count = chronological.length;

  return chronological.map((entry, index) => {
    const progress = count === 1 ? 1 : index / (count - 1);
    const radiusFraction = SPIRAL_MIN_RADIUS
      + progress * (SPIRAL_MAX_RADIUS - SPIRAL_MIN_RADIUS);
    const angle = pitchNumberToAngle(entry.pitchNumber);
    const point = polarToCanvas(angle, radiusFraction, center, maxRadius);
    const result = entry.row.Result?.trim() || 'Unknown';

    return {
      ...point,
      pitchNumber: entry.pitchNumber,
      result,
      color: resultColorMap.get(result) ?? '#9aa7b5',
      playOrder: entry.playOrder,
    };
  });
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

  context.stroke();
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

function drawPitchSpiralScene(context, center, maxRadius, points) {
  drawSpiralGuide(context, center, maxRadius);

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
}

function renderResultLegend(resultColorMap) {
  const legend = document.createElement('div');
  legend.className = 'result-legend';

  [...resultColorMap.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .forEach(([result, color]) => {
      const item = document.createElement('span');
      item.className = 'result-legend-item';

      const swatch = document.createElement('span');
      swatch.className = 'result-legend-swatch';
      swatch.style.backgroundColor = color;

      const label = document.createElement('span');
      label.textContent = result;

      item.append(swatch, label);
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
}

function renderPitchSpiral(pitcherRows, pitcherName) {
  const card = createChartCard(
    'Pitch spiral',
    'Pitch number sets angle from top (pitch # × 360 ÷ 1000). Color shows result type; newer pitches sit farther from center. Scroll to zoom.',
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

  const results = getUniqueResults(pitchRows.map(({ row }) => row));
  const resultColorMap = buildResultColorMap(results);

  const stage = document.createElement('div');
  stage.className = 'spiral-stage';

  const legend = renderResultLegend(resultColorMap);
  legend.classList.add('result-legend--overlay');

  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'spiral-canvas-wrap';

  const canvas = document.createElement('canvas');
  canvas.className = 'spiral-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute(
    'aria-label',
    `Pitch spiral for ${pitcherName} with ${pitchRows.length} pitches colored by result.`,
  );

  const center = SPIRAL_CANVAS_SIZE / 2;
  const maxRadius = SPIRAL_CANVAS_SIZE * SPIRAL_RADIUS_SCALE;
  const points = buildSpiralPoints(pitchRows, center, maxRadius, resultColorMap);

  canvasWrap.appendChild(canvas);
  stage.append(legend, canvasWrap);

  attachSpiralZoom(canvas, (context) => {
    drawPitchSpiralScene(context, center, maxRadius, points);
  });

  const meta = document.createElement('p');
  meta.className = 'spiral-legend spiral-legend--overlay';
  meta.textContent = `${pitchRows.length.toLocaleString()} pitches · scroll to zoom · white ring marks most recent pitch`;

  stage.appendChild(meta);
  card.appendChild(stage);
  return card;
}

function renderDashboard(pitcherRows, pitcherName) {
  chartGrid.replaceChildren();

  chartGrid.append(
    renderLastTenPitchesTable(pitcherRows),
    renderPitchSpiral(pitcherRows, pitcherName),
  );
}

function updateDashboard() {
  const selectedPitcher = pitcherSelect.value;
  if (!selectedPitcher) {
    rowCountEl.textContent = '0 plays';
    chartGrid.replaceChildren();
    return;
  }

  const filteredRows = filterRowsByPitcher(allRows, selectedPitcher);
  rowCountEl.textContent = `${filteredRows.length.toLocaleString()} plays`;
  renderDashboard(filteredRows, selectedPitcher);
}

async function loadSheetData() {
  setStatus('Loading sheet data...');

  try {
    const response = await fetch(getSheetCsvUrl());
    if (!response.ok) {
      throw new Error(`Sheet request failed (${response.status})`);
    }

    const csvText = await response.text();
    const matrix = parseCsv(csvText);
    allRows = rowsToObjects(matrix);

    const pitchers = getUniquePitchers(allRows);
    populatePitcherDropdown(pitchers);

    if (pitchers.length > 0 && !pitcherSelect.value) {
      pitcherSelect.value = pitchers[0];
    }

    updateDashboard();
    setStatus(`Loaded ${allRows.length.toLocaleString()} plays from ${SHEET_CONFIG.sheetName}`);
  } catch (error) {
    console.error(error);
    setStatus(`Failed to load sheet: ${error.message}`, true);
  }
}

pitcherSelect.addEventListener('change', updateDashboard);
loadSheetData();
