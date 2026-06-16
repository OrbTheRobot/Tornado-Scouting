import { SHEET_CONFIG, getSheetCsvUrl } from './config.js';

const PITCH_MIN = 1;
const PITCH_MAX = 1000;
const LAST_PITCH_COUNT = 10;
const HEATMAP_ROW_HEIGHT = 40;
const HEATMAP_BUBBLE_RADIUS = 15;
const SPIRAL_CANVAS_SIZE = 640;
const SPIRAL_MIN_RADIUS = 0.08;
const SPIRAL_MAX_RADIUS = 0.52;
const SPIRAL_POINT_RADIUS = 11;
const SPIRAL_LATEST_RADIUS = 13;
const SPIRAL_CONNECTOR_STEPS = 48;
const SPIRAL_ZOOM_MIN = 0.6;
const SPIRAL_ZOOM_MAX = 8;
const TWO_PI = Math.PI * 2;

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

function getPitchRows(rows) {
  return rows
    .map((row) => {
      const pitchNumber = parsePitchNumber(row);
      if (pitchNumber === null) {
        return null;
      }

      return { row, pitchNumber };
    })
    .filter(Boolean);
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

function getResultRows(rows) {
  const counts = new Map();

  rows.forEach((row) => {
    const result = row.Result?.trim() || 'Unknown';
    counts.set(result, (counts.get(result) ?? 0) + 1);
  });

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([result]) => result);
}

function renderResultHeatmap(rows) {
  const card = createChartCard(
    'Result heatmap',
    'Each row is a result type. Bubbles show exact pitch numbers on the 1–1000 scale.',
  );
  card.classList.add('chart-card--wide');

  const pitchRows = getPitchRows(rows);
  const results = getResultRows(pitchRows.map(({ row }) => row));

  if (pitchRows.length === 0 || results.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No pitch data for this pitcher.';
    card.appendChild(empty);
    return card;
  }

  const resultIndex = new Map(results.map((result, index) => [result, index]));

  const heatmap = document.createElement('div');
  heatmap.className = 'heatmap';
  heatmap.style.setProperty('--heatmap-rows', String(results.length));

  const labels = document.createElement('div');
  labels.className = 'heatmap-labels';

  results.forEach((result) => {
    const label = document.createElement('span');
    label.className = 'heatmap-label';
    label.textContent = result;
    labels.appendChild(label);
  });

  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'heatmap-canvas-wrap';

  const canvas = document.createElement('canvas');
  canvas.className = 'heatmap-canvas';
  canvas.width = PITCH_MAX;
  canvas.height = results.length * HEATMAP_ROW_HEIGHT;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute(
    'aria-label',
    `Pitch result heatmap with ${results.length} result rows across pitch numbers ${PITCH_MIN} to ${PITCH_MAX}.`,
  );

  const context = canvas.getContext('2d');
  context.fillStyle = '#121820';
  context.fillRect(0, 0, canvas.width, canvas.height);

  pitchRows.forEach(({ row, pitchNumber }) => {
    const result = row.Result?.trim() || 'Unknown';
    const rowIndex = resultIndex.get(result);
    if (rowIndex === undefined) {
      return;
    }

    const x = pitchNumber;
    const y = rowIndex * HEATMAP_ROW_HEIGHT + HEATMAP_ROW_HEIGHT / 2;

    context.beginPath();
    context.fillStyle = '#4f8cff';
    context.arc(x, y, HEATMAP_BUBBLE_RADIUS, 0, TWO_PI);
    context.fill();

    context.strokeStyle = 'rgba(42, 52, 65, 0.95)';
    context.lineWidth = 1.5;
    context.stroke();

    context.fillStyle = '#e8edf2';
    context.font = '600 10px "Segoe UI", system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(String(pitchNumber), x, y);
  });

  canvasWrap.appendChild(canvas);

  const axis = document.createElement('div');
  axis.className = 'heatmap-axis';
  axis.innerHTML = `
    <span>${PITCH_MIN}</span>
    <span>250</span>
    <span>500</span>
    <span>750</span>
    <span>${PITCH_MAX}</span>
  `;

  heatmap.append(labels, canvasWrap, axis);
  card.appendChild(heatmap);
  return card;
}

