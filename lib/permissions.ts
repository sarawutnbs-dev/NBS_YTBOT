import type { AppSession } from "./auth";

export type { AppSession };

type Predicate = (session: AppSession | null) => boolean;

export const isAdmin: Predicate = session => session?.user?.role === "ADMIN";
export const isAllowedUser: Predicate = session => Boolean(session?.user?.allowed);

export function assert(predicate: Predicate, session: AppSession | null, message: string) {
  if (!predicate(session)) {
    const error = new Error(message);
    error.name = "PermissionError";
    throw error;
  }
}
