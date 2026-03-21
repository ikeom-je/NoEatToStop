const COGNITO_DOMAIN = import.meta.env.VITE_COGNITO_DOMAIN;
const CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID;
const REDIRECT_URI = import.meta.env.VITE_COGNITO_REDIRECT_URI;
const LOGOUT_URI = import.meta.env.VITE_COGNITO_LOGOUT_URI;

function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64UrlEncode(array);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(new Uint8Array(digest));
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function redirectToLogin(): Promise<void> {
  const codeVerifier = generateCodeVerifier();
  sessionStorage.setItem('pkce_code_verifier', codeVerifier);
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: 'openid email profile',
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
  });

  window.location.href = `https://${COGNITO_DOMAIN}/oauth2/authorize?${params}`;
}

export async function handleCallback(code: string): Promise<void> {
  const codeVerifier = sessionStorage.getItem('pkce_code_verifier');
  if (!codeVerifier) {
    throw new Error('PKCE code_verifier が見つかりません');
  }

  const response = await fetch(`https://${COGNITO_DOMAIN}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    throw new Error('トークン交換に失敗しました');
  }

  const tokens = await response.json();
  localStorage.setItem('access_token', tokens.access_token);
  localStorage.setItem('id_token', tokens.id_token);
  localStorage.setItem('refresh_token', tokens.refresh_token);
  sessionStorage.removeItem('pkce_code_verifier');
}

export async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = localStorage.getItem('refresh_token');
  if (!refreshToken) return false;

  try {
    const response = await fetch(`https://${COGNITO_DOMAIN}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: CLIENT_ID,
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) return false;

    const tokens = await response.json();
    localStorage.setItem('access_token', tokens.access_token);
    localStorage.setItem('id_token', tokens.id_token);
    return true;
  } catch {
    return false;
  }
}

export function getAccessToken(): string | null {
  const token = localStorage.getItem('access_token');
  if (!token) return null;

  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    if (payload.exp * 1000 < Date.now()) return null;
    return token;
  } catch {
    return null;
  }
}

export function isAuthenticated(): boolean {
  return getAccessToken() !== null;
}

export function getUserEmail(): string | null {
  const idToken = localStorage.getItem('id_token');
  if (!idToken) return null;

  try {
    const payload = JSON.parse(atob(idToken.split('.')[1]));
    return payload.email || null;
  } catch {
    return null;
  }
}

export function logout(): void {
  localStorage.removeItem('access_token');
  localStorage.removeItem('id_token');
  localStorage.removeItem('refresh_token');

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    logout_uri: LOGOUT_URI,
  });

  window.location.href = `https://${COGNITO_DOMAIN}/logout?${params}`;
}
