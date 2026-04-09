import { log } from '@/relisten/util/logging';
import ReactNativeBlobUtil, {
  FetchBlobResponse,
  ReactNativeBlobUtilResponseInfo,
} from 'react-native-blob-util';
import {
  isPassingMp3PrefixProbe,
  mp3PrefixProbe,
  normalizeByteArray,
} from '@/relisten/offline/mp3_prefix_probe';

const logger = log.extend('offline');

const MIN_REASONABLE_MP3_DOWNLOAD_BYTES = 4 * 1024;
const MP3_PREFIX_SNIFF_BYTES = 512 * 1024;

export type DownloadMd5Status = 'missing' | 'matched' | 'mismatched' | 'hashError';

export interface DownloadValidationResult {
  downloadedBytes: number;
  contentLength?: number;
  contentType?: string;
  httpStatus?: number;
  prefixProbe: string;
}

export class OfflineDownloadValidationError extends Error {
  name = 'OfflineDownloadValidationError';

  constructor(
    readonly reason: string,
    message: string,
    readonly details: Record<string, string | number | undefined> = {}
  ) {
    super(message);
  }
}

export function stringifyDownloadError(error: unknown) {
  if (error instanceof OfflineDownloadValidationError) {
    return JSON.stringify({
      name: error.name,
      reason: error.reason,
      message: error.message,
      ...error.details,
    });
  }

  if (error instanceof Error) {
    return JSON.stringify({
      name: error.name,
      message: error.message,
    });
  }

  return JSON.stringify(error);
}

function responseHeader(responseInfo: ReactNativeBlobUtilResponseInfo, headerName: string) {
  const headers = responseInfo.headers ?? {};
  const normalizedHeaderName = headerName.toLowerCase();

  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== normalizedHeaderName || value === undefined || value === null) {
      continue;
    }

    return Array.isArray(value) ? String(value[0]) : String(value);
  }
}

function responseContentLength(responseInfo: ReactNativeBlobUtilResponseInfo) {
  const rawContentLength = responseHeader(responseInfo, 'content-length');
  const contentLength = rawContentLength !== undefined ? Number(rawContentLength) : undefined;

  return Number.isFinite(contentLength) && contentLength !== undefined && contentLength >= 0
    ? contentLength
    : undefined;
}

function responseContentRangeIsComplete(responseInfo: ReactNativeBlobUtilResponseInfo) {
  const rawContentRange = responseHeader(responseInfo, 'content-range');
  const match = rawContentRange?.match(/^bytes\s+(\d+)-(\d+)\/(\d+)$/i);

  if (!match) {
    return false;
  }

  const start = Number(match[1]);
  const endInclusive = Number(match[2]);
  const total = Number(match[3]);

  return start === 0 && endInclusive + 1 === total;
}

async function sniffMp3Prefix(path: string, downloadedBytes: number) {
  const prefixPath = `${path}.prefix`;
  const prefixBytes = Math.min(downloadedBytes, MP3_PREFIX_SNIFF_BYTES);

  try {
    if (await ReactNativeBlobUtil.fs.exists(prefixPath)) {
      await ReactNativeBlobUtil.fs.unlink(prefixPath);
    }

    await ReactNativeBlobUtil.fs.slice(path, prefixPath, 0, prefixBytes);
    const rawPrefix = await ReactNativeBlobUtil.fs.readFile(prefixPath, 'ascii');
    return mp3PrefixProbe(normalizeByteArray(rawPrefix), {
      prefixIsTruncated: prefixBytes < downloadedBytes,
    });
  } finally {
    try {
      if (await ReactNativeBlobUtil.fs.exists(prefixPath)) {
        await ReactNativeBlobUtil.fs.unlink(prefixPath);
      }
    } catch {
      /* empty */
    }
  }
}

export async function validateCompletedDownloadResponse(
  response: FetchBlobResponse,
  path: string
): Promise<DownloadValidationResult> {
  const responseInfo = response.info();
  const httpStatus = responseInfo.status;
  const contentLength = responseContentLength(responseInfo);
  const contentType = responseHeader(responseInfo, 'content-type');

  if (!Number.isFinite(httpStatus) || (httpStatus !== 200 && httpStatus !== 206)) {
    throw new OfflineDownloadValidationError(
      'httpStatus',
      `Downloaded audio request failed with HTTP ${httpStatus}`,
      { httpStatus, contentType, contentLength }
    );
  }

  if (httpStatus === 206 && !responseContentRangeIsComplete(responseInfo)) {
    throw new OfflineDownloadValidationError(
      'partialContent',
      'Downloaded audio response only contained a partial byte range',
      { httpStatus, contentType, contentLength }
    );
  }

  const stat = await ReactNativeBlobUtil.fs.stat(path);
  const downloadedBytes = Math.floor(stat.size);

  if (downloadedBytes <= 0) {
    throw new OfflineDownloadValidationError('emptyFile', 'Downloaded audio file is empty', {
      httpStatus,
      contentType,
      contentLength,
      downloadedBytes,
    });
  }

  if (contentLength !== undefined && downloadedBytes !== contentLength) {
    throw new OfflineDownloadValidationError(
      'contentLengthMismatch',
      `Downloaded audio byte count ${downloadedBytes} did not match Content-Length ${contentLength}`,
      { httpStatus, contentType, contentLength, downloadedBytes }
    );
  }

  if (downloadedBytes < MIN_REASONABLE_MP3_DOWNLOAD_BYTES) {
    throw new OfflineDownloadValidationError(
      'tooSmall',
      `Downloaded audio file is too small: ${downloadedBytes} bytes`,
      { httpStatus, contentType, contentLength, downloadedBytes }
    );
  }

  const prefixProbe = await sniffMp3Prefix(path, downloadedBytes);

  if (!isPassingMp3PrefixProbe(prefixProbe)) {
    throw new OfflineDownloadValidationError(
      'invalidMp3Prefix',
      `Downloaded audio prefix is not an MP3: ${prefixProbe}`,
      { httpStatus, contentType, contentLength, downloadedBytes, prefixProbe }
    );
  }

  return {
    downloadedBytes,
    contentLength,
    contentType,
    httpStatus,
    prefixProbe,
  };
}

export async function checkExpectedDownloadMd5(
  expectedMd5: string | undefined,
  path: string,
  sourceTrackUuid: string
): Promise<DownloadMd5Status> {
  if (!expectedMd5) {
    return 'missing';
  }

  try {
    const actualMd5 = await ReactNativeBlobUtil.fs.hash(path, 'md5');
    const md5Status =
      actualMd5.toLowerCase() === expectedMd5.toLowerCase() ? 'matched' : 'mismatched';

    if (md5Status === 'mismatched') {
      logger.warn(`Downloaded MP3 md5 mismatch; sourceTrack.uuid=${sourceTrackUuid}`);
    }

    return md5Status;
  } catch (error) {
    logger.warn(`Could not hash downloaded MP3; sourceTrack.uuid=${sourceTrackUuid}`, error);
    return 'hashError';
  }
}