function pitchNumberToAngle(pitchNumber) {
  return (pitchNumber / PITCH_MAX) * TWO_PI;
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

    return {
      ...point,
      pitchNumber: entry.pitchNumber,
      result: entry.row.Result?.trim() || 'Unknown',
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

  const guideRadius = (SPIRAL_MAX_RADIUS + 0.1) * maxRadius;

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
    const labelRadius = guideRadius + 14;
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
    const pitchNumber = fromPoint.pitchNumber
      + (toPoint.pitchNumber - fromPoint.pitchNumber) * progress;
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
  context.fillStyle = isLatest ? '#35bfa5' : '#4f8cff';
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
    context.strokeStyle = 'rgba(232, 237, 242, 0.9)';
    context.lineWidth = 1.5;
    context.arc(point.x, point.y, radius + 2, 0, TWO_PI);
    context.stroke();
  }
}

function drawPitchSpiralScene(context, center, maxRadius, points) {
  drawSpiralGuide(context, center, maxRadius);

  context.strokeStyle = 'rgba(79, 140, 255, 0.45)';
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

function attachSpiralZoom(canvas, wrap, drawScene) {
  const view = { scale: 1, offsetX: 0, offsetY: 0 };

  function layoutCanvas() {
    canvas.style.width = `${SPIRAL_CANVAS_SIZE}px`;
    canvas.style.height = `${SPIRAL_CANVAS_SIZE}px`;
    canvas.style.transformOrigin = 'top left';
    canvas.style.transform = `translate(${view.offsetX}px, ${view.offsetY}px) scale(${view.scale})`;

    const scaledSize = SPIRAL_CANVAS_SIZE * view.scale;
    wrap.style.minWidth = `${scaledSize + Math.abs(view.offsetX)}px`;
    wrap.style.minHeight = `${scaledSize + Math.abs(view.offsetY)}px`;
  }

  function redraw() {
    const context = canvas.getContext('2d');
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#121820';
    context.fillRect(0, 0, canvas.width, canvas.height);
    drawScene(context);
    layoutCanvas();
  }

  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();

    const rect = canvas.getBoundingClientRect();
    const scaleFactor = canvas.width / rect.width;
    const pointerX = (event.clientX - rect.left) * scaleFactor;
    const pointerY = (event.clientY - rect.top) * scaleFactor;
    const zoomMultiplier = event.deltaY < 0 ? 1.12 : 1 / 1.12;
    const nextScale = Math.min(SPIRAL_ZOOM_MAX, Math.max(SPIRAL_ZOOM_MIN, view.scale * zoomMultiplier));

    view.offsetX = pointerX - ((pointerX - view.offsetX) * nextScale) / view.scale;
    view.offsetY = pointerY - ((pointerY - view.offsetY) * nextScale) / view.scale;
    view.scale = nextScale;
    redraw();
  }, { passive: false });

  redraw();
}

function renderPitchSpiral(pitcherRows, pitcherName) {
  const card = createChartCard(
    'Pitch spiral',
    'Pitch number sets angle from top (pitch # × 360 ÷ 1000). Newer pitches sit farther from the center. Scroll to zoom.',
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

  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'spiral-canvas-wrap';

  const canvas = document.createElement('canvas');
  canvas.className = 'spiral-canvas';
  canvas.width = SPIRAL_CANVAS_SIZE;
  canvas.height = SPIRAL_CANVAS_SIZE;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute(
    'aria-label',
    `Pitch spiral for ${pitcherName} with ${pitchRows.length} pitches.`,
  );

  const center = SPIRAL_CANVAS_SIZE / 2;
  const maxRadius = SPIRAL_CANVAS_SIZE * 0.36;
  const points = buildSpiralPoints(pitchRows, center, maxRadius);

  canvasWrap.appendChild(canvas);

  attachSpiralZoom(canvas, canvasWrap, (context) => {
    drawPitchSpiralScene(context, center, maxRadius, points);
  });

  const legend = document.createElement('p');
  legend.className = 'spiral-legend';
  legend.textContent = `${pitchRows.length.toLocaleString()} pitches · scroll to zoom · newest highlighted in green`;

  card.append(canvasWrap, legend);
  return card;
}

function renderDashboard(pitcherRows, pitcherName) {
  chartGrid.replaceChildren();

  chartGrid.append(
    renderLastTenPitchesTable(pitcherRows),
    renderResultHeatmap(pitcherRows),
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
