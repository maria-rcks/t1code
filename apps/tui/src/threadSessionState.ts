type ThreadSessionLike = {
  status?: string | null | undefined;
  activeTurnId?: string | null | undefined;
};

type ThreadLatestTurnLike = {
  state?: string | null | undefined;
  completedAt?: string | null | undefined;
};

type ThreadLike = {
  session?: ThreadSessionLike | null | undefined;
  latestTurn?: ThreadLatestTurnLike | null | undefined;
};

export function isThreadSessionActivelyWorking(session: ThreadSessionLike | null): boolean {
  if (!session) {
    return false;
  }

  if (session.status === "starting" || session.status === "connecting") {
    return true;
  }

  return session.status === "running" && session.activeTurnId !== null;
}

export function isThreadActivelyWorking(thread: ThreadLike | null): boolean {
  if (!thread) {
    return false;
  }

  if (isThreadSessionActivelyWorking(thread.session ?? null)) {
    return true;
  }

  return thread.latestTurn?.state === "running" && thread.latestTurn.completedAt == null;
}
