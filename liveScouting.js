export const SCOUT_MODES = {
  LIVE: 'live',
  SPECULATION: 'speculation',
};

function normalizeDate(value) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setHours(0, 0, 0, 0);
  return date;
}

export function parseSessionDates(rows) {
  return rows
    .map((row) => {
      const sessionNumber = Number.parseInt(String(row.Session ?? '').trim(), 10);
      const start = normalizeDate(row['Start Date']);
      const end = normalizeDate(row['End Date']);

      if (!Number.isFinite(sessionNumber) || !start || !end) {
        return null;
      }

      return {
        season: String(row.Season ?? '').trim(),
        sessionNumber,
        sessionKey: String(sessionNumber).padStart(2, '0'),
        start,
        end,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start || a.sessionNumber - b.sessionNumber);
}

export function getActiveSession(sessions, referenceDate = new Date()) {
  const today = normalizeDate(referenceDate);
  if (!today || sessions.length === 0) {
    return null;
  }

  const current = sessions.find((session) => today >= session.start && today <= session.end);
  if (current) {
    return current;
  }

  const upcoming = sessions.find((session) => session.start > today);
  if (upcoming) {
    return upcoming;
  }

  return sessions[sessions.length - 1];
}

function isGameFinished(game) {
  return Boolean(
    String(game.Win ?? '').trim()
    || String(game.Loss ?? '').trim()
    || String(game.End ?? '').trim(),
  );
}

function gameHasPlays(game, playRows) {
  const gameNumber = String(game['Game#'] ?? '').trim();
  if (!gameNumber) {
    return false;
  }

  return playRows.some((row) => String(row.Game ?? '').trim() === gameNumber);
}

function isGameLive(game, playRows) {
  if (isGameFinished(game)) {
    return false;
  }

  const hasStart = Boolean(String(game.Start ?? '').trim());
  const hasEnd = Boolean(String(game.End ?? '').trim());

  if (hasStart && !hasEnd) {
    return true;
  }

  return gameHasPlays(game, playRows);
}

export function getSunGamesForSession(games, sessionKey, scoutTeam = 'SUN') {
  return games
    .filter((game) => {
      const session = String(game.Session ?? '').trim();
      const away = String(game.Away ?? '').trim();
      const home = String(game.Home ?? '').trim();

      return session === sessionKey && (away === scoutTeam || home === scoutTeam);
    })
    .sort((a, b) => String(a['Game#']).localeCompare(String(b['Game#'])));
}

export function getOpponentTeam(game, scoutTeam = 'SUN') {
  const away = String(game.Away ?? '').trim();
  const home = String(game.Home ?? '').trim();

  if (away === scoutTeam) {
    return home;
  }

  if (home === scoutTeam) {
    return away;
  }

  return '';
}

export function resolveSunTargetGame({
  sessions,
  games,
  playRows,
  referenceDate = new Date(),
  scoutTeam = 'SUN',
}) {
  const session = getActiveSession(sessions, referenceDate);
  if (!session) {
    return null;
  }

  const sunGames = getSunGamesForSession(games, session.sessionKey, scoutTeam);
  if (sunGames.length === 0) {
    return null;
  }

  const liveGame = sunGames.find((game) => isGameLive(game, playRows));
  if (liveGame) {
    return {
      game: liveGame,
      session,
      opponentTeam: getOpponentTeam(liveGame, scoutTeam),
      status: 'live',
    };
  }

  const upcomingGame = sunGames.find((game) => !isGameFinished(game));
  if (upcomingGame) {
    return {
      game: upcomingGame,
      session,
      opponentTeam: getOpponentTeam(upcomingGame, scoutTeam),
      status: 'upcoming',
    };
  }

  const fallbackGame = sunGames[sunGames.length - 1];
  return {
    game: fallbackGame,
    session,
    opponentTeam: getOpponentTeam(fallbackGame, scoutTeam),
    status: 'completed',
  };
}

export function formatTargetGameLabel(targetGame, scoutTeam = 'SUN') {
  if (!targetGame?.game) {
    return 'No SUN game found for the active session';
  }

  const { game, opponentTeam, status, session } = targetGame;
  const away = String(game.Away ?? '').trim();
  const home = String(game.Home ?? '').trim();
  const matchup = `${away} @ ${home}`;
  const statusLabel = status === 'live'
    ? 'Live'
    : status === 'upcoming'
      ? 'Upcoming'
      : 'Last';

  return `${statusLabel}: ${matchup} · Session ${session.sessionNumber} · vs ${opponentTeam || '—'}`;
}

export function getRosterNames(playersByName, {
  team,
  role = 'all',
} = {}) {
  const names = [];

  playersByName.forEach((player, name) => {
    if (player.team !== team) {
      return;
    }

    if (player.status && player.status.toLowerCase() !== 'active') {
      return;
    }

    if (role === 'pitcher' && player.primary !== 'P') {
      return;
    }

    names.push(name);
  });

  return names.sort((a, b) => a.localeCompare(b));
}

export function decodeRunnerMask(brc) {
  const value = Number.parseInt(String(brc ?? '').trim(), 10);
  if (!Number.isFinite(value)) {
    return {
      onFirst: false,
      onSecond: false,
      onThird: false,
    };
  }

  return {
    onFirst: (value & 1) > 0,
    onSecond: (value & 2) > 0,
    onThird: (value & 4) > 0,
  };
}

export function inferSituationFromPlays(playRows, {
  gameNumber,
  offenseTeam,
} = {}) {
  const normalizedGame = String(gameNumber ?? '').trim();
  const emptySituation = {
    onFirst: false,
    onSecond: false,
    onThird: false,
    outs: 0,
    source: 'default',
    play: '',
    inning: '',
  };

  if (!normalizedGame) {
    return emptySituation;
  }

  const relevantPlays = playRows
    .filter((row) => String(row.Game ?? '').trim() === normalizedGame)
    .filter((row) => !offenseTeam || String(row.OFF ?? '').trim() === offenseTeam)
    .map((row) => ({
      row,
      playOrder: Number.parseInt(String(row.Play ?? '').trim(), 10),
    }))
    .filter((entry) => Number.isFinite(entry.playOrder))
    .sort((a, b) => b.playOrder - a.playOrder);

  const latest = relevantPlays[0]?.row;
  if (!latest) {
    return emptySituation;
  }

  const runners = decodeRunnerMask(latest.BRC);
  const outs = Number.parseInt(String(latest.Outs ?? '').trim(), 10);

  return {
    ...runners,
    outs: Number.isFinite(outs) ? Math.min(2, Math.max(0, outs)) : 0,
    source: 'inferred',
    play: String(latest.Play ?? '').trim(),
    inning: String(latest.Inning ?? '').trim(),
  };
}
