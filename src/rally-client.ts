export const RALLY_BASE_URL = 'https://rally1.rallydev.com/slm/webservice/v2.0';

const API_KEY = process.env.RALLY_API_KEY!;
export const WORKSPACE_REF = process.env.RALLY_WORKSPACE_REF!;
export const PROJECT_REF = process.env.RALLY_PROJECT_REF!;

const headers = (): Record<string, string> => ({
  'ZSESSIONID': API_KEY,
  'Content-Type': 'application/json',
});

export async function rallyGet(path: string, params: Record<string, string>): Promise<any> {
  // Build query string manually — URLSearchParams encodes slashes and commas
  // which breaks Rally's workspace and fetch parameters
  const queryString = Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&')
    .replace(/%2F/gi, '/')
    .replace(/%2C/gi, ',');
  const url = queryString
    ? `${RALLY_BASE_URL}${path}?${queryString}`
    : `${RALLY_BASE_URL}${path}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: headers(),
  });

  if (!res.ok) {
    throw new Error(`Rally API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

export async function rallyPost(path: string, body: Record<string, any>): Promise<any> {
  const url = `${RALLY_BASE_URL}${path}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Rally API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

/**
 * Retry a Rally write operation on concurrency errors.
 * Rally uses optimistic concurrency — when a parent artifact is modified by
 * a prior write, subsequent writes to the same parent can fail with a
 * "ConcurrencyConflict" or version-mismatch error.  This wrapper retries
 * with exponential back-off (up to 3 attempts by default).
 */
const CONCURRENCY_PATTERNS = [
  /concurrency/i,
  /version/i,
  /could not convert/i,
  /modified since last read/i,
];

function isConcurrencyError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return CONCURRENCY_PATTERNS.some((re) => re.test(msg));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  { retries = 3, baseDelayMs = 300 } = {},
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < retries - 1 && isConcurrencyError(err)) {
        const delay = baseDelayMs * 2 ** attempt;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastErr; // unreachable, but satisfies TS
}

export async function rallyPut(path: string, body: Record<string, any>): Promise<any> {
  const url = `${RALLY_BASE_URL}${path}`;

  const res = await fetch(url, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Rally API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

export async function rallyDelete(path: string): Promise<any> {
  const url = `${RALLY_BASE_URL}${path}`;

  const res = await fetch(url, {
    method: 'DELETE',
    headers: headers(),
  });

  if (!res.ok) {
    throw new Error(`Rally API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}
