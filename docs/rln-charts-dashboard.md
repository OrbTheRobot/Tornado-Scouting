# RLN Charts Dashboard

## Overview

Tornado Scouting is a client-side dashboard that reads play-by-play data from a public Google Sheet and renders pitcher-focused views in the browser. It is designed for GitHub Pages hosting with no backend.

## Architecture

```mermaid
flowchart LR
    Sheet[Google Sheet Plays Converted] -->|gviz CSV| App[Static web app]
    App --> Filter[Pitcher dropdown]
    Filter --> Table[Last 10 pitches table]
    Filter --> Heatmap[Result heatmap]
```

## Data contract

| Setting | Value |
| --- | --- |
| Spreadsheet ID | `1lcgT6np-4O5x83b2JZXjv8REfNDYXE7GMYMZeu5znRY` |
| Tab | `Plays (Converted)` |
| Filter field | `Pitcher` (sheet column I) |
| Pitch number field | `Pitch #` (sheet column J), scale 1–1000 |
| Fetch URL | `https://docs.google.com/spreadsheets/d/{id}/gviz/tq?tqx=out:csv&sheet=Plays%20(Converted)` |

The app maps CSV headers to row objects and filters rows where `Pitcher` equals the selected dropdown value. A pitcher must be selected; the first pitcher in the sheet is selected by default on load.

## File map

| File | Responsibility |
| --- | --- |
| `index.html` | Page shell and chart container |
| `styles.css` | Layout, table, and heatmap theme |
| `config.js` | Sheet ID, tab name, filter column |
| `app.js` | CSV fetch/parse, filter logic, table and heatmap rendering |

## Charts

### Chart 1 — Last 10 pitches (table)

Shows the 10 most recent pitches for the selected pitcher, sorted chronologically by `Play` (most recent first).

| Column | Source field |
| --- | --- |
| Pitch # | `Pitch #` |
| Result | `Result` |
| Batter | `Batter` |
| Inning | `Inning` |

Rows without a valid pitch number (1–1000) are excluded.

### Chart 2 — Result heatmap

- **Y-axis (bucketed):** one row per `Result` value for the selected pitcher, ordered by frequency.
- **X-axis (continuous):** pitch number from 1 to 1000. Each pitch is plotted at its exact `Pitch #` position (not bucketed).
- **Color:** a mark at `(pitch #, result)` for each qualifying play.

Rendered on a 1000px-wide canvas mapped 1:1 to the pitch number scale. The `Diff` field is not used.

### Chart 3

Placeholder for a custom chart — specification pending.

## Extending charts

1. Add a render function in `app.js`.
2. Register it in `renderDashboard`.
3. Use the filtered pitcher rows passed into each renderer.

Example fields available on each play row:

- `Game`, `Inning`, `Play`, `Outs`, `BRC`, `OFF`, `DEF`
- `PlayType`, `Pitcher`, `Pitch #`, `Batter`, `Swing #`
- `Catcher`, `Throw #`, `Runner`, `Steal #`, `Result`, `Runs`
- `Pitcher ID`, `Batter ID`, `Catcher Id`, `Runner ID`, `Diff`, `Session #`

## Deployment checklist

- [x] Push repo to GitHub
- [ ] Enable GitHub Pages from `main` / root
- [ ] Confirm sheet remains publicly readable
- [ ] Define and implement Chart 3

## Notes

- No API key is required because the sheet is public and fetched through Google's CSV export endpoint.
- Data refresh happens on page load. Add a refresh button or interval polling later if needed.
- Chart.js is no longer used; the table and heatmap are rendered with native DOM and canvas.
