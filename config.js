export const SHEET_CONFIG = {
  spreadsheetId: '1lcgT6np-4O5x83b2JZXjv8REfNDYXE7GMYMZeu5znRY',
  sheetName: 'Plays (Converted)',
  playersSheetName: 'Players',
  playersImportSheetName: 'import_players',
  filterColumn: 'Pitcher',
};

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
