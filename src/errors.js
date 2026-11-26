import { EXIT } from "./exit-codes.js";

export class SetupError extends Error {
  constructor(kind, exitCode, message, details = {}) {
    super(message);
    this.name = "SetupError";
    this.kind = kind;
    this.exitCode = exitCode;
    this.details = details;
  }
}

export const usage = (msg, fix) => new SetupError("USAGE", EXIT.USAGE, msg, { fix });
export const unsafe = (msg, fix) => new SetupError("ESCAPE", EXIT.UNSAFE_PATH, msg, { fix });
export const internal = (kind, msg, fix) => new SetupError(kind, EXIT.INTERNAL, msg, { fix });
export const recovery = (kind, msg, fix) => new SetupError(kind, EXIT.RECOVERY, msg, { fix });
export const refusal = (kind, msg, fix) => new SetupError(kind, EXIT.COLLISION, msg, { fix });
