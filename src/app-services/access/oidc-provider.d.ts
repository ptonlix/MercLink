declare module "oidc-provider" {
  import type { IncomingMessage, ServerResponse } from "node:http";

  export type AccessTokenRecord = {
    accountId?: string;
    grantId?: string;
    scope?: string;
    exp?: number;
    iat?: number;
  };

  export default class Provider {
    constructor(issuer: string, configuration: Record<string, unknown>);
    issuer: string;
    callback(): (req: IncomingMessage, res: ServerResponse) => void;
    interactionResult(
      req: object,
      res: object,
      result: {
        login: { accountId: string };
        consent: { grantId: string };
      },
    ): Promise<string>;
    interactionDetails(
      req: object,
      res: object,
    ): Promise<{ params?: { scope?: unknown } }>;
    Grant: {
      new (input: { accountId: string; clientId: string }): {
        addOIDCScope(scope: string): void;
        save(): Promise<string>;
      };
    };
    AccessToken: {
      find(id: string): Promise<AccessTokenRecord | undefined>;
    };
  }
}
