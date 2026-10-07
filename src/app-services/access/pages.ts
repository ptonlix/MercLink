import { selectAuthorizationPage, type AuthorizationPage } from "../../domain/access/scopes";

export function authorizationPageFor(scopes: readonly string[]): AuthorizationPage | "invalid" {
  return selectAuthorizationPage(scopes);
}
