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

const ROSTER_ELIGIBLE_STATUSES = new Set(['active', 'captain']);

function isRosterEligibleStatus(status) {
  const normalized = String(status ?? '').trim().toLowerCase();
  return ROSTER_ELIGIBLE_STATUSES.has(normalized);
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

    if (!isRosterEligibleStatus(player.status)) {
      return;
    }

    if (role === 'pitcher' && player.primary !== 'P') {
      return;
    }

    if (role === 'batter' && player.primary === 'P') {
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
    .sort((a, b) => a.playOrder - b.playOrder);

  if (relevantPlays.length === 0) {
    return emptySituation;
  }

  let situation = {
    onFirst: false,
    onSecond: false,
    onThird: false,
    outs: 0,
  };
  let appliedResult = false;

  relevantPlays.forEach(({ row }) => {
    const result = String(row.Result ?? '').trim();
    if (!result) {
      return;
    }

    situation = projectPlayOutcome(situation, result).situation;
    appliedResult = true;
  });

  const latest = relevantPlays[relevantPlays.length - 1].row;

  if (!appliedResult) {
    const runners = decodeRunnerMask(latest.BRC);
    const rawOuts = Number.parseInt(String(latest.Outs ?? '').trim(), 10);

    if (Number.isFinite(rawOuts) && rawOuts >= 3) {
      situation = {
        onFirst: false,
        onSecond: false,
        onThird: false,
        outs: 0,
      };
    } else {
      situation = {
        ...runners,
        outs: normalizeOuts(rawOuts),
      };
    }
  }

  return {
    ...situation,
    source: 'inferred',
    play: String(latest.Play ?? '').trim(),
    inning: String(latest.Inning ?? '').trim(),
  };
}

function normalizeOuts(outs) {
  const value = Number.parseInt(String(outs ?? 0), 10);
  if (!Number.isFinite(value)) {
    return 0;
  }

  if (value >= 3) {
    return 0;
  }

  return Math.min(2, Math.max(0, value));
}

function countRunnersOnBase(situation) {
  return (
    (situation?.onFirst ? 1 : 0)
    + (situation?.onSecond ? 1 : 0)
    + (situation?.onThird ? 1 : 0)
  );
}

function finalizeProjectedSituation(state) {
  const outs = Number.parseInt(String(state.outs ?? 0), 10);

  if (Number.isFinite(outs) && outs >= 3) {
    return {
      onFirst: false,
      onSecond: false,
      onThird: false,
      outs: 0,
    };
  }

  return {
    onFirst: Boolean(state.onFirst),
    onSecond: Boolean(state.onSecond),
    onThird: Boolean(state.onThird),
    outs: normalizeOuts(outs),
  };
}

function buildPlayOutcome(state, runsScored = 0) {
  const rawOuts = Number.parseInt(String(state.outs ?? 0), 10);
  return {
    situation: finalizeProjectedSituation(state),
    runsScored: Math.max(0, runsScored),
    inningEnded: Number.isFinite(rawOuts) && rawOuts >= 3,
  };
}

export function projectPlayOutcome(situation, resultCode) {
  const code = String(resultCode ?? '').trim().toUpperCase();
  let onFirst = Boolean(situation?.onFirst);
  let onSecond = Boolean(situation?.onSecond);
  let onThird = Boolean(situation?.onThird);
  const outs = normalizeOuts(situation?.outs);
  let runsScored = 0;

  if (code === 'K' || code === 'PO') {
    return buildPlayOutcome({ onFirst, onSecond, onThird, outs: outs + 1 });
  }

  if (code === 'BB') {
    if (onFirst && onSecond && onThird) {
      runsScored = 1;
    }
    if (onFirst && onSecond) {
      onThird = true;
    } else if (onFirst) {
      onSecond = true;
    } else {
      onFirst = true;
    }
    return buildPlayOutcome({ onFirst, onSecond, onThird, outs }, runsScored);
  }

  if (code === 'HR') {
    return buildPlayOutcome(
      { onFirst: false, onSecond: false, onThird: false, outs },
      countRunnersOnBase({ onFirst, onSecond, onThird }) + 1,
    );
  }

  if (code === '3B') {
    return buildPlayOutcome(
      { onFirst: false, onSecond: false, onThird: true, outs },
      countRunnersOnBase({ onFirst, onSecond, onThird }),
    );
  }

  if (code === '2B' || code === '2BWH') {
    runsScored = (onSecond ? 1 : 0) + (onThird ? 1 : 0);
    return buildPlayOutcome(
      { onFirst: false, onSecond: true, onThird: false, outs },
      runsScored,
    );
  }

  if (code.startsWith('1B') || code === 'IF1B') {
    runsScored = (onThird ? 1 : 0) + (onSecond && onThird ? 1 : 0);
    if (onThird && (onFirst || onSecond)) {
      onThird = true;
    } else if (onThird) {
      onThird = false;
      onFirst = true;
    } else if (onSecond) {
      onThird = onSecond;
      onSecond = false;
      onFirst = true;
    } else if (onFirst) {
      onSecond = onFirst;
      onFirst = true;
    } else {
      onFirst = true;
    }
    return buildPlayOutcome({ onFirst, onSecond, onThird, outs }, runsScored);
  }

  if (code === 'FO' || code === 'DFO' || code === 'SACF' || code === 'DSACF') {
    if ((code === 'SACF' || code === 'DSACF') && onThird && outs < 2) {
      runsScored = 1;
      onThird = false;
    }
    return buildPlayOutcome({ onFirst, onSecond, onThird, outs: outs + 1 }, runsScored);
  }

  if (code === 'GO' || code === 'GORA' || code === 'FCH') {
    return buildPlayOutcome({ onFirst: false, onSecond, onThird, outs: outs + 1 });
  }

  if (code.startsWith('FC')) {
    onFirst = false;
    return buildPlayOutcome({ onFirst, onSecond, onThird, outs: outs + 1 });
  }

  if (code === 'TP') {
    return buildPlayOutcome({
      onFirst: false,
      onSecond: false,
      onThird: false,
      outs: outs + 3,
    });
  }

  if (code.startsWith('DP') || code === 'DPH1' || code === 'LODP' || code === 'LOTP') {
    onFirst = false;
    return buildPlayOutcome({ onFirst, onSecond, onThird, outs: outs + 2 });
  }

  return buildPlayOutcome({ onFirst, onSecond, onThird, outs: outs + 1 });
}

export function projectSituationAfterResult(situation, resultCode) {
  return projectPlayOutcome(situation, resultCode).situation;
}
