export type FetchSafeOptions = RequestInit & {
  timeoutMs?: number;
  maxSizeBytes?: number;
};

export class TimeoutError extends Error {
  constructor(url: string, ms: number) {
    super(`Request timed out after ${ms}ms: ${url}`);
    this.name = 'TimeoutError';
  }
}

export class PayloadTooLargeError extends Error {
  constructor(url: string, maxBytes: number) {
    super(`Response exceeded ${maxBytes} bytes: ${url}`);
    this.name = 'PayloadTooLargeError';
  }
}

export class AuthError extends Error {
  constructor(platform: string, status: number) {
    super(`${platform} auth failed (${status}) — token may be expired or invalid`);
    this.name = 'AuthError';
  }
}

export async function fetchSafe(
  url: string,
  platform: string,
  options: FetchSafeOptions = {}
): Promise<Response> {
  const {
    timeoutMs = 10_000,
    maxSizeBytes = 5 * 1024 * 1024,
    ...fetchOptions
  } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;

  try {
    res = await fetch(url, { ...fetchOptions, signal: controller.signal });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new TimeoutError(url, timeoutMs);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 || res.status === 403) {
    throw new AuthError(platform, res.status);
  }

  const contentLength = res.headers.get('content-length');
  if (contentLength && parseInt(contentLength) > maxSizeBytes) {
    throw new PayloadTooLargeError(url, maxSizeBytes);
  }

  return res;
}