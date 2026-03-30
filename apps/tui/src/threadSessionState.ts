type ThreadSessionLike = {
  status?: string | null | undefined;
  activeTurnId?: string | null | undefined;
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
