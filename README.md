# Tornado Scouting

Static charting dashboard hosted on GitHub Pages, backed by a public Google Sheet.

Repository: [OrbTheRobot/Slayer-Souting-Report](https://github.com/OrbTheRobot/Slayer-Souting-Report)

## Data source

- Spreadsheet: [Export Tables](https://docs.google.com/spreadsheets/d/1NQ4l0EjwFYVdIjlYIkycYfuWw_jdZKiWsNURTcTy4AA/edit)
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
5. Save. The site will publish at `https://orbtherobot.github.io/Slayer-Souting-Report/`.

## Cursor workspace

Open `Tornado-Scouting.code-workspace` in Cursor to keep this project isolated from other repositories.

## Customize charts

Chart renderers live in `app.js`:

1. **Tornado Graph** — pitch compass with result colors and next-pitch range overlays

Configuration lives in `config.js`. See `docs/rln-charts-dashboard.md` for full specs.
