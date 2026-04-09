const ID3_HEADER_BYTES = 10;
const MPEG_SYNC_SEARCH_LIMIT = 256 * 1024;

export function normalizeByteArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((byte) => Number(byte) & 0xff);
  }

  if (typeof value === 'string') {
    return Array.from(value, (char) => char.charCodeAt(0) & 0xff);
  }

  return [];
}

function readSynchsafeInt(bytes: number[], offset: number) {
  if (offset + 4 > bytes.length) {
    return;
  }

  const values = bytes.slice(offset, offset + 4);

  if (values.some((byte) => (byte & 0x80) !== 0)) {
    return;
  }

  return (values[0] << 21) | (values[1] << 14) | (values[2] << 7) | values[3];
}

function id3DataStartOffset(bytes: number[]) {
  if (
    bytes.length < ID3_HEADER_BYTES ||
    bytes[0] !== 'I'.charCodeAt(0) ||
    bytes[1] !== 'D'.charCodeAt(0) ||
    bytes[2] !== '3'.charCodeAt(0)
  ) {
    return 0;
  }

  const tagSize = readSynchsafeInt(bytes, 6);
  return tagSize === undefined ? 0 : ID3_HEADER_BYTES + tagSize;
}

function isLikelyMpegAudioHeader(bytes: number[], offset: number) {
  if (offset + 4 > bytes.length) {
    return false;
  }

  const byte1 = bytes[offset + 1];
  const byte2 = bytes[offset + 2];
  const versionBits = (byte1 >> 3) & 0x3;
  const layerBits = (byte1 >> 1) & 0x3;
  const sampleRateIndex = (byte2 >> 2) & 0x3;
  const bitrateIndex = (byte2 >> 4) & 0xf;

  return (
    bytes[offset] === 0xff &&
    (byte1 & 0xe0) === 0xe0 &&
    versionBits !== 0b01 &&
    layerBits !== 0 &&
    bitrateIndex !== 15 &&
    sampleRateIndex !== 0b11
  );
}

interface Mp3PrefixProbeOptions {
  prefixIsTruncated?: boolean;
}

export function mp3PrefixProbe(bytes: number[], options: Mp3PrefixProbeOptions = {}) {
  const searchStartOffset = id3DataStartOffset(bytes);

  if (searchStartOffset + 4 > bytes.length) {
    return searchStartOffset > 0 ? 'id3TagExtendsPastProbe' : 'missingPrefix';
  }

  const searchEndOffset = Math.min(bytes.length - 4, searchStartOffset + MPEG_SYNC_SEARCH_LIMIT);

  for (let offset = searchStartOffset; offset <= searchEndOffset; offset++) {
    if (isLikelyMpegAudioHeader(bytes, offset)) {
      return searchStartOffset > 0 ? 'id3AndMpegHeader' : 'mpegHeader';
    }
  }

  if (searchStartOffset > 0 && options.prefixIsTruncated && searchEndOffset === bytes.length - 4) {
    return 'id3SearchExtendsPastProbe';
  }

  return searchStartOffset > 0 ? 'id3WithoutMpegHeader' : 'mpegHeaderMissing';
}

export function isPassingMp3PrefixProbe(prefixProbe: string) {
  return (
    prefixProbe === 'mpegHeader' ||
    prefixProbe === 'id3AndMpegHeader' ||
    prefixProbe === 'id3TagExtendsPastProbe' ||
    prefixProbe === 'id3SearchExtendsPastProbe'
  );
}
