import { createUuidV7, isUuidV7 } from '@/relisten/util/uuid_v7';
import {
  readSecureJson,
  SecureStorageTemporarilyUnavailableError,
  writeSecureJson,
} from './secure_storage';

const INSTALLATION_ID_STORAGE_KEY = 'relisten.installation.v1';

export type InstallationIdResult =
  | { state: 'available'; installationUuid: string }
  | { state: 'temporarilyUnavailable' };

interface StoredInstallationId {
  version: 1;
  installationUuid: string;
}

let loadPromise: Promise<InstallationIdResult> | null = null;

async function loadOrCreateInstallationId(): Promise<InstallationIdResult> {
  const stored = await readSecureJson<StoredInstallationId>(INSTALLATION_ID_STORAGE_KEY);

  if (stored.state === 'temporarilyUnavailable') {
    return stored;
  }

  if (
    stored.state === 'available' &&
    stored.value.version === 1 &&
    isUuidV7(stored.value.installationUuid)
  ) {
    return { state: 'available', installationUuid: stored.value.installationUuid };
  }

  const installationUuid = createUuidV7();
  await writeSecureJson(INSTALLATION_ID_STORAGE_KEY, { version: 1, installationUuid });
  return { state: 'available', installationUuid };
}

export function getInstallationId(): Promise<InstallationIdResult> {
  if (!loadPromise) {
    loadPromise = loadOrCreateInstallationId().finally(() => {
      loadPromise = null;
    });
  }

  return loadPromise;
}

export async function requireInstallationUuid(): Promise<string> {
  const result = await getInstallationId();

  if (result.state === 'temporarilyUnavailable') {
    throw new SecureStorageTemporarilyUnavailableError();
  }

  return result.installationUuid;
}
