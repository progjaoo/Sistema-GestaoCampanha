import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import {
  articulatorsTable,
  citiesTable,
  coordinatorsTable,
  db,
  federalDeputiesTable,
  leadershipsTable,
  regionsTable,
  reviewIssuesTable,
} from "@workspace/db";

type CsvRow = Record<string, string>;

const dataDirectory = fileURLToPath(
  new URL("../../lib/db/seed-data/", import.meta.url),
);

function parseCsv(input: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    const next = input[index + 1];

    if (character === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
      continue;
    }
    if (character === '"') {
      quoted = !quoted;
      continue;
    }
    if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }
    if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += character;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  const headers = rows.shift()?.map((header) => header.replace(/^\uFEFF/, "")) ?? [];
  return rows.map((values) =>
    Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])),
  );
}

async function readCsv(fileName: string): Promise<CsvRow[]> {
  return parseCsv(await readFile(join(dataDirectory, fileName), "utf8"));
}

function value(row: CsvRow, key: string): string | null {
  const normalized = row[key]?.trim() ?? "";
  return normalized === "" ? null : normalized;
}

function numberValue(row: CsvRow, key: string): number | null {
  const raw = value(row, key);
  return raw === null ? null : Number(raw);
}

function requiredNumber(row: CsvRow, key: string): number {
  const parsed = numberValue(row, key);
  if (parsed === null || !Number.isInteger(parsed)) {
    throw new Error(`Missing integer ${key} in row ${JSON.stringify(row)}`);
  }
  return parsed;
}

