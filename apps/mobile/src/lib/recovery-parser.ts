export function parseRecoveryTokens(
  url: string,
): { accessToken: string; refreshToken: string } | null {
  const fragment = url.includes('#')
    ? url.slice(url.indexOf('#') + 1)
    : (url.split('?')[1] ?? '');
  const params = new URLSearchParams(fragment);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (params.get('type') !== 'recovery' || !accessToken || !refreshToken) return null;
  return { accessToken, refreshToken };
}
