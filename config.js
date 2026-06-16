export const SHEET_CONFIG = {
  spreadsheetId: '1lcgT6np-4O5x83b2JZXjv8REfNDYXE7GMYMZeu5znRY',
  sheetName: 'Plays (Converted)',
  filterColumn: 'Pitcher',
};

export function getSheetCsvUrl() {
  const sheet = encodeURIComponent(SHEET_CONFIG.sheetName);
  return `https://docs.google.com/spreadsheets/d/${SHEET_CONFIG.spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${sheet}`;
}