async function seed() {
  const [regions, cities, deputies, articulators, coordinators, leaderships] =
    await Promise.all([
      readCsv("REGIOES_1789092231700.csv"),
      readCsv("CIDADES_1789092231701.csv"),
      readCsv("DEPUTADOS_FEDERAIS_1789092231701.csv"),
      readCsv("ARTICULADORES_1789092231701.csv"),
      readCsv("COORDENADORES_1789092231701.csv"),
      readCsv("LIDERANCAS_1789092231701.csv"),
    ]);

  const expected = {
    regions: 8,
    cities: 53,
    deputies: 23,
    articulators: 33,
    coordinators: 55,
    leaderships: 681,
  };
  const actual = {
    regions: regions.length,
    cities: cities.length,
    deputies: deputies.length,
    articulators: articulators.length,
    coordinators: coordinators.length,
    leaderships: leaderships.length,
  };

  for (const key of Object.keys(expected) as Array<keyof typeof expected>) {
    if (actual[key] !== expected[key]) {
      throw new Error(
        `CSV validation failed for ${key}: expected ${expected[key]}, got ${actual[key]}`,
      );
    }
  }

  await db.transaction(async (transaction) => {
    const regionIds = new Map<number, number>();
    const cityIds = new Map<number, number>();
    const deputyIds = new Map<number, number>();
    const articulatorIds = new Map<number, number>();
    const coordinatorIds = new Map<number, number>();

    for (const row of regions) {
      const sourceId = requiredNumber(row, "Regiao_ID");
      const name = value(row, "Nome_Regiao")!;
      await transaction
        .insert(regionsTable)
        .values({ id: sourceId, name })
        .onConflictDoNothing({ target: regionsTable.name });
      const [stored] = await transaction
        .select({ id: regionsTable.id })
        .from(regionsTable)
        .where(eq(regionsTable.name, name));
      if (!stored) throw new Error(`Unable to resolve region ${name}`);
      regionIds.set(sourceId, stored.id);
    }

    for (const row of cities) {
      const sourceId = requiredNumber(row, "Cidade_ID");
      const name = value(row, "Nome_Cidade")!;
      const regionId = regionIds.get(requiredNumber(row, "Regiao_ID"));
      if (!regionId) throw new Error(`Unable to resolve city region for ${name}`);
      await transaction
        .insert(citiesTable)
        .values({
          id: sourceId,
          name,
          regionId,
        })
        .onConflictDoNothing({ target: [citiesTable.name, citiesTable.regionId] });
      const [stored] = await transaction
        .select({ id: citiesTable.id })
        .from(citiesTable)
        .where(and(eq(citiesTable.name, name), eq(citiesTable.regionId, regionId)));
      if (!stored) throw new Error(`Unable to resolve city ${name}`);
      cityIds.set(sourceId, stored.id);
    }

    for (const row of deputies) {
      const sourceId = requiredNumber(row, "DepFederal_ID");
      const canonicalName = value(row, "Nome_Canonico")!;
      await transaction
        .insert(federalDeputiesTable)
        .values({
          id: sourceId,
          canonicalName,
          isAlliance: value(row, "Eh_Dobrado_de_Edson_Albertassi") === "Sim",
          variants: value(row, "Variantes_Encontradas_na_Planilha_Original"),
        })
        .onConflictDoNothing({ target: federalDeputiesTable.canonicalName });
      const [stored] = await transaction
        .select({ id: federalDeputiesTable.id })
        .from(federalDeputiesTable)
        .where(eq(federalDeputiesTable.canonicalName, canonicalName));
      if (!stored) throw new Error(`Unable to resolve deputy ${canonicalName}`);
      deputyIds.set(sourceId, stored.id);
    }

    for (const row of articulators) {
      const sourceId = requiredNumber(row, "Articulador_ID");
      const name = value(row, "Nome")!;
      await transaction
        .insert(articulatorsTable)
        .values({ id: sourceId, name })
        .onConflictDoNothing({ target: articulatorsTable.name });
      const [stored] = await transaction
        .select({ id: articulatorsTable.id })
        .from(articulatorsTable)
        .where(eq(articulatorsTable.name, name));
      if (!stored) throw new Error(`Unable to resolve articulator ${name}`);
      articulatorIds.set(sourceId, stored.id);
    }

    for (const row of coordinators) {
      const sourceId = requiredNumber(row, "Coordenador_ID");
      const name = value(row, "Nome")!;
      await transaction
        .insert(coordinatorsTable)
        .values({ id: sourceId, name })
        .onConflictDoNothing({ target: coordinatorsTable.name });
      const [stored] = await transaction
        .select({ id: coordinatorsTable.id })
        .from(coordinatorsTable)
        .where(eq(coordinatorsTable.name, name));
      if (!stored) throw new Error(`Unable to resolve coordinator ${name}`);
      coordinatorIds.set(sourceId, stored.id);
    }

    for (const row of leaderships) {
      const allianceStatus = value(row, "Eh_Dobrado");
      const needsReview = allianceStatus?.toUpperCase() === "REVISAR";
      const sourceSheet = value(row, "Aba_Origem")!;
      const sourceRow = requiredNumber(row, "Linha_Origem");
      const leadershipValues = {
        id: requiredNumber(row, "ID"),
        cityId: cityIds.get(requiredNumber(row, "Cidade_ID"))!,
        internalRegion: value(row, "Bairro_RegiaoInterna"),
        articulatorId: numberValue(row, "Articulador_ID")
          ? articulatorIds.get(numberValue(row, "Articulador_ID")!)
          : null,
        coordinatorId: numberValue(row, "Coordenador_ID")
          ? coordinatorIds.get(numberValue(row, "Coordenador_ID")!)
          : null,
        coordinatorContact: value(row, "Contato_Coordenador"),
        name: value(row, "Lideranca")!,
        leadershipContact: value(row, "Contato_Lideranca"),
        federalDeputyId: needsReview
          ? null
          : numberValue(row, "DepFederal_ID")
            ? deputyIds.get(numberValue(row, "DepFederal_ID")!)
            : null,
        allianceStatus,
        originalFederalDeputy: value(row, "DepFederal_Original"),
        religion: value(row, "Religiao"),
        sourceSheet,
        sourceRow,
        needsReview,
      };

      await transaction
        .insert(leadershipsTable)
        .values(leadershipValues)
        .onConflictDoUpdate({
          target: [leadershipsTable.sourceSheet, leadershipsTable.sourceRow],
          set: {
            cityId: leadershipValues.cityId,
            internalRegion: leadershipValues.internalRegion,
            articulatorId: leadershipValues.articulatorId,
            coordinatorId: leadershipValues.coordinatorId,
            coordinatorContact: leadershipValues.coordinatorContact,
            name: leadershipValues.name,
            leadershipContact: leadershipValues.leadershipContact,
            federalDeputyId: leadershipValues.federalDeputyId,
            allianceStatus: leadershipValues.allianceStatus,
            originalFederalDeputy: leadershipValues.originalFederalDeputy,
            religion: leadershipValues.religion,
            needsReview: leadershipValues.needsReview,
          },
        });
    }

    for (const row of leaderships.filter(
      (candidate) => value(candidate, "Eh_Dobrado")?.toUpperCase() === "REVISAR",
    )) {
      const leadershipId = requiredNumber(row, "ID");
      await transaction
        .insert(reviewIssuesTable)
        .values({
          leadershipId,
          type: "FEDERAL_DEPUTY_REVIEW",
          severity: "high",
          details: `Vínculo original "${value(row, "DepFederal_Original") ?? "não informado"}" precisa de decisão manual.`,
          status: "open",
        })
        .onConflictDoUpdate({
          target: [reviewIssuesTable.leadershipId, reviewIssuesTable.type],
          set: {
            details: `Vínculo original "${value(row, "DepFederal_Original") ?? "não informado"}" precisa de decisão manual.`,
            status: "open",
          },
        });
    }
  });

  const counts = await Promise.all([
    db.select().from(regionsTable),
    db.select().from(citiesTable),
    db.select().from(federalDeputiesTable),
    db.select().from(articulatorsTable),
    db.select().from(coordinatorsTable),
    db.select().from(leadershipsTable),
  ]);
  const imported = counts.map((rows) => rows.length);
  const expectedCounts = Object.values(expected);
  if (imported.some((count, index) => count !== expectedCounts[index])) {
    throw new Error(
      `Database validation failed: expected ${expectedCounts.join(", ")}, got ${imported.join(", ")}`,
    );
  }
}

seed()
  .then(() => {
    process.stdout.write(
      "Campaign seed completed: 8 regions, 53 cities, 23 deputies, 33 articulators, 55 coordinators, 681 leaderships.\n",
    );
  })
  .catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });