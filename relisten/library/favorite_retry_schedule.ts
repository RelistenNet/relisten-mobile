/** Returns the first future durable retry deadline, ignoring already-due rows. */
export function earliestFutureRetryAt(
  nextAttemptAts: Iterable<Date | undefined>,
  now = Date.now()
): number | undefined {
  let earliest: number | undefined;

  for (const nextAttemptAt of nextAttemptAts) {
    const candidate = nextAttemptAt?.getTime();
    if (
      candidate !== undefined &&
      candidate > now &&
      (earliest === undefined || candidate < earliest)
    ) {
      earliest = candidate;
    }
  }

  return earliest;
}
