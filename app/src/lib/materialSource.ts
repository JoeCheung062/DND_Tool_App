/** True when the API host itself could not be contacted. */
export function isServerUnreachable(error: unknown): boolean {
  const message =
    error instanceof Error ? `${error.name} ${error.message}` : String(error ?? "");
  return isUnreachableMessage(message);
}

export function isUnreachableMessage(message: string): boolean {
  const msg = message.toLowerCase();
  return (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("network error") ||
    msg.includes("econnrefused") ||
    msg.includes("enotfound") ||
    msg.includes("etimedout") ||
    msg.includes("ehostunreach") ||
    msg.includes("err_connection") ||
    msg.includes("err_name_not_resolved") ||
    msg.includes("err_internet_disconnected") ||
    msg.includes("err_address_unreachable") ||
    msg.includes("getaddrinfo") ||
    msg.includes("socket connection timeout") ||
    msg.includes("socket hang up")
  );
}

/**
 * Fall back to Control only when every attempted download failed
 * because the server could not be reached.
 */
export function serverDownloadMissed(
  savedCount: number,
  failures: Array<{ error: string }>
): boolean {
  return (
    savedCount === 0 &&
    failures.length > 0 &&
    failures.every((failure) => isUnreachableMessage(failure.error))
  );
}
