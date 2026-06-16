import { SHEET_CONFIG, getSheetCsvUrl } from './config.js';

const PITCH_MIN = 1;
const PITCH_MAX = 1000;
const LAST_PITCH_COUNT = 10;
const HEATMAP_ROW_HEIGHT = 22;

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
  pitcherSelect.replaceChildren();

  pitchers.forEach((pitcher) => {
    const option = document.createElement('option');
    option.value = pitcher;
    option.textContent = pitcher;
    pitcherSelect.appendChild(option);
  });
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
    'Each row is a result type. The horizontal axis is pitch number from 1 to 1000.',
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

    const x = pitchNumber - 1;
    const y = rowIndex * HEATMAP_ROW_HEIGHT;

    context.fillStyle = '#4f8cff';
    context.fillRect(x, y + 1, 1, HEATMAP_ROW_HEIGHT - 2);
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

function renderChartThreePlaceholder() {
  const card = createChartCard(
    'Chart 3',
    'Custom chart — specification pending.',
  );
  card.classList.add('chart-card--placeholder');

  const placeholder = document.createElement('p');
  placeholder.className = 'empty-state';
  placeholder.textContent = 'Coming soon.';
  card.appendChild(placeholder);
  return card;
}

function renderDashboard(rows) {
  chartGrid.replaceChildren();

  chartGrid.append(
    renderLastTenPitchesTable(rows),
    renderResultHeatmap(rows),
    renderChartThreePlaceholder(),
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
  renderDashboard(filteredRows);
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

    if (pitchers.length > 0) {
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
