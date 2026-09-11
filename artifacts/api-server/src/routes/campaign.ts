import { Router, type IRouter } from "express";
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import {
  db,
  articulatorsTable,
  citiesTable,
  coordinatorsTable,
  federalDeputiesTable,
  leadershipsTable,
  regionsTable,
  reviewIssuesTable,
} from "@workspace/db";
import {
  CreateLeadershipBody,
  GetCampaignOverviewResponse,
  GetLeadershipParams,
  GetLeadershipResponse,
  ListCitiesQueryParams,
  ListCitiesResponse,
  ListLeadershipsQueryParams,
  ListLeadershipsResponse,
  ListRegionsResponse,
  ListReviewIssuesQueryParams,
  ListReviewIssuesResponse,
  UpdateLeadershipBody,
  UpdateLeadershipParams,
  UpdateLeadershipResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const leadershipSelection = {
  id: leadershipsTable.id,
  cityId: citiesTable.id,
  cityName: citiesTable.name,
  regionId: regionsTable.id,
  regionName: regionsTable.name,
  internalRegion: leadershipsTable.internalRegion,
  articulatorId: articulatorsTable.id,
  articulatorName: articulatorsTable.name,
  coordinatorId: coordinatorsTable.id,
  coordinatorName: coordinatorsTable.name,
  coordinatorContact: leadershipsTable.coordinatorContact,
  name: sql<string>`coalesce(${leadershipsTable.name}, 'Sem identificação')`,
  leadershipContact: leadershipsTable.leadershipContact,
  federalDeputyId: federalDeputiesTable.id,
  federalDeputyName: federalDeputiesTable.canonicalName,
  allianceStatus: leadershipsTable.allianceStatus,
  originalFederalDeputy: leadershipsTable.originalFederalDeputy,
  religion: leadershipsTable.religion,
  sourceSheet: leadershipsTable.sourceSheet,
  sourceRow: leadershipsTable.sourceRow,
  needsReview: leadershipsTable.needsReview,
};

function parseId(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function getLeadershipById(id: number) {
  const [record] = await db
    .select(leadershipSelection)
    .from(leadershipsTable)
    .innerJoin(citiesTable, eq(citiesTable.id, leadershipsTable.cityId))
    .innerJoin(regionsTable, eq(regionsTable.id, citiesTable.regionId))
    .leftJoin(
      articulatorsTable,
      eq(articulatorsTable.id, leadershipsTable.articulatorId),
    )
    .leftJoin(
      coordinatorsTable,
      eq(coordinatorsTable.id, leadershipsTable.coordinatorId),
    )
    .leftJoin(
      federalDeputiesTable,
      eq(federalDeputiesTable.id, leadershipsTable.federalDeputyId),
    )
    .where(eq(leadershipsTable.id, id));
  return record;
}

router.get("/campaign/overview", async (_req, res): Promise<void> => {
  const [regions, cities, leaderships] = await Promise.all([
    db.select().from(regionsTable),
    db.select().from(citiesTable),
    db
      .select({
        cityId: leadershipsTable.cityId,
        federalDeputyName: federalDeputiesTable.canonicalName,
        needsReview: leadershipsTable.needsReview,
      })
      .from(leadershipsTable)
      .leftJoin(
        federalDeputiesTable,
        eq(federalDeputiesTable.id, leadershipsTable.federalDeputyId),
      ),
  ]);

  const regionRows = regions.map((region) => ({
    id: region.id,
    name: region.name,
    cityCount: cities.filter((city) => city.regionId === region.id).length,
    leadershipCount: leaderships.filter((leadership) => {
      return cities.find((city) => city.id === leadership.cityId)?.regionId === region.id;
    }).length,
  }));

  const deputyCounts = new Map<string, number>();
  for (const leadership of leaderships) {
    if (leadership.federalDeputyName) {
      deputyCounts.set(
        leadership.federalDeputyName,
        (deputyCounts.get(leadership.federalDeputyName) ?? 0) + 1,
      );
    }
  }

  const data = {
    totals: {
      regions: regions.length,
      cities: cities.length,
      leaderships: leaderships.length,
      reviewItems: leaderships.filter((leadership) => leadership.needsReview).length,
    },
    regions: regionRows.sort((a, b) => b.leadershipCount - a.leadershipCount),
    topDeputies: [...deputyCounts.entries()]
      .map(([name, leadershipCount]) => ({ name, leadershipCount }))
      .sort((a, b) => b.leadershipCount - a.leadershipCount)
      .slice(0, 8),
  };

  res.json(GetCampaignOverviewResponse.parse(data));
});

router.get("/regions", async (_req, res): Promise<void> => {
  const [regions, cities, leaderships] = await Promise.all([
    db.select().from(regionsTable).orderBy(asc(regionsTable.name)),
    db.select().from(citiesTable),
    db.select({ cityId: leadershipsTable.cityId }).from(leadershipsTable),
  ]);

  const data = regions.map((region) => ({
    id: region.id,
    name: region.name,
    cityCount: cities.filter((city) => city.regionId === region.id).length,
    leadershipCount: leaderships.filter((item) => {
      return cities.find((city) => city.id === item.cityId)?.regionId === region.id;
    }).length,
  }));

  res.json(ListRegionsResponse.parse(data));
});

router.get("/cities", async (req, res): Promise<void> => {
  const query = ListCitiesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const filters = query.data.regionId
    ? eq(citiesTable.regionId, query.data.regionId)
    : undefined;
  const cities = await db
    .select({
      id: citiesTable.id,
      name: citiesTable.name,
      regionId: regionsTable.id,
      regionName: regionsTable.name,
      leadershipCount: sql<number>`count(${leadershipsTable.id})::int`,
    })
    .from(citiesTable)
    .innerJoin(regionsTable, eq(regionsTable.id, citiesTable.regionId))
    .leftJoin(leadershipsTable, eq(leadershipsTable.cityId, citiesTable.id))
    .where(filters)
    .groupBy(citiesTable.id, regionsTable.id)
    .orderBy(asc(citiesTable.name));

  res.json(ListCitiesResponse.parse(cities));
});

router.get("/leaderships", async (req, res): Promise<void> => {
  const query = ListLeadershipsQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }

  const conditions = [];
  if (query.data.regionId) conditions.push(eq(regionsTable.id, query.data.regionId));
  if (query.data.cityId) conditions.push(eq(citiesTable.id, query.data.cityId));
  if (query.data.reviewOnly) conditions.push(eq(leadershipsTable.needsReview, true));
  if (query.data.search) {
    const pattern = `%${query.data.search}%`;
    conditions.push(
      or(
        ilike(leadershipsTable.name, pattern),
        ilike(citiesTable.name, pattern),
        ilike(regionsTable.name, pattern),
        ilike(coordinatorsTable.name, pattern),
        ilike(federalDeputiesTable.canonicalName, pattern),
      ),
    );
  }

  const where = conditions.length ? and(...conditions) : undefined;
  const [items, [{ total }]] = await Promise.all([
    db
      .select(leadershipSelection)
      .from(leadershipsTable)
      .innerJoin(citiesTable, eq(citiesTable.id, leadershipsTable.cityId))
      .innerJoin(regionsTable, eq(regionsTable.id, citiesTable.regionId))
      .leftJoin(
        articulatorsTable,
        eq(articulatorsTable.id, leadershipsTable.articulatorId),
      )
      .leftJoin(
        coordinatorsTable,
        eq(coordinatorsTable.id, leadershipsTable.coordinatorId),
      )
      .leftJoin(
        federalDeputiesTable,
        eq(federalDeputiesTable.id, leadershipsTable.federalDeputyId),
      )
      .where(where)
      .orderBy(desc(leadershipsTable.needsReview), asc(leadershipsTable.name))
      .limit(query.data.pageSize)
      .offset((query.data.page - 1) * query.data.pageSize),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(leadershipsTable)
      .innerJoin(citiesTable, eq(citiesTable.id, leadershipsTable.cityId))
      .innerJoin(regionsTable, eq(regionsTable.id, citiesTable.regionId))
      .leftJoin(
        coordinatorsTable,
        eq(coordinatorsTable.id, leadershipsTable.coordinatorId),
      )
      .leftJoin(
        federalDeputiesTable,
        eq(federalDeputiesTable.id, leadershipsTable.federalDeputyId),
      )
      .where(where),
  ]);

  res.json(
    ListLeadershipsResponse.parse({
      items,
      total: Number(total),
      page: query.data.page,
      pageSize: query.data.pageSize,
    }),
  );
});

router.post("/leaderships", async (req, res): Promise<void> => {
  const body = CreateLeadershipBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [{ nextId }] = await db
    .select({ nextId: sql<number>`coalesce(max(${leadershipsTable.id}), 0) + 1` })
    .from(leadershipsTable);
  const [created] = await db
    .insert(leadershipsTable)
    .values({
      id: Number(nextId),
      ...body.data,
      sourceSheet: "MANUAL",
      sourceRow: -Number(nextId),
      needsReview: false,
    })
    .returning();
  const record = await getLeadershipById(created.id);
  res.status(201).json(GetLeadershipResponse.parse(record));
});

router.get("/leaderships/:id", async (req, res): Promise<void> => {
  const params = GetLeadershipParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const record = await getLeadershipById(params.data.id);
  if (!record) {
    res.status(404).json({ error: "Leadership not found" });
    return;
  }
  res.json(GetLeadershipResponse.parse(record));
});

router.patch("/leaderships/:id", async (req, res): Promise<void> => {
  const params = UpdateLeadershipParams.safeParse(req.params);
  const body = UpdateLeadershipBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }

  const [updated] = await db
    .update(leadershipsTable)
    .set({ ...body.data, updatedAt: new Date() })
    .where(eq(leadershipsTable.id, params.data.id))
    .returning({ id: leadershipsTable.id });
  if (!updated) {
    res.status(404).json({ error: "Leadership not found" });
    return;
  }
  const record = await getLeadershipById(updated.id);
  res.json(UpdateLeadershipResponse.parse(record));
});

router.get("/review/issues", async (req, res): Promise<void> => {
  const query = ListReviewIssuesQueryParams.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: query.error.message });
    return;
  }
  const where =
    query.data.status === "all"
      ? undefined
      : eq(reviewIssuesTable.status, query.data.status);
  const issues = await db
    .select({
      id: reviewIssuesTable.id,
      leadershipId: reviewIssuesTable.leadershipId,
      type: reviewIssuesTable.type,
      severity: reviewIssuesTable.severity,
      details: reviewIssuesTable.details,
      status: reviewIssuesTable.status,
      sourceSheet: leadershipsTable.sourceSheet,
      sourceRow: leadershipsTable.sourceRow,
    })
    .from(reviewIssuesTable)
    .innerJoin(
      leadershipsTable,
      eq(leadershipsTable.id, reviewIssuesTable.leadershipId),
    )
    .where(where)
    .orderBy(desc(reviewIssuesTable.createdAt));
  res.json(ListReviewIssuesResponse.parse(issues));
});

export default router;