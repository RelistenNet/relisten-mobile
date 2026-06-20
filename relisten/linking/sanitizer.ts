export const REDACTED_QUERY_VALUE = '[redacted]';

export type LinkSearchParamValue = string | string[] | undefined;
export type LinkSearchParams = Record<string, LinkSearchParamValue>;

const EXACT_SENSITIVE_PARAM_NAMES = new Set(['t', 'auth_code', 'code', 'state']);
const TOKEN_LIKE_PARAM_PATTERN = /(token|secret|grant|credential|session)/i;

export function isSensitiveLinkParamName(name: string): boolean {
  const normalized = name.trim().toLowerCase();

  return EXACT_SENSITIVE_PARAM_NAMES.has(normalized) || TOKEN_LIKE_PARAM_PATTERN.test(normalized);
}

export function sanitizeSearchParamsForNavigation(params: LinkSearchParams): LinkSearchParams {
  const sanitized: LinkSearchParams = {};

  for (const [name, value] of Object.entries(params)) {
    if (!isSensitiveLinkParamName(name) && value !== undefined) {
      sanitized[name] = value;
    }
  }

  return sanitized;
}

export function redactSearchParamsForLogging(params: LinkSearchParams): LinkSearchParams {
  const redacted: LinkSearchParams = {};

  for (const [name, value] of Object.entries(params)) {
    if (value === undefined) {
      continue;
    }

    redacted[name] = isSensitiveLinkParamName(name) ? REDACTED_QUERY_VALUE : value;
  }

  return redacted;
}

export function formatSafeRouteForLogging(pathname: string, params: LinkSearchParams): string {
  const redactedParams = redactSearchParamsForLogging(params);
  const searchParams = new URLSearchParams();

  for (const [name, value] of Object.entries(redactedParams)) {
    const values = Array.isArray(value) ? value : [value];

    for (const item of values) {
      if (item !== undefined) {
        searchParams.append(name, item);
      }
    }
  }

  const queryString = searchParams.toString();

  if (!queryString) {
    return pathname;
  }

  return `${pathname}?${queryString}`;
}

export function sanitizeUrlForLogging(url: string): string {
  const parsedUrl = parseUrl(url);

  if (!parsedUrl) {
    return '[invalid-url]';
  }

  for (const name of [...parsedUrl.searchParams.keys()]) {
    if (isSensitiveLinkParamName(name)) {
      parsedUrl.searchParams.set(name, REDACTED_QUERY_VALUE);
    }
  }
  parsedUrl.hash = '';

  if (url.startsWith('/')) {
    return `${parsedUrl.pathname}${parsedUrl.search}`;
  }

  return parsedUrl.toString();
}

function parseUrl(url: string): URL | undefined {
  try {
    return new URL(url);
  } catch {
    try {
      return new URL(url, 'relisten://app');
    } catch {
      return undefined;
    }
  }
}
