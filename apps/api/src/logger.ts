import pino from "pino";

import { config } from "./config.js";

export const logger = pino({
  level: config.nodeEnvironment === "test" ? "silent" : "info",
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers.set-cookie",
      "res.headers['set-cookie']",
    ],
    censor: "[REDACTED]",
  },
});
