import { randomBytes } from "crypto";

/** Generates a prefixed id like "usr-lq3a8f1b2c". */
export function createId(prefix: string): string {
  const time = Date.now().toString(36);
  const rand = randomBytes(4).toString("hex");
  return `${prefix}-${time}${rand}`;
}
