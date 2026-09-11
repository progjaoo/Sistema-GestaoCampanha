import { ReplitConnectors } from "@replit/connectors-sdk";

const connectors = new ReplitConnectors();

type CalendarRequestInit = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
};

export function googleCalendarRequest(
  path: string,
  init?: CalendarRequestInit,
): Promise<Response> {
  return connectors.proxy("google-calendar", path, init);
}