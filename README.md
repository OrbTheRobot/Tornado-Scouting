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

Placeholder charts are in `app.js`. Replace or extend the chart builders when you define the final chart requirements.

Configuration lives in `config.js`.
