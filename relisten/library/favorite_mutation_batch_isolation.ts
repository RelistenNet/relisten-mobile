import type {
  FavoriteMutationBatchRequest,
  FavoriteMutationBatchResponse,
} from '@/relisten/library/favorite_sync_contract';

export type FavoriteSyncFailure = {
  code: string;
  message: string;
  retryable: boolean;
};

/** Catalog absence was a write error on older servers, but is now retryable version skew. */
export function favoriteSyncErrorIsRetryable(code: string, declaredRetryable: boolean) {
  return code === 'catalog_unavailable' || declaredRetryable;
}

type BatchIsolationOptions = {
  request: FavoriteMutationBatchRequest;
  send: (request: FavoriteMutationBatchRequest) => Promise<FavoriteMutationBatchResponse>;
  apply: (request: FavoriteMutationBatchRequest, response: FavoriteMutationBatchResponse) => void;
  reject: (mutationUuids: ReadonlyArray<string>, failure: FavoriteSyncFailure) => void;
};

const MUTATION_SEMANTIC_ERROR_CODES = new Set([
  'favorite_uuid_conflict',
  'idempotency_conflict',
  'invalid_favorite_mutation',
  'quota_exceeded',
]);

/**
 * The server commits a batch atomically, so a mutation-semantic terminal
 * error means none of its valid neighbors were saved. Prefer the server's
 * named bad operations; otherwise bisect only that failed batch until each
 * rejection is isolated.
 * Successful imports keep normal 100-item throughput while one invalid
 * operation cannot force the user to discard unrelated changes.
 */
export async function sendFavoriteMutationBatchWithIsolation(options: BatchIsolationOptions) {
  await sendWithIsolation(options.request, options);
}

async function sendWithIsolation(
  request: FavoriteMutationBatchRequest,
  options: BatchIsolationOptions
): Promise<void> {
  try {
    const response = await options.send(request);
    options.apply(request, response);
    return;
  } catch (error) {
    const failure = favoriteSyncFailure(error);
    if (failure.retryable) {
      throw error;
    }
    if (!isMutationSemanticFailure(error)) {
      // A second 401, a missing route, or a malformed successful response is
      // not evidence that any particular mutation is bad. Leave the entire
      // durable batch pending so an account/deployment repair can recover it.
      throw error;
    }

    const rejectedMutationUuids = terminalMutationUuids(error, request);
    if (rejectedMutationUuids.size > 0) {
      options.reject([...rejectedMutationUuids], failure);
      const remaining = request.mutations.filter(
        (mutation) => !rejectedMutationUuids.has(mutation.mutation_uuid)
      );
      if (remaining.length > 0) {
        await sendWithIsolation({ contract_version: 1, mutations: remaining }, options);
      }
      return;
    }

    if (request.mutations.length === 1) {
      options.reject([request.mutations[0].mutation_uuid], failure);
      return;
    }

    const midpoint = Math.ceil(request.mutations.length / 2);
    await sendWithIsolation(
      { contract_version: 1, mutations: request.mutations.slice(0, midpoint) },
      options
    );
    await sendWithIsolation(
      { contract_version: 1, mutations: request.mutations.slice(midpoint) },
      options
    );
  }
}

function isMutationSemanticFailure(error: unknown) {
  const candidate = accountApiError(error);
  return typeof candidate?.code === 'string' && MUTATION_SEMANTIC_ERROR_CODES.has(candidate.code);
}

export function favoriteSyncFailure(error: unknown): FavoriteSyncFailure {
  if (error && typeof error === 'object') {
    const candidate = error as {
      code?: unknown;
      message?: unknown;
      name?: unknown;
      retryable?: unknown;
    };
    const code =
      typeof candidate.code === 'string' && candidate.code.length > 0
        ? candidate.code
        : typeof candidate.name === 'string' && candidate.name.length > 0
          ? candidate.name
          : 'unknown_error';
    const message =
      typeof candidate.message === 'string' && candidate.message.length > 0
        ? candidate.message
        : 'Relisten could not save this favorite change.';

    return {
      code,
      message,
      // Network and unexpected client failures can be retried safely because
      // mutation UUIDs are idempotency keys. Older servers may still reject a
      // missing catalog UUID, but catalog availability is no longer a terminal
      // favorite-write condition.
      retryable: favoriteSyncErrorIsRetryable(code, candidate.retryable !== false),
    };
  }

  return {
    code: 'unknown_error',
    message: 'Relisten could not save this favorite change.',
    retryable: true,
  };
}

function terminalMutationUuids(error: unknown, request: FavoriteMutationBatchRequest) {
  const problem = accountApiError(error)?.problem;
  if (!problem || typeof problem !== 'object') {
    return new Set<string>();
  }

  const requestedMutationUuids = new Set(
    request.mutations.map((mutation) => mutation.mutation_uuid)
  );
  const requestedFavoriteUuids = new Map(
    request.mutations
      .filter((mutation) => mutation.desired_state === 'favorite')
      .map((mutation) => [mutation.favorite_uuid, mutation.mutation_uuid])
  );
  const rejected = new Set<string>();

  for (const uuid of stringArray(problem.conflicting_mutation_uuids)) {
    if (requestedMutationUuids.has(uuid)) {
      rejected.add(uuid);
    }
  }
  for (const uuid of stringArray(problem.conflicting_favorite_uuids)) {
    const mutationUuid = requestedFavoriteUuids.get(uuid);
    if (mutationUuid) {
      rejected.add(mutationUuid);
    }
  }
  return rejected;
}

function accountApiError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const candidate = error as {
    name?: unknown;
    code?: unknown;
    problem?: Record<string, unknown> | null;
  };
  return candidate.name === 'AccountsApiError' ? candidate : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}
