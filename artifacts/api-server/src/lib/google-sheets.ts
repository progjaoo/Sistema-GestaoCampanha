import { ReplitConnectors } from "@replit/connectors-sdk";

const connectors = new ReplitConnectors();

export const CAMPAIGN_SPREADSHEET_ID =
  process.env.GOOGLE_SHEETS_SPREADSHEET_ID ??
  "1kiOXmyCeTEWqZLhWQFfCXP8khl3F-72TNPHWlub00BI";

export async function googleSheetsRequest(path: string): Promise<Response> {
  return connectors.proxy("google-sheet", path, { method: "GET" });
}