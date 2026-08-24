type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

export class AuthenticationExpiredError extends Error {
  readonly code = 'AUTHENTICATION_EXPIRED';

  constructor() {
    super('AUTHENTICATION_EXPIRED');
    this.name = 'AuthenticationExpiredError';
  }
}

function requestUrl(input: RequestInfo | URL): URL | null {
  const raw = typeof Request !== 'undefined' && input instanceof Request
    ? input.url
    : String(input);

  try {
    return new URL(raw, 'http://autoerp.local');
  } catch {
    return null;
  }
}

export function isProtectedApiRequest(input: RequestInfo | URL): boolean {
  const url = requestUrl(input);
  return Boolean(
    url
    && url.pathname.startsWith('/api/')
    && !url.pathname.startsWith('/api/auth/')
  );
}

export function isAuthenticationExpiredError(
  error: unknown
): error is AuthenticationExpiredError {
  return error instanceof AuthenticationExpiredError
    || (
      Boolean(error)
      && typeof error === 'object'
      && (error as { code?: unknown }).code === 'AUTHENTICATION_EXPIRED'
    );
}

/**
 * Converts the first authoritative 401 from a protected API into a single
 * authentication-expired signal. The rejected request is never retried.
 */
export function createSessionAwareFetch(
  fetchImpl: FetchLike,
  onAuthenticationExpired: () => void
): FetchLike {
  let invalidated = false;

  return async (input, init) => {
    const response = await fetchImpl(input, init);
    if (response.status !== 401 || !isProtectedApiRequest(input)) {
      return response;
    }

    if (!invalidated) {
      invalidated = true;
      onAuthenticationExpired();
    }

    throw new AuthenticationExpiredError();
  };
}
