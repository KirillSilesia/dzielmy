// Komunikacja z auth-service po REST.
function createAuthClient(authUrl) {
  async function call(path, token) {
    const res = await fetch(`${authUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 401 || res.status === 404) return null;
    if (!res.ok) throw new Error(`auth-service odpowiedział kodem ${res.status}`);
    return res.json();
  }
  return {
    // Czy token jest ważny i czyj jest.
    verify: (token) => call('/verify', token),
    // Dane użytkownika o podanym e-mailu (null, jeśli nie istnieje).
    lookupByEmail: (token, email) => call(`/users/lookup?email=${encodeURIComponent(email)}`, token),
  };
}

module.exports = { createAuthClient };
