# Tornado Scouting

Static charting dashboard hosted on GitHub Pages, backed by a public Google Sheet.

Repository: [OrbTheRobot/Tornado-Scouting](https://github.com/OrbTheRobot/Tornado-Scouting)

## Data source

- Spreadsheet: [RLN Export Tables 12.0](https://docs.google.com/spreadsheets/d/1lcgT6np-4O5x83b2JZXjv8REfNDYXE7GMYMZeu5znRY/edit)
- Tab: `Plays (Converted)`
- Filter column: `Pitcher` (column I)

## Local preview

From this folder:

```cmd
python -m http.server 8080
```

Open `http://localhost:8080`.

## GitHub Pages deployment

1. Push to `main` on this repository.
2. In the repo, go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
4. Choose branch `main` and folder `/ (root)`.
5. Save. The site will publish at `https://orbtherobot.github.io/Tornado-Scouting/`.

## Cursor workspace

Open `Tornado-Scouting.code-workspace` in Cursor to keep this project isolated from other repositories.

## Customize charts

Chart renderers live in `app.js`:

1. **Last 10 pitches** — table sorted chronologically by `Play`
2. **Result heatmap** — canvas heatmap with pitch # 1–1000 on the X axis
3. **Pitch spiral** — full pitcher history on a pitch-number compass with radial recency

Configuration lives in `config.js`. See `docs/rln-charts-dashboard.md` for full specs.
