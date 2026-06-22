export const SHEET_CONFIG = {
  spreadsheetId: '1VViAMYTIwtyiWibrDES-q98xgek7hynYxGtAizWi0Y0',
  sheetName: 'Plays (Converted)',
  playersSheetName: 'Players',
  playersImportSheetName: 'import_players',
  filterColumn: 'Pitcher',
};

/** Alternate header names on WNC export tabs mapped to canonical play fields. */
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
  name: 3,
  handedness: 9,
  batting: {
    con: 10,
    eye: 11,
    pow: 12,
    spd: 13,
  },
  pitching: {
    con: 15,
    eye: 16,
    pow: 17,
    spd: 18,
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
