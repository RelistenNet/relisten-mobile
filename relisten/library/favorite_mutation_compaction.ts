export interface FavoriteMutationCompactionCandidate {
  state: string;
  attemptCount: number;
  importUuid?: string;
}

/**
 * Only an operation that has never started a request is safe to replace with a
 * newer local intent. Once an attempt begins, the server may have committed it
 * even if the client never received the response, so its operation UUID must
 * stay in the outbox for an idempotent retry.
 */
export function isTrulyUnsentFavoriteMutation(mutation: FavoriteMutationCompactionCandidate) {
  return mutation.state === 'pending' && mutation.attemptCount === 0;
}

export function importUuidsSettledByCompaction(
  mutations: ReadonlyArray<FavoriteMutationCompactionCandidate>
) {
  const importUuids = new Set<string>();
  for (const mutation of mutations) {
    if (isTrulyUnsentFavoriteMutation(mutation) && mutation.importUuid) {
      importUuids.add(mutation.importUuid);
    }
  }

  return importUuids;
}
