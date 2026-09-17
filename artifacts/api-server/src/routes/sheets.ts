import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import { db, leadershipsTable } from "@workspace/db";
import { requirePermission } from "../middlewares/auth";
import {
  getConfiguredSpreadsheetId,
  googleSheetsRequest,
} from "../lib/google-sheets";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function encodePathPart(value: string): string {
  return encodeURIComponent(value).replace(/%2F/g, "%2F");
}

router.get(
  "/sheets/campaign",
  requirePermission("sheets:view"),
  async (req, res): Promise<void> => {
    try {
      const spreadsheetId = getConfiguredSpreadsheetId();
      const requestedTab =
        typeof req.query.tab === "string" ? req.query.tab.trim() : "";
      const metadataResponse = await googleSheetsRequest(
        `/v4/spreadsheets/${encodePathPart(spreadsheetId)}?fields=properties.title,spreadsheetUrl,sheets.properties`,
      );
      if (!metadataResponse.ok) {
        res
          .status(502)
          .json({
            error: "Não foi possível consultar a planilha da campanha.",
          });
        return;
      }
      const metadata = (await metadataResponse.json()) as {
        properties?: { title?: string };
        spreadsheetUrl?: string;
        sheets?: Array<{
          properties?: { title?: string; sheetId?: number; index?: number };
        }>;
      };
      const tabs = (metadata.sheets ?? [])
        .map((sheet) => sheet.properties)
        .filter(
          (
            sheet,
          ): sheet is { title: string; sheetId?: number; index?: number } =>
            Boolean(sheet?.title),
        );
      const tab = tabs.find((item) => item.title === requestedTab) ?? tabs[0];
      if (!tab) {
        res.json({
          title: metadata.properties?.title ?? "Campanha EA 2026",
          spreadsheetUrl: metadata.spreadsheetUrl ?? null,
          tabs: [],
          selectedTab: null,
          headers: [],
          rows: [],
          matches: [],
        });
        return;
      }

      const valuesResponse = await googleSheetsRequest(
        `/v4/spreadsheets/${encodePathPart(spreadsheetId)}/values/${encodePathPart(`'${tab.title}'`)}`,
      );
      if (!valuesResponse.ok) {
        res
          .status(502)
          .json({
            error:
              "A planilha foi localizada, mas não foi possível ler a aba selecionada.",
          });
        return;
      }
      const valuesBody = (await valuesResponse.json()) as {
        values?: unknown[][];
      };
      const values = Array.isArray(valuesBody.values) ? valuesBody.values : [];
      const columnCount = values.reduce(
        (largest, row) =>
          Math.max(largest, Array.isArray(row) ? row.length : 0),
        0,
      );
      const headers = Array.from({ length: columnCount }, (_, columnIndex) =>
        String(values[0]?.[columnIndex] ?? ""),
      );
      const rows = values.map((row, index) => ({
        sourceRow: index + 1,
        values: Array.from({ length: columnCount }, (_, columnIndex) =>
          String(row?.[columnIndex] ?? ""),
        ),
      }));

      const sourceRows = rows.map((row) => row.sourceRow);
      const matched = sourceRows.length
        ? await db
            .select({
              id: leadershipsTable.id,
              sourceRow: leadershipsTable.sourceRow,
              name: leadershipsTable.name,
            })
            .from(leadershipsTable)
            .where(
              and(
                eq(leadershipsTable.sourceSheet, tab.title),
                eq(leadershipsTable.needsReview, false),
              ),
            )
        : [];
      const matchedRows = new Set(
        matched
          .map((row) => row.sourceRow)
          .filter((row): row is number => row !== null),
      );

      res.json({
        title: metadata.properties?.title ?? "Campanha EA 2026",
        spreadsheetUrl: metadata.spreadsheetUrl ?? null,
        tabs: tabs.map((item) => item.title),
        selectedTab: tab.title,
        headers,
        rows,
        matches: rows
          .filter((row) => matchedRows.has(row.sourceRow))
          .map((row) => row.sourceRow),
        totalRows: rows.length,
      });
    } catch (error) {
      logger.error({ err: error }, "Falha ao consultar a planilha da campanha");
      if (!res.headersSent) {
        res
          .status(502)
          .json({
            error: "Não foi possível consultar a planilha da campanha.",
          });
      }
    }
  },
);

export default router;
