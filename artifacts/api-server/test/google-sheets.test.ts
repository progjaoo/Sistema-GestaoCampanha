import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { afterEach, test } from "node:test";
import {
  getConfiguredSpreadsheetId,
  googleSheetsRequest,
  parseSpreadsheetId,
  resetGoogleSheetsForTests,
} from "../src/lib/google-sheets";

const originalFetch = globalThis.fetch;
const originalNodeEnv = process.env.NODE_ENV;
const originalSpreadsheetUrl = process.env.GOOGLE_SHEETS_SPREADSHEET_URL;
const originalSpreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
const originalServiceAccount = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

function createServiceAccountJson(): string {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  return JSON.stringify({
    client_email: "sheets-reader@example.iam.gserviceaccount.com",
    private_key: privateKey,
    token_uri: "https://oauth2.googleapis.com/token",
  });
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  process.env.NODE_ENV = originalNodeEnv;
  process.env.GOOGLE_SHEETS_SPREADSHEET_URL = originalSpreadsheetUrl;
  process.env.GOOGLE_SHEETS_SPREADSHEET_ID = originalSpreadsheetId;
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON = originalServiceAccount;
  resetGoogleSheetsForTests();
});

test("extrai o ID tanto de URL quanto de identificador puro", () => {
  const id = "1kiOXmyCeTEWqZLhWQFfCXP8khl3F-72TNPHWlub00BI";
  assert.equal(parseSpreadsheetId(id), id);
  assert.equal(
    parseSpreadsheetId(
      `https://docs.google.com/spreadsheets/d/${id}/edit#gid=0`,
    ),
    id,
  );
  assert.equal(parseSpreadsheetId("https://example.com/not-a-sheet"), null);
  assert.equal(parseSpreadsheetId(undefined), null);
});

test("prioriza a URL configurada e falha quando a planilha não está definida", () => {
  const id = "1kiOXmyCeTEWqZLhWQFfCXP8khl3F-72TNPHWlub00BI";
  process.env.GOOGLE_SHEETS_SPREADSHEET_URL = `https://docs.google.com/spreadsheets/d/${id}/edit`;
  process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "another-id";
  assert.equal(getConfiguredSpreadsheetId(), id);

  delete process.env.GOOGLE_SHEETS_SPREADSHEET_URL;
  delete process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  process.env.NODE_ENV = "production";
  assert.throws(
    () => getConfiguredSpreadsheetId(),
    /GOOGLE_SHEETS_SPREADSHEET_URL/,
  );
});

test("usa conta de serviço, obtém token OAuth e faz somente GET na API Sheets", async () => {
  const id = "1kiOXmyCeTEWqZLhWQFfCXP8khl3F-72TNPHWlub00BI";
  process.env.NODE_ENV = "production";
  process.env.GOOGLE_SHEETS_SPREADSHEET_URL = `https://docs.google.com/spreadsheets/d/${id}`;
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON = createServiceAccountJson();

  const calls: Array<{ url: string; method: string }> = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ url, method });
    if (url === "https://oauth2.googleapis.com/token") {
      return Response.json({
        access_token: "test-access-token",
        expires_in: 3600,
      });
    }
    return Response.json({ ok: true });
  };

  const response = await googleSheetsRequest(`/v4/spreadsheets/${id}`);
  assert.equal(response.status, 200);
  assert.deepEqual(
    calls.map(({ url, method }) => ({ url, method })),
    [
      { url: "https://oauth2.googleapis.com/token", method: "POST" },
      {
        url: `https://sheets.googleapis.com/v4/spreadsheets/${id}`,
        method: "GET",
      },
    ],
  );
});

test("não usa o conector Replit em produção quando a conta de serviço está ausente", async () => {
  process.env.NODE_ENV = "production";
  process.env.GOOGLE_SHEETS_SPREADSHEET_ID = "spreadsheet-id";
  delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  await assert.rejects(
    googleSheetsRequest("/v4/spreadsheets/spreadsheet-id"),
    /GOOGLE_SERVICE_ACCOUNT_JSON/,
  );
});
