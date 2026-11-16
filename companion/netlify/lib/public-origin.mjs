// Explicit canonical origin avoids reflecting an untrusted Host header in OAuth.
export function publicOrigin() {
  const value = process.env.COMPANION_PUBLIC_URL || process.env.URL;
  if (!value) throw new Error('COMPANION_PUBLIC_URL is required.');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('COMPANION_PUBLIC_URL must be an HTTPS origin.');
  return url.origin;
}
