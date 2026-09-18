import { Router, type IRouter, type Request, type Response } from "express";
import { logger } from "../lib/logger";
import {
  beginGoogleCalendarOAuth,
  completeGoogleCalendarOAuth,
  consumeGoogleCalendarOAuthState,
  getGoogleCalendarOAuthStatus,
  isGoogleCalendarAdminStillAuthorized,
  GoogleCalendarOAuthError,
} from "../lib/google-calendar";
import { safelyEqualOAuthState } from "../lib/google-calendar-oauth-crypto";
import { requirePermission } from "../middlewares/auth";

const router: IRouter = Router();
const STATE_COOKIE = "ea_google_calendar_oauth_state";
const CALLBACK_PATH = "/api/calendar/google/callback";

function queryString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readCookie(req: Request, name: string): string | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    return part.slice(separator + 1).trim() || null;
  }
  return null;
}

function setStateCookie(res: Response, state: string): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${STATE_COOKIE}=${state}; Path=${CALLBACK_PATH}; HttpOnly; SameSite=Lax; Max-Age=600${secure}`,
  );
}

function clearStateCookie(res: Response): void {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${STATE_COOKIE}=; Path=${CALLBACK_PATH}; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`,
  );
}

function callbackResult(res: Response, result: string): void {
  res.redirect(303, `/acessos?googleCalendar=${encodeURIComponent(result)}`);
}

router.get(
  "/calendar/google/status",
  requirePermission("rbac:manage"),
  async (_req, res, next): Promise<void> => {
    try {
      res.json(await getGoogleCalendarOAuthStatus());
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/calendar/google/connect",
  requirePermission("rbac:manage"),
  async (req, res): Promise<void> => {
    try {
      const result = await beginGoogleCalendarOAuth(req.auth!.user.id);
      setStateCookie(res, result.state);
      res.json({ authorizationUrl: result.authorizationUrl });
    } catch (error) {
      if (
        error instanceof GoogleCalendarOAuthError &&
        error.code === "configuration_missing"
      ) {
        res.status(503).json({
          error: "A configuração segura do Google Calendar está incompleta.",
        });
        return;
      }
      logger.error(
        { reason: "google_calendar_oauth_start_failed" },
        "Could not start Google Calendar authorization.",
      );
      res.status(503).json({
        error: "Não foi possível iniciar a conexão com o Google Calendar.",
      });
    }
  },
);

router.get("/calendar/google/callback", async (req, res): Promise<void> => {
  const state = queryString(req.query.state);
  const cookieState = readCookie(req, STATE_COOKIE);
  if (!state || !cookieState) {
    clearStateCookie(res);
    callbackResult(res, "error");
    return;
  }

  if (!safelyEqualOAuthState(state, cookieState)) {
    clearStateCookie(res);
    callbackResult(res, "error");
    return;
  }

  let attempt: Awaited<ReturnType<typeof consumeGoogleCalendarOAuthState>>;
  try {
    attempt = await consumeGoogleCalendarOAuthState(state);
  } catch {
    clearStateCookie(res);
    logger.warn(
      { reason: "google_calendar_oauth_state_validation_failed" },
      "Google Calendar OAuth callback state could not be validated.",
    );
    callbackResult(res, "error");
    return;
  }
  clearStateCookie(res);
  if (!attempt) {
    callbackResult(res, "error");
    return;
  }
  if (!(await isGoogleCalendarAdminStillAuthorized(attempt.userId))) {
    callbackResult(res, "error");
    return;
  }

  if (queryString(req.query.error)) {
    callbackResult(res, "cancelled");
    return;
  }
  const code = queryString(req.query.code);
  if (!code) {
    callbackResult(res, "error");
    return;
  }

  try {
    await completeGoogleCalendarOAuth({
      code,
      codeVerifier: attempt.codeVerifier,
      userId: attempt.userId,
    });
    callbackResult(res, "connected");
  } catch (error) {
    const reason =
      error instanceof GoogleCalendarOAuthError
        ? error.code
        : "authorization_failed";
    logger.warn(
      { reason },
      "Google Calendar OAuth authorization did not complete.",
    );
    callbackResult(res, "error");
  }
});

export default router;
