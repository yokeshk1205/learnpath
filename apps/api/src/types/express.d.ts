import type { AccessPrincipal } from "../auth/types.js";

declare global {
  namespace Express {
    interface Request {
      auth?: AccessPrincipal;
    }
  }
}

export {};

