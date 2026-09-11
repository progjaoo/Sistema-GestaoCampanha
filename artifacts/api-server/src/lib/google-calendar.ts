import { ReplitConnectors } from "@replit/connectors-sdk";

const connectors = new ReplitConnectors();

type CalendarRequestInit = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
};

type GoogleCalendarRequest = (
  path: string,
  init?: CalendarRequestInit,
) => Promise<Response>;

const defaultGoogleCalendarRequest: GoogleCalendarRequest = (path, init) =>
  connectors.proxy("google-calendar", path, init);

let requestGoogleCalendar: GoogleCalendarRequest = defaultGoogleCalendarRequest;

export function googleCalendarRequest(
  path: string,
  init?: CalendarRequestInit,
): Promise<Response> {
  return requestGoogleCalendar(path, init);
}

export function setGoogleCalendarRequestForTests(
  request: GoogleCalendarRequest | null,
): void {
  requestGoogleCalendar = request ?? defaultGoogleCalendarRequest;
}