import { File } from 'expo-file-system';
import { log } from '../util/logging';

const logger = log.extend('legacy-network');

export interface LegacyUpgradeResponse {
  success: boolean;
  data: {
    trackUuids: string[];
    showUuids: string[];
    sources: Array<{
      uuid: string;
      created_at: string;
      artist_uuid: string;
      show_uuid: string;
      show_date: string;
    }>;
    artistUuids: string[];
    offlineTracksBySource: Record<
      string,
      Array<{
        track_uuid: string;
        artist_uuid: string;
        show_uuid: string;
        source_uuid: string;
        created_at: string;
        state: number;
        file_size: number;
      }>
    >;
    schemaVersion: number;
  };
  isEmpty: boolean;
}

export class LegacyApiClient {
  static API_BASE = 'https://realm-migrator.relisten.net';

  async uploadRealmDatabase(databaseFilePath: string): Promise<LegacyUpgradeResponse> {
    const uploadUrl = `${LegacyApiClient.API_BASE}/migrate`;

    logger.info(`POST ${uploadUrl}`);

    try {
      const databaseFile = new File(databaseFilePath);
      const formData = new FormData();
      formData.append('database', databaseFile, databaseFile.name);

      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Upload failed with status ${response.status}: ${body}`);
      }

      return (await response.json()) as LegacyUpgradeResponse;
    } catch (error) {
      logger.error(`Failed to upload database: ${error}`);
      throw error;
    }
  }
}
