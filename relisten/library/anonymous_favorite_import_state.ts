export type AnonymousFavoriteImportHookState =
  | 'notApplicable'
  | 'none'
  | 'available'
  | 'deferred'
  | 'importing'
  | 'completed';

type AnonymousFavoriteImportReceiptState = 'deferred' | 'importing' | 'completed';

type AnonymousFavoriteImportStateInput = {
  isAuthenticatedScope: boolean;
  anonymousFavoriteCount: number;
  currentReceiptState?: AnonymousFavoriteImportReceiptState;
};

/** Decides only for the current anonymous snapshot; older decisions must not hide new favorites. */
export function anonymousFavoriteImportState({
  isAuthenticatedScope,
  anonymousFavoriteCount,
  currentReceiptState,
}: AnonymousFavoriteImportStateInput): AnonymousFavoriteImportHookState {
  if (!isAuthenticatedScope) {
    return 'notApplicable';
  }
  if (anonymousFavoriteCount === 0) {
    return 'none';
  }
  if (currentReceiptState) {
    return currentReceiptState;
  }

  return 'available';
}
