export function apiKeyAllowed(input: { loggedIn: boolean; authorizationPage: boolean }): boolean {
  return input.loggedIn && !input.authorizationPage;
}

export const apiKeyPrefix = "key_";

export function isApiKeyToken(token: string): boolean {
  return token.startsWith(apiKeyPrefix);
}
