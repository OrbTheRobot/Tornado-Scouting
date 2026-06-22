export const SHEET_CONFIG = {
  spreadsheetId: '1NQ4l0EjwFYVdIjlYIkycYfuWw_jdZKiWsNURTcTy4AA',
  sheetName: 'Plays (Converted)',
  playersSheetName: 'Players',
  playersImportSheetName: 'import_players',
  gamesSheetName: 'Games',
  datesSheetName: 'Dates',
  filterColumn: 'Pitcher',
  scoutTeamAbv: 'SUN',
};

/** Historical play archive referenced by the MLN Data Import Guide sheet. */
export const HISTORICAL_PLAYS_CONFIG = {
  guideSpreadsheetId: '10YijQ45zwO2uxws7HF1As46pz3dFnxv_qcI-EIvSXCg',
  spreadsheetId: '1H9ES_TL9nC0x-Q3auM6jtLcb6bII--eu4MtcAPoFcqg',
  sheetName: 'Converted Play Log',
  minSeason: 11,
  maxSeason: 13,
};

/** Alternate header names on export tabs mapped to canonical play fields. */
export const PLAYS_FIELD_SOURCES = {
  'Pitch #': ['Pitch #', 'Pitch'],
  'Swing #': ['Swing #', 'Swing'],
};

export function normalizePlayRow(row) {
  const normalized = { ...row };

  for (const [canonical, sources] of Object.entries(PLAYS_FIELD_SOURCES)) {
    if (String(normalized[canonical] ?? '').trim()) {
      continue;
    }

    for (const source of sources) {
      if (source === canonical) {
        continue;
      }

      const value = normalized[source];
      if (String(value ?? '').trim()) {
        normalized[canonical] = value;
        break;
      }
    }
  }

  return normalized;
}

export const PLAYER_SHEET_COLUMNS = {
  team: 1,
  name: 3,
  status: 6,
  primary: 7,
  handedness: 9,
  batting: {
    con: 10,
    eye: 11,
    pow: 12,
    spd: 13,
  },
  pitching: {
    con: 14,
    eye: 15,
    pow: 16,
    spd: 17,
  },
};

export function getSheetCsvUrl(
  sheetName = SHEET_CONFIG.sheetName,
  { bustCache = false, spreadsheetId = SHEET_CONFIG.spreadsheetId } = {},
) {
  const sheet = encodeURIComponent(sheetName);
  const base = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${sheet}`;

  if (bustCache) {
    return `${base}&t=${Date.now()}`;
  }

  return base;
}

export function getHistoricalPlaysCsvUrl(
  seasonQuery,
  { bustCache = false, spreadsheetId = HISTORICAL_PLAYS_CONFIG.spreadsheetId } = {},
) {
  const sheet = encodeURIComponent(HISTORICAL_PLAYS_CONFIG.sheetName);
  const query = encodeURIComponent(seasonQuery);
  const base = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&headers=1&sheet=${sheet}&tq=${query}`;

  if (bustCache) {
    return `${base}&t=${Date.now()}`;
  }

  return base;
}
