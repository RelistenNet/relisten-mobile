import * as FileSystem from 'expo-file-system';
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
    offlineTracksBySource: Record<string, Array<{
      track_uuid: string;
      artist_uuid: string;
      show_uuid: string;
      source_uuid: string;
      created_at: string;
      state: number;
      file_size: number;
    }>>;
    schemaVersion: number;
  };
  isEmpty: boolean;
}

export class LegacyApiClient {
  static API_BASE = 'https://relisten.net/api';

  async uploadRealmDatabase(databaseFilePath: string): Promise<LegacyUpgradeResponse> {
    const uploadUrl = `${LegacyApiClient.API_BASE}/realm/upgrade`;
    
    logger.info(`[legacy-api] POST ${uploadUrl}`);
    
    try {
      const uploadResult = await FileSystem.uploadAsync(uploadUrl, databaseFilePath, {
        fieldName: 'database',
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      });

      if (uploadResult.status !== 200) {
        throw new Error(`Upload failed with status ${uploadResult.status}: ${uploadResult.body}`);
      }

      return JSON.parse(uploadResult.body) as LegacyUpgradeResponse;
    } catch (error) {
      logger.error(`Failed to upload database: ${error}`);
      throw error;
    }
  }
}