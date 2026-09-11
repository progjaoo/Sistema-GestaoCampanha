import { Router, type IRouter } from "express";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import {
  authUsersTable,
  campaignCalendarEventsTable,
  campaignEventAcknowledgementsTable,
  campaignTasksTable,
  citiesTable,
  coordinatorsTable,
  db,
  leadershipsTable,
  regionsTable,
  articulatorsTable,
} from "@workspace/db";
import { googleCalendarRequest } from "../lib/google-calendar";
import { hasPermission, leadershipScopeCondition, cityScopeCondition } from "../lib/auth";
import { requireAnyPermission, requirePermission } from "../middlewares/auth";

const router: IRouter = Router();

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown, required = false): string | null {
  if (typeof value !== "string") return required ? null : null;
  const clean = value.trim();
  return clean || (required ? null : null);
}

function numberValue(value: unknown): number | null | undefined {
  if (value === null || value === undefined || value === "") return value === null ? null : undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function dateValue(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function taskScope(principal: NonNullable<Express.Request["auth"]>) {
  return cityScopeCondition(principal);
}

async function taskById(id: number, principal: NonNullable<Express.Request["auth"]>) {
  const [task] = await db
    .select({
      id: campaignTasksTable.id,
      title: campaignTasksTable.title,
      description: campaignTasksTable.description,
      status: campaignTasksTable.status,
      priority: campaignTasksTable.priority,
      dueAt: campaignTasksTable.dueAt,
      cityId: campaignTasksTable.cityId,
      cityName: citiesTable.name,
      regionName: regionsTable.name,
      leadershipId: campaignTasksTable.leadershipId,
      leadershipName: leadershipsTable.name,
      assigneeUserId: campaignTasksTable.assigneeUserId,
      assigneeName: authUsersTable.fullName,
      createdByUserId: campaignTasksTable.createdByUserId,
      createdAt: campaignTasksTable.createdAt,
      updatedAt: campaignTasksTable.updatedAt,
    })
    .from(campaignTasksTable)
    .leftJoin(citiesTable, eq(citiesTable.id, campaignTasksTable.cityId))
    .leftJoin(regionsTable, eq(regionsTable.id, citiesTable.regionId))
    .leftJoin(leadershipsTable, eq(leadershipsTable.id, campaignTasksTable.leadershipId))
    .leftJoin(authUsersTable, eq(authUsersTable.id, campaignTasksTable.assigneeUserId))
    .where(and(eq(campaignTasksTable.id, id), taskScope(principal)));
  return task;
}

router.get(
  "/tasks",
  requirePermission("tasks:view"),
  async (req, res): Promise<void> => {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const conditions = [taskScope(req.auth!)];
    if (typeof req.query.status === "string" && ["todo", "in_progress", "blocked", "done"].includes(req.query.status)) {
      conditions.push(eq(campaignTasksTable.status, req.query.status));
    }
    if (search) {
      const pattern = `%${search}%`;
      conditions.push(or(ilike(campaignTasksTable.title, pattern), ilike(campaignTasksTable.description, pattern), ilike(citiesTable.name, pattern)));
    }
    const rows = await db
      .select({
        id: campaignTasksTable.id,
        title: campaignTasksTable.title,
        description: campaignTasksTable.description,
        status: campaignTasksTable.status,
        priority: campaignTasksTable.priority,
        dueAt: campaignTasksTable.dueAt,
        cityId: campaignTasksTable.cityId,
        cityName: citiesTable.name,
        regionName: regionsTable.name,
        leadershipId: campaignTasksTable.leadershipId,
        leadershipName: leadershipsTable.name,
        assigneeUserId: campaignTasksTable.assigneeUserId,
        assigneeName: authUsersTable.fullName,
        createdAt: campaignTasksTable.createdAt,
      })
      .from(campaignTasksTable)
      .leftJoin(citiesTable, eq(citiesTable.id, campaignTasksTable.cityId))
      .leftJoin(regionsTable, eq(regionsTable.id, citiesTable.regionId))
      .leftJoin(leadershipsTable, eq(leadershipsTable.id, campaignTasksTable.leadershipId))
      .leftJoin(authUsersTable, eq(authUsersTable.id, campaignTasksTable.assigneeUserId))
      .where(and(...conditions))
      .orderBy(desc(campaignTasksTable.priority), asc(campaignTasksTable.dueAt), desc(campaignTasksTable.createdAt));
    res.json(rows);
  },
);

router.post(
  "/tasks",
  requirePermission("tasks:create"),
  async (req, res): Promise<void> => {
    if (!record(req.body)) {
      res.status(400).json({ error: "Dados inválidos." });
      return;
    }
    const title = stringValue(req.body.title, true);
    const cityId = numberValue(req.body.cityId);
    const leadershipId = numberValue(req.body.leadershipId);
    if (!title || (cityId === undefined && leadershipId === undefined)) {
      res.status(400).json({ error: "Título e cidade ou liderança são obrigatórios." });
      return;
    }
    let resolvedCityId = cityId ?? null;
    if (leadershipId) {
      const [leadership] = await db.select({ cityId: leadershipsTable.cityId }).from(leadershipsTable).where(eq(leadershipsTable.id, leadershipId));
      if (!leadership) {
        res.status(400).json({ error: "Liderança não encontrada." });
        return;
      }
      resolvedCityId = leadership.cityId;
    }
    const [allowedCity] = resolvedCityId
      ? await db.select({ id: citiesTable.id }).from(citiesTable).where(and(eq(citiesTable.id, resolvedCityId), cityScopeCondition(req.auth!)))
      : [];
    if (!allowedCity) {
      res.status(403).json({ error: "O território está fora do seu escopo." });
      return;
    }
    const dueAt = req.body.dueAt === null ? null : dateValue(req.body.dueAt);
    const [created] = await db.insert(campaignTasksTable).values({
      title,
      description: stringValue(req.body.description),
      status: ["todo", "in_progress", "blocked", "done"].includes(String(req.body.status)) ? String(req.body.status) : "todo",
      priority: ["low", "normal", "high", "urgent"].includes(String(req.body.priority)) ? String(req.body.priority) : "normal",
      dueAt,
      cityId: resolvedCityId,
      leadershipId: leadershipId ?? null,
      assigneeUserId: numberValue(req.body.assigneeUserId) ?? null,
      createdByUserId: req.auth!.user.id,
    }).returning({ id: campaignTasksTable.id });
    res.status(201).json(await taskById(created.id, req.auth!));
  },
);

router.patch(
  "/tasks/:id",
  requirePermission("tasks:update"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    const existing = Number.isInteger(id) ? await taskById(id, req.auth!) : undefined;
    if (!existing) {
      res.status(404).json({ error: "Tarefa não encontrada." });
      return;
    }
    if (!record(req.body)) {
      res.status(400).json({ error: "Dados inválidos." });
      return;
    }
    const updates: Partial<typeof campaignTasksTable.$inferInsert> = {};
    if (req.body.title !== undefined) {
      const title = stringValue(req.body.title, true);
      if (!title) {
        res.status(400).json({ error: "O título não pode ficar vazio." });
        return;
      }
      updates.title = title;
    }
    if (req.body.description !== undefined) updates.description = stringValue(req.body.description);
    if (req.body.status !== undefined && ["todo", "in_progress", "blocked", "done"].includes(String(req.body.status))) updates.status = String(req.body.status);
    if (req.body.priority !== undefined && ["low", "normal", "high", "urgent"].includes(String(req.body.priority))) updates.priority = String(req.body.priority);
    if (req.body.dueAt !== undefined) updates.dueAt = req.body.dueAt === null ? null : dateValue(req.body.dueAt);
    if (req.body.assigneeUserId !== undefined) updates.assigneeUserId = numberValue(req.body.assigneeUserId) ?? null;
    if (Object.keys(updates).length) await db.update(campaignTasksTable).set(updates).where(eq(campaignTasksTable.id, id));
    res.json(await taskById(id, req.auth!));
  },
);

router.delete(
  "/tasks/:id",
  requirePermission("tasks:delete"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    const existing = Number.isInteger(id) ? await taskById(id, req.auth!) : undefined;
    if (!existing) {
      res.status(404).json({ error: "Tarefa não encontrada." });
      return;
    }
    await db.delete(campaignTasksTable).where(eq(campaignTasksTable.id, id));
    res.status(204).send();
  },
);

router.get(
  "/tasks/:id/recipients",
  requirePermission("tasks:share"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    const task = Number.isInteger(id) ? await taskById(id, req.auth!) : undefined;
    if (!task) {
      res.status(404).json({ error: "Tarefa não encontrada." });
      return;
    }
    const rows = await db
      .select({
        id: authUsersTable.id,
        name: authUsersTable.fullName,
        role: authUsersTable.role,
        phone: authUsersTable.phone,
        email: authUsersTable.email,
      })
      .from(authUsersTable)
      .where(and(eq(authUsersTable.isActive, true), sql`${authUsersTable.phone} is not null`, task.cityId ? eq(authUsersTable.cityId, task.cityId) : sql`false`));
    const campaignContacts = task.cityId
      ? await db.select({
          id: leadershipsTable.id,
          name: leadershipsTable.name,
          phone: leadershipsTable.leadershipContact,
          role: sql<string>`'LIDERANCA'`,
          email: sql<string>`null`,
        }).from(leadershipsTable).where(and(eq(leadershipsTable.cityId, task.cityId), sql`${leadershipsTable.leadershipContact} is not null`))
      : [];
    res.json([...rows, ...campaignContacts]);
  },
);

router.get(
  "/calendar/events",
  requirePermission("calendar:view"),
  async (req, res): Promise<void> => {
    const events = await db
      .select({
        id: campaignCalendarEventsTable.id,
        googleEventId: campaignCalendarEventsTable.googleEventId,
        googleHtmlLink: campaignCalendarEventsTable.googleHtmlLink,
        title: campaignCalendarEventsTable.title,
        description: campaignCalendarEventsTable.description,
        location: campaignCalendarEventsTable.location,
        startsAt: campaignCalendarEventsTable.startsAt,
        endsAt: campaignCalendarEventsTable.endsAt,
        cityId: campaignCalendarEventsTable.cityId,
        cityName: citiesTable.name,
        regionName: regionsTable.name,
        status: campaignCalendarEventsTable.status,
      })
      .from(campaignCalendarEventsTable)
      .innerJoin(citiesTable, eq(citiesTable.id, campaignCalendarEventsTable.cityId))
      .innerJoin(regionsTable, eq(regionsTable.id, citiesTable.regionId))
      .where(cityScopeCondition(req.auth!))
      .orderBy(asc(campaignCalendarEventsTable.startsAt));
    res.json(events);
  },
);

router.post(
  "/calendar/events",
  requirePermission("calendar:manage"),
  async (req, res): Promise<void> => {
    if (!record(req.body)) {
      res.status(400).json({ error: "Dados inválidos." });
      return;
    }
    const title = stringValue(req.body.title, true);
    const startsAt = dateValue(req.body.startsAt);
    const endsAt = dateValue(req.body.endsAt);
    const cityId = numberValue(req.body.cityId);
    if (!title || !startsAt || !endsAt || !cityId || endsAt <= startsAt) {
      res.status(400).json({ error: "Título, cidade, início e fim válidos são obrigatórios." });
      return;
    }
    const [city] = await db.select({ id: citiesTable.id, name: citiesTable.name }).from(citiesTable).where(eq(citiesTable.id, cityId));
    if (!city) {
      res.status(400).json({ error: "Cidade não encontrada." });
      return;
    }
    const googleResponse = await googleCalendarRequest("/calendar/v3/calendars/primary/events?sendUpdates=all", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: title,
        description: stringValue(req.body.description),
        location: stringValue(req.body.location),
        start: { dateTime: startsAt.toISOString(), timeZone: "America/Sao_Paulo" },
        end: { dateTime: endsAt.toISOString(), timeZone: "America/Sao_Paulo" },
        extendedProperties: { private: { eaCityId: String(cityId) } },
      }),
    });
    if (!googleResponse.ok) {
      res.status(502).json({ error: "O Google Calendar não aceitou o evento.", details: await googleResponse.text() });
      return;
    }
    const googleEvent = await googleResponse.json() as { id: string; htmlLink?: string };
    const [created] = await db.insert(campaignCalendarEventsTable).values({
      googleCalendarId: "primary",
      googleEventId: googleEvent.id,
      googleHtmlLink: googleEvent.htmlLink ?? null,
      title,
      description: stringValue(req.body.description),
      location: stringValue(req.body.location),
      startsAt,
      endsAt,
      cityId,
      status: "pending",
      createdByUserId: req.auth!.user.id,
    }).returning();
    res.status(201).json(created);
  },
);

router.post(
  "/calendar/sync",
  requirePermission("calendar:manage"),
  async (req, res): Promise<void> => {
    const timeMin = new Date();
    const timeMax = new Date();
    timeMax.setDate(timeMax.getDate() + 90);
    const query = new URLSearchParams({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      timeZone: "America/Sao_Paulo",
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
    });
    const response = await googleCalendarRequest(`/calendar/v3/calendars/primary/events?${query.toString()}`);
    if (!response.ok) {
      res.status(502).json({ error: "Não foi possível sincronizar o Google Calendar.", details: await response.text() });
      return;
    }
    const payload = await response.json() as { items?: Array<Record<string, unknown>> };
    let imported = 0;
    for (const event of payload.items ?? []) {
      if (event.status === "cancelled" || typeof event.id !== "string") continue;
      const privateProps = record(event.extendedProperties) && record(event.extendedProperties.private) ? event.extendedProperties.private : {};
      const cityId = numberValue(privateProps.eaCityId);
      const start = record(event.start) && typeof event.start.dateTime === "string" ? dateValue(event.start.dateTime) : null;
      const end = record(event.end) && typeof event.end.dateTime === "string" ? dateValue(event.end.dateTime) : null;
      if (!cityId || !start || !end || typeof event.summary !== "string") continue;
      await db.insert(campaignCalendarEventsTable).values({
        googleCalendarId: "primary",
        googleEventId: event.id,
        googleHtmlLink: typeof event.htmlLink === "string" ? event.htmlLink : null,
        title: event.summary,
        description: typeof event.description === "string" ? event.description : null,
        location: typeof event.location === "string" ? event.location : null,
        startsAt: start,
        endsAt: end,
        cityId,
        status: "pending",
        createdByUserId: req.auth!.user.id,
      }).onConflictDoUpdate({
        target: [campaignCalendarEventsTable.googleCalendarId, campaignCalendarEventsTable.googleEventId],
        set: { title: event.summary, startsAt: start, endsAt: end, googleHtmlLink: typeof event.htmlLink === "string" ? event.htmlLink : null },
      });
      imported++;
    }
    res.json({ imported });
  },
);

router.post(
  "/calendar/events/:id/acknowledge",
  requireAnyPermission(["calendar:approve", "calendar:view"]),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    const [event] = await db.select({ id: campaignCalendarEventsTable.id }).from(campaignCalendarEventsTable).innerJoin(citiesTable, eq(citiesTable.id, campaignCalendarEventsTable.cityId)).where(and(eq(campaignCalendarEventsTable.id, id), cityScopeCondition(req.auth!)));
    if (!event) {
      res.status(404).json({ error: "Evento não encontrado." });
      return;
    }
    await db.insert(campaignEventAcknowledgementsTable).values({ eventId: id, userId: req.auth!.user.id }).onConflictDoNothing();
    res.json({ success: true });
  },
);

export default router;