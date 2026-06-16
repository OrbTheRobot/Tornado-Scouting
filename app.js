import { SHEET_CONFIG, getSheetCsvUrl } from './config.js';

const pitcherSelect = document.getElementById('pitcher-select');
const statusEl = document.getElementById('status');
const rowCountEl = document.getElementById('row-count');
const chartGrid = document.getElementById('chart-grid');

let allRows = [];
const chartInstances = new Map();

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

  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'All pitchers';
  pitcherSelect.appendChild(defaultOption);

  pitchers.forEach((pitcher) => {
    const option = document.createElement('option');
    option.value = pitcher;
    option.textContent = pitcher;
    pitcherSelect.appendChild(option);
  });
}

function filterRowsByPitcher(rows, pitcher) {
  if (!pitcher) {
    return rows;
  }

  return rows.filter((row) => row[SHEET_CONFIG.filterColumn] === pitcher);
}

function destroyCharts() {
  chartInstances.forEach((chart) => chart.destroy());
  chartInstances.clear();
}

function renderPlaceholderCharts(rows, pitcher) {
  destroyCharts();
  chartGrid.replaceChildren();

  const chartDefinitions = [
    {
      id: 'chart-results',
      title: 'Results breakdown',
      description: 'Placeholder chart — define metrics in charts.js',
      build: buildResultsChart,
    },
    {
      id: 'chart-play-types',
      title: 'Play types',
      description: 'Placeholder chart — define metrics in charts.js',
      build: buildPlayTypeChart,
    },
    {
      id: 'chart-runs',
      title: 'Runs allowed',
      description: 'Placeholder chart — define metrics in charts.js',
      build: buildRunsChart,
    },
  ];

  chartDefinitions.forEach((definition) => {
    const card = document.createElement('article');
    card.className = 'chart-card';

    const heading = document.createElement('h2');
    heading.textContent = definition.title;

    const caption = document.createElement('p');
    caption.className = 'chart-caption';
    caption.textContent = definition.description;

    const canvas = document.createElement('canvas');
    canvas.id = definition.id;

    card.append(heading, caption, canvas);
    chartGrid.appendChild(card);

    const chart = definition.build(canvas, rows, pitcher);
    if (chart) {
      chartInstances.set(definition.id, chart);
    }
  });
}

function countByField(rows, field) {
  const counts = new Map();

  rows.forEach((row) => {
    const value = row[field]?.trim() || 'Unknown';
    counts.set(value, (counts.get(value) ?? 0) + 1);
  });

  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function buildResultsChart(canvas, rows) {
  const data = countByField(rows, 'Result').slice(0, 8);
  if (data.length === 0) {
    return null;
  }

  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels: data.map(([label]) => label),
      datasets: [
        {
          label: 'Plays',
          data: data.map(([, count]) => count),
          backgroundColor: '#4f8cff',
          borderRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { precision: 0 },
        },
      },
    },
  });
}

function buildPlayTypeChart(canvas, rows) {
  const data = countByField(rows, 'PlayType');
  if (data.length === 0) {
    return null;
  }

  return new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: data.map(([label]) => label),
      datasets: [
        {
          data: data.map(([, count]) => count),
          backgroundColor: ['#4f8cff', '#7c5cff', '#35bfa5', '#f5a524', '#ef6b6b'],
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' },
      },
    },
  });
}

function buildRunsChart(canvas, rows) {
  const runsByGame = new Map();

  rows.forEach((row) => {
    const game = row.Game || 'Unknown';
    const runs = Number.parseInt(row.Runs, 10) || 0;
    runsByGame.set(game, (runsByGame.get(game) ?? 0) + runs);
  });

  const data = [...runsByGame.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  if (data.length === 0) {
    return null;
  }

  return new Chart(canvas, {
    type: 'line',
    data: {
      labels: data.map(([game]) => game),
      datasets: [
        {
          label: 'Runs',
          data: data.map(([, runs]) => runs),
          borderColor: '#35bfa5',
          backgroundColor: 'rgba(53, 191, 165, 0.15)',
          fill: true,
          tension: 0.25,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { precision: 0 },
        },
      },
    },
  });
}

function updateDashboard() {
  const selectedPitcher = pitcherSelect.value;
  const filteredRows = filterRowsByPitcher(allRows, selectedPitcher);

  rowCountEl.textContent = `${filteredRows.length.toLocaleString()} plays`;
  renderPlaceholderCharts(filteredRows, selectedPitcher);
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
    updateDashboard();

    setStatus(`Loaded ${allRows.length.toLocaleString()} plays from ${SHEET_CONFIG.sheetName}`);
  } catch (error) {
    console.error(error);
    setStatus(`Failed to load sheet: ${error.message}`, true);
  }
}

pitcherSelect.addEventListener('change', updateDashboard);
loadSheetData();
