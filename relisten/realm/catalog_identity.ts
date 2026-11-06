import type { CatalogReferenceResolution } from '@/relisten/api/catalog/resolve';
import { retainShortCatalogId } from '@/relisten/api/catalog/identity';
import Realm from 'realm';
import { CatalogRedirect } from './models/catalog';
export { CatalogRedirect } from './models/catalog';

type CanonicalKind = 'song' | 'venue';

/** Catalog identity is independent of account membership and saved favorite targets. */
export class CatalogIdentity {
  private readonly targets: Map<string, string>;

  constructor(redirects: Iterable<Pick<CatalogRedirect, 'id' | 'targetId'>>) {
    this.targets = new Map(Array.from(redirects, (redirect) => [redirect.id, redirect.targetId]));
    for (const id of this.targets.keys()) this.resolve(id);
  }

  resolve(id: string): string {
    const visited = new Set<string>();
    while (this.targets.has(id)) {
      if (visited.has(id)) throw new Error('Catalog redirects contain a cycle.');
      visited.add(id);
      id = this.targets.get(id)!;
    }
    return id;
  }
}

function saveRedirects(
  realm: Realm,
  redirects: { kind: CanonicalKind; id: string; targetId: string }[]
) {
  const next = new Map(Array.from(realm.objects(CatalogRedirect), (row) => [row.id, row.targetId]));
  for (const redirect of redirects) {
    retainShortCatalogId(redirect.id, redirect.kind);
    retainShortCatalogId(redirect.targetId, redirect.kind);
    if (redirect.id !== redirect.targetId) next.set(redirect.id, redirect.targetId);
  }
  // Validate the whole proposed chain before publishing any part of it.
  new CatalogIdentity(Array.from(next, ([id, targetId]) => ({ id, targetId })));
  for (const redirect of redirects) {
    if (redirect.id === redirect.targetId) continue;
    realm.create(
      CatalogRedirect,
      { id: redirect.id, targetId: redirect.targetId },
      Realm.UpdateMode.Modified
    );
  }
}

/** Called inside the same transaction that applies a canonical detail response. */
export function applyCatalogRedirect(
  realm: Realm,
  kind: CanonicalKind,
  requestedId: string,
  returnedId: string
) {
  if (requestedId !== returnedId)
    saveRedirects(realm, [{ kind, id: requestedId, targetId: returnedId }]);
}

export function applyCatalogResolutions(realm: Realm, references: CatalogReferenceResolution[]) {
  const redirects: { kind: CanonicalKind; id: string; targetId: string }[] = [];
  for (const reference of references) {
    if (reference.availability !== 'redirected') continue;
    if (reference.kind !== 'song' && reference.kind !== 'venue')
      throw new Error('An imported catalog reference cannot redirect.');
    if (reference.target?.kind !== reference.kind)
      throw new Error('Catalog redirect changed target kind.');
    redirects.push({ kind: reference.kind, id: reference.id, targetId: reference.target.id });
  }
  saveRedirects(realm, redirects);
}
