import { randomBytes } from "node:crypto";
import { Router, type IRouter, type Request } from "express";
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lt, or, sql } from "drizzle-orm";
import {
  authUsersTable,
  campaignBoardMembersTable,
  campaignBoardsTable,
  campaignCalendarEventsTable,
  campaignCalendarSyncStateTable,
  campaignCalendarSharesTable,
  campaignWhatsappNotificationEventsTable,
  campaignWhatsappRecipientGroupMembersTable,
  campaignWhatsappRecipientGroupsTable,
  campaignWhatsappShareBatchesTable,
  campaignWhatsappShareMessagesTable,
  campaignEventAcknowledgementsTable,
  campaignTasksTable,
  campaignTaskActivityTable,
  campaignTaskChecklistItemsTable,
  campaignTaskCommentsTable,
  campaignTaskMembersTable,
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
export const publicOperationsRouter: IRouter = Router();

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

function clearSyncError() {
  return { syncStatus: "synced", lastSyncedAt: new Date(), lastSyncError: null };
}

async function recordSyncState(provider: string, status: string, error?: string | null): Promise<void> {
  const now = new Date();
  await db.insert(campaignCalendarSyncStateTable).values({
    provider,
    status,
    lastAttemptedAt: now,
    lastSyncedAt: status === "ok" ? now : null,
    lastError: error ?? null,
  }).onConflictDoUpdate({
    target: campaignCalendarSyncStateTable.provider,
    set: {
      status,
      lastAttemptedAt: now,
      lastSyncedAt: status === "ok" ? now : undefined,
      lastError: error ?? null,
      updatedAt: now,
    },
  });
}

function normalizeWhatsAppPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/\D/g, "");
  const normalized = digits.startsWith("55") ? digits : `55${digits}`;
  return /^55\d{10,11}$/.test(normalized) ? normalized : null;
}

type ShareRecipientKey = { type: "user" | "leadership"; id: number };

function parseShareRecipients(value: unknown): ShareRecipientKey[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) return null;
  const parsed = value.flatMap((item) => {
    if (!record(item) || (item.type !== "user" && item.type !== "leadership")) return [];
    const id = numberValue(item.id);
    return id ? [{ type: item.type, id } as ShareRecipientKey] : [];
  });
  if (parsed.length !== value.length) return null;
  return [...new Map(parsed.map((item) => [`${item.type}:${item.id}`, item])).values()];
}

type CalendarShareRecipient = {
  id: number;
  type: "user" | "leadership";
  name: string | null;
  role: string;
  phone: string;
  email: string | null;
};

type AutomaticCalendarRecipient = {
  recipientType: "user" | "leadership" | "group_member";
  recipientUserId: number | null;
  recipientLeadershipId: number | null;
  recipientGroupMemberId?: number | null;
  recipientName: string;
  phone: string;
  groupMemberKey?: string;
  recipientGroupId?: number;
};

function calendarWeekStart(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(value);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  const localDate = new Date(Date.UTC(Number(part("year")), Number(part("month")) - 1, Number(part("day"))));
  const mondayOffset = (localDate.getUTCDay() + 6) % 7;
  localDate.setUTCDate(localDate.getUTCDate() - mondayOffset);
  return `${localDate.getUTCFullYear()}-${String(localDate.getUTCMonth() + 1).padStart(2, "0")}-${String(localDate.getUTCDate()).padStart(2, "0")}`;
}

async function coordinationGroupRecipients(): Promise<AutomaticCalendarRecipient[]> {
  const rows = await db
    .select({
      groupId: campaignWhatsappRecipientGroupsTable.id,
      groupMemberId: campaignWhatsappRecipientGroupMembersTable.id,
      phone: campaignWhatsappRecipientGroupMembersTable.phone,
      name: campaignWhatsappRecipientGroupMembersTable.recipientName,
    })
    .from(campaignWhatsappRecipientGroupMembersTable)
    .innerJoin(campaignWhatsappRecipientGroupsTable, eq(campaignWhatsappRecipientGroupsTable.id, campaignWhatsappRecipientGroupMembersTable.groupId))
    .where(and(
      eq(campaignWhatsappRecipientGroupsTable.kind, "coordination_general"),
      eq(campaignWhatsappRecipientGroupsTable.active, true),
      eq(campaignWhatsappRecipientGroupMembersTable.active, true),
    ))
    .orderBy(asc(campaignWhatsappRecipientGroupMembersTable.recipientName));
  return rows.flatMap((row) => {
    const phone = normalizeWhatsAppPhone(row.phone);
    return phone
      ? [{
          recipientType: "group_member" as const,
          recipientUserId: null,
          recipientLeadershipId: null,
          recipientName: row.name,
          phone,
          groupMemberKey: `${row.groupId}:${phone}`,
           recipientGroupId: row.groupId,
           recipientGroupMemberId: row.groupMemberId,
        }]
      : [];
  });
}

async function territorialCalendarRecipients(
  cityIds: number[],
  principal: NonNullable<Express.Request["auth"]>,
): Promise<CalendarShareRecipient[]> {
  const uniqueCityIds = [...new Set(cityIds)].filter((cityId) => Number.isInteger(cityId) && cityId > 0);
  if (!uniqueCityIds.length) return [];
  const [users, leaderships] = await Promise.all([
    db.select({
      id: authUsersTable.id,
      type: sql<"user">`'user'`,
      name: authUsersTable.fullName,
      role: authUsersTable.role,
      phone: authUsersTable.phone,
      email: authUsersTable.email,
    }).from(authUsersTable)
      .innerJoin(citiesTable, eq(citiesTable.id, authUsersTable.cityId))
      .where(and(
        eq(authUsersTable.isActive, true),
        inArray(authUsersTable.cityId, uniqueCityIds),
        sql`${authUsersTable.phone} is not null`,
        cityScopeCondition(principal),
      ))
      .orderBy(asc(authUsersTable.fullName)),
    db.select({
      id: leadershipsTable.id,
      type: sql<"leadership">`'leadership'`,
      name: leadershipsTable.name,
      role: sql<string>`'LIDERANCA'`,
      phone: leadershipsTable.leadershipContact,
      email: sql<string>`null`,
    }).from(leadershipsTable)
      .innerJoin(citiesTable, eq(citiesTable.id, leadershipsTable.cityId))
      .where(and(
        inArray(leadershipsTable.cityId, uniqueCityIds),
        sql`${leadershipsTable.leadershipContact} is not null`,
        cityScopeCondition(principal),
      ))
      .orderBy(asc(leadershipsTable.name)),
  ]);
  return [...users, ...leaderships].flatMap((recipient) => {
    const phone = normalizeWhatsAppPhone(recipient.phone);
    return phone ? [{ ...recipient, phone }] : [];
  });
}

async function calendarShareForScope(
  weekStart: string,
  principal: NonNullable<Express.Request["auth"]>,
  label?: string,
) {
  const scope = calendarShareScope(principal);
  const scopeFilters = [
    eq(campaignCalendarSharesTable.weekStart, weekStart),
    eq(campaignCalendarSharesTable.active, true),
    eq(campaignCalendarSharesTable.scopeType, scope.scopeType),
    scope.scopeRegionId === null ? isNull(campaignCalendarSharesTable.scopeRegionId) : eq(campaignCalendarSharesTable.scopeRegionId, scope.scopeRegionId),
    scope.scopeCityId === null ? isNull(campaignCalendarSharesTable.scopeCityId) : eq(campaignCalendarSharesTable.scopeCityId, scope.scopeCityId),
  ];
  const [existing] = await db.select({
    id: campaignCalendarSharesTable.id,
    token: campaignCalendarSharesTable.token,
    weekStart: campaignCalendarSharesTable.weekStart,
    label: campaignCalendarSharesTable.label,
    scopeType: campaignCalendarSharesTable.scopeType,
    scopeRegionId: campaignCalendarSharesTable.scopeRegionId,
    scopeCityId: campaignCalendarSharesTable.scopeCityId,
  }).from(campaignCalendarSharesTable).where(and(...scopeFilters)).limit(1);
  if (existing) return { share: existing, created: false };
  const [created] = await db.insert(campaignCalendarSharesTable).values({
    token: randomBytes(24).toString("base64url"),
    weekStart,
    label: label ?? `Agenda de ${weekStart}`,
    ...scope,
    createdByUserId: principal.user.id,
  }).returning({
    id: campaignCalendarSharesTable.id,
    token: campaignCalendarSharesTable.token,
    weekStart: campaignCalendarSharesTable.weekStart,
    label: campaignCalendarSharesTable.label,
    scopeType: campaignCalendarSharesTable.scopeType,
    scopeRegionId: campaignCalendarSharesTable.scopeRegionId,
    scopeCityId: campaignCalendarSharesTable.scopeCityId,
  });
  return { share: created, created: true };
}

async function automaticCalendarNotification(
  input: {
    triggerType: string;
    dedupeKey: string;
    share: {
      id: number;
      token: string;
      weekStart: string;
      label: string;
      scopeType: string;
      scopeRegionId: number | null;
      scopeCityId: number | null;
    };
    event?: {
      id: number;
      title: string;
      startsAt: Date;
      endsAt: Date;
      cityId: number;
      cityName: string;
      location: string | null;
    };
    principal: NonNullable<Express.Request["auth"]>;
    request: Request;
  },
) {
  const [existing] = await db.select({
    id: campaignWhatsappNotificationEventsTable.id,
  }).from(campaignWhatsappNotificationEventsTable)
    .where(eq(campaignWhatsappNotificationEventsTable.dedupeKey, input.dedupeKey))
    .limit(1);
  if (existing) return null;

  const groupRecipients = await coordinationGroupRecipients();
  const cityIds = input.event
    ? [input.event.cityId]
    : await db.select({ cityId: campaignCalendarEventsTable.cityId })
      .from(campaignCalendarEventsTable)
      .innerJoin(citiesTable, eq(citiesTable.id, campaignCalendarEventsTable.cityId))
      .where(and(
        eq(campaignCalendarEventsTable.source, "google"),
        gte(campaignCalendarEventsTable.startsAt, weekBounds(input.share.weekStart)!.start),
        lt(campaignCalendarEventsTable.startsAt, weekBounds(input.share.weekStart)!.end),
        calendarShareScopeCondition(input.share),
      ))
      .then((rows) => rows.map((row) => row.cityId));
  const territorialRecipients = await territorialCalendarRecipients(cityIds, input.principal);
  const weeklyEvents = input.event
    ? []
    : await db.select({
        title: campaignCalendarEventsTable.title,
        startsAt: campaignCalendarEventsTable.startsAt,
        cityName: citiesTable.name,
        location: campaignCalendarEventsTable.location,
      })
      .from(campaignCalendarEventsTable)
      .innerJoin(citiesTable, eq(citiesTable.id, campaignCalendarEventsTable.cityId))
      .where(and(
        eq(campaignCalendarEventsTable.source, "google"),
        gte(campaignCalendarEventsTable.startsAt, weekBounds(input.share.weekStart)!.start),
        lt(campaignCalendarEventsTable.startsAt, weekBounds(input.share.weekStart)!.end),
        calendarShareScopeCondition(input.share),
      ))
      .orderBy(asc(campaignCalendarEventsTable.startsAt));
  const recipients = [...groupRecipients, ...territorialRecipients.map((recipient) => ({
    recipientType: recipient.type,
    recipientUserId: recipient.type === "user" ? recipient.id : null,
    recipientLeadershipId: recipient.type === "leadership" ? recipient.id : null,
    recipientGroupMemberId: null,
    recipientName: recipient.name ?? "Destinatário",
    phone: recipient.phone,
  }))].filter((recipient, index, all) => all.findIndex((item) => item.phone === recipient.phone) === index);
  if (!recipients.length) return null;
  const recipientGroupId = groupRecipients.find((recipient) => recipient.recipientGroupId)?.recipientGroupId ?? null;

  const agendaLink = `${appUrl(input.request)}/agenda/compartilhada/${input.share.token}`;
  const lines = [
    input.event ? `Nova agenda: ${input.event.title}` : `EA 2026 — ${input.share.label}`,
    input.event
      ? [
          `Data: ${formatShareDate(input.event.startsAt)}`,
          `Cidade: ${input.event.cityName}`,
          input.event.location ? `Local: ${input.event.location}` : null,
        ].filter(Boolean).join("\n")
      : weeklyEvents.length
        ? weeklyEvents.slice(0, 20).map((event) => [
            `• ${formatShareDate(event.startsAt)} — ${event.title}`,
            `  Cidade: ${event.cityName}${event.location ? ` · ${event.location}` : ""}`,
          ].join("\n")).join("\n")
        : "Nenhum compromisso cadastrado para esta semana.",
    `Abrir agenda completa: ${agendaLink}`,
    `Preparada em: ${formatShareDate(new Date())}`,
  ].join("\n");

  const [notification, messageRows] = await db.transaction(async (tx) => {
    const [createdNotification] = await tx.insert(campaignWhatsappNotificationEventsTable).values({
      triggerType: input.triggerType,
      calendarEventId: input.event?.id ?? null,
      calendarShareId: input.share.id,
      recipientGroupId,
      dedupeKey: input.dedupeKey,
      createdByUserId: input.principal.user.id,
    }).returning({
      id: campaignWhatsappNotificationEventsTable.id,
      triggerType: campaignWhatsappNotificationEventsTable.triggerType,
      createdAt: campaignWhatsappNotificationEventsTable.createdAt,
    });
    const [batch] = await tx.insert(campaignWhatsappShareBatchesTable).values({
      kind: "calendar_automatic",
      calendarShareId: input.share.id,
      notificationEventId: createdNotification.id,
      createdByUserId: input.principal.user.id,
    }).returning({ id: campaignWhatsappShareBatchesTable.id });
    const inserted = await tx.insert(campaignWhatsappShareMessagesTable).values(recipients.map((recipient) => ({
      batchId: batch.id,
      recipientType: recipient.recipientType,
      recipientUserId: recipient.recipientUserId,
      recipientLeadershipId: recipient.recipientLeadershipId,
       recipientGroupMemberId: recipient.recipientGroupMemberId ?? null,
      recipientName: recipient.recipientName,
      phone: recipient.phone,
      message: lines,
      whatsappUrl: `https://wa.me/${recipient.phone}?text=${encodeURIComponent(lines)}`,
      status: "prepared",
    }))).returning({
      id: campaignWhatsappShareMessagesTable.id,
      recipientType: campaignWhatsappShareMessagesTable.recipientType,
      recipientName: campaignWhatsappShareMessagesTable.recipientName,
      phone: campaignWhatsappShareMessagesTable.phone,
      message: campaignWhatsappShareMessagesTable.message,
      whatsappUrl: campaignWhatsappShareMessagesTable.whatsappUrl,
      status: campaignWhatsappShareMessagesTable.status,
      openedAt: campaignWhatsappShareMessagesTable.openedAt,
    });
    return [createdNotification, inserted] as const;
  });
  return {
    id: notification.id,
    triggerType: notification.triggerType,
    createdAt: notification.createdAt,
    calendarShareId: input.share.id,
    shareToken: input.share.token,
    weekStart: input.share.weekStart,
    label: input.share.label,
    eventId: input.event?.id ?? null,
    eventTitle: input.event?.title ?? null,
    messages: messageRows,
  };
}

function appUrl(req: Express.Request): string {
  const request = req as unknown as { headers: Record<string, string | string[] | undefined> };
  const forwardedHeader = request.headers["x-forwarded-proto"];
  const forwardedHostHeader = request.headers["x-forwarded-host"];
  const forwardedProto = (Array.isArray(forwardedHeader) ? forwardedHeader[0] : forwardedHeader)?.split(",")[0]?.trim();
  const forwardedHost = Array.isArray(forwardedHostHeader) ? forwardedHostHeader[0] : forwardedHostHeader;
  const hostHeader = forwardedHost?.split(",")[0]?.trim() || request.headers.host || "localhost";
  return `${forwardedProto || "https"}://${hostHeader}`;
}

function formatShareDate(value: Date): string {
  return value.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  });
}

function recipientKey(recipient: { type: "user" | "leadership"; id: number }): string {
  return `${recipient.type}:${recipient.id}`;
}

function weekBounds(weekStart: string): { start: Date; end: Date } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) return null;
  const start = new Date(`${weekStart}T00:00:00-03:00`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

async function calendarShareRecipients(
  weekStart: string,
  principal: NonNullable<Express.Request["auth"]>,
) {
  const bounds = weekBounds(weekStart);
  if (!bounds) return [];
  const eventCities = await db
    .select({ cityId: campaignCalendarEventsTable.cityId })
    .from(campaignCalendarEventsTable)
    .innerJoin(citiesTable, eq(citiesTable.id, campaignCalendarEventsTable.cityId))
    .where(and(
      eq(campaignCalendarEventsTable.source, "google"),
      gte(campaignCalendarEventsTable.startsAt, bounds.start),
      lt(campaignCalendarEventsTable.startsAt, bounds.end),
      cityScopeCondition(principal),
    ));
  const cityIds = [...new Set(eventCities.map((event) => event.cityId))];
  if (!cityIds.length) return [];
  const [users, leaderships] = await Promise.all([
    db.select({
      id: authUsersTable.id,
      type: sql<"user">`'user'`,
      name: authUsersTable.fullName,
      role: authUsersTable.role,
      phone: authUsersTable.phone,
      email: authUsersTable.email,
    }).from(authUsersTable)
      .innerJoin(citiesTable, eq(citiesTable.id, authUsersTable.cityId))
      .where(and(
        eq(authUsersTable.isActive, true),
        inArray(authUsersTable.cityId, cityIds),
        sql`${authUsersTable.phone} is not null`,
        cityScopeCondition(principal),
      ))
      .orderBy(asc(authUsersTable.fullName)),
    db.select({
      id: leadershipsTable.id,
      type: sql<"leadership">`'leadership'`,
      name: leadershipsTable.name,
      role: sql<string>`'LIDERANCA'`,
      phone: leadershipsTable.leadershipContact,
      email: sql<string>`null`,
    }).from(leadershipsTable)
      .innerJoin(citiesTable, eq(citiesTable.id, leadershipsTable.cityId))
      .where(and(
        inArray(leadershipsTable.cityId, cityIds),
        sql`${leadershipsTable.leadershipContact} is not null`,
        cityScopeCondition(principal),
      ))
      .orderBy(asc(leadershipsTable.name)),
  ]);
  return [...users, ...leaderships].flatMap((recipient) => {
    const phone = normalizeWhatsAppPhone(recipient.phone);
    return phone ? [{ ...recipient, phone }] : [];
  });
}

function taskScope(principal: NonNullable<Express.Request["auth"]>) {
  return cityScopeCondition(principal);
}

function calendarShareScope(principal: NonNullable<Express.Request["auth"]>) {
  if (principal.user.role === "ADMIN_GERAL") {
    return { scopeType: "all", scopeRegionId: null, scopeCityId: null };
  }
  if (principal.user.role === "ARTICULADOR" && principal.user.regionId) {
    return { scopeType: "region", scopeRegionId: principal.user.regionId, scopeCityId: null };
  }
  if (principal.user.cityId) {
    return { scopeType: "city", scopeRegionId: null, scopeCityId: principal.user.cityId };
  }
  return { scopeType: "none", scopeRegionId: null, scopeCityId: null };
}

function calendarShareScopeCondition(share: {
  scopeType: string;
  scopeRegionId: number | null;
  scopeCityId: number | null;
}) {
  if (share.scopeType === "all") return undefined;
  if (share.scopeType === "region" && share.scopeRegionId) {
    return eq(citiesTable.regionId, share.scopeRegionId);
  }
  if (share.scopeType === "city" && share.scopeCityId) {
    return eq(citiesTable.id, share.scopeCityId);
  }
  return sql`false`;
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
      boardId: campaignTasksTable.boardId,
      boardName: campaignBoardsTable.title,
      cityId: campaignTasksTable.cityId,
      cityName: citiesTable.name,
      regionName: regionsTable.name,
      leadershipId: campaignTasksTable.leadershipId,
      leadershipName: leadershipsTable.name,
      leadershipContact: leadershipsTable.leadershipContact,
      assigneeUserId: campaignTasksTable.assigneeUserId,
      assigneeName: authUsersTable.fullName,
      createdByUserId: campaignTasksTable.createdByUserId,
      createdAt: campaignTasksTable.createdAt,
      updatedAt: campaignTasksTable.updatedAt,
    })
    .from(campaignTasksTable)
    .leftJoin(campaignBoardsTable, eq(campaignBoardsTable.id, campaignTasksTable.boardId))
    .leftJoin(citiesTable, eq(citiesTable.id, campaignTasksTable.cityId))
    .leftJoin(regionsTable, eq(regionsTable.id, citiesTable.regionId))
    .leftJoin(leadershipsTable, eq(leadershipsTable.id, campaignTasksTable.leadershipId))
    .leftJoin(authUsersTable, eq(authUsersTable.id, campaignTasksTable.assigneeUserId))
    .where(and(eq(campaignTasksTable.id, id), taskScope(principal)));
  return task;
}

async function boardById(id: number, principal: NonNullable<Express.Request["auth"]>) {
  const [board] = await db
    .select({
      id: campaignBoardsTable.id,
      title: campaignBoardsTable.title,
      description: campaignBoardsTable.description,
      cityId: campaignBoardsTable.cityId,
      cityName: citiesTable.name,
      regionName: regionsTable.name,
      archived: campaignBoardsTable.archived,
      createdByUserId: campaignBoardsTable.createdByUserId,
      createdAt: campaignBoardsTable.createdAt,
      updatedAt: campaignBoardsTable.updatedAt,
    })
    .from(campaignBoardsTable)
    .innerJoin(citiesTable, eq(citiesTable.id, campaignBoardsTable.cityId))
    .innerJoin(regionsTable, eq(regionsTable.id, citiesTable.regionId))
    .where(and(eq(campaignBoardsTable.id, id), cityScopeCondition(principal)));
  return board;
}

async function recordTaskActivity(
  taskId: number,
  actorUserId: number,
  action: string,
  detail?: string,
) {
  await db.insert(campaignTaskActivityTable).values({
    taskId,
    actorUserId,
    action,
    detail: detail ?? null,
  });
}

async function userInTaskCity(
  userId: number,
  cityId: number | null,
  principal: NonNullable<Express.Request["auth"]>,
) {
  if (!cityId) return undefined;
  const [user] = await db
    .select({ id: authUsersTable.id })
    .from(authUsersTable)
    .innerJoin(citiesTable, eq(citiesTable.id, authUsersTable.cityId))
    .where(and(
      eq(authUsersTable.id, userId),
      eq(authUsersTable.cityId, cityId),
      eq(authUsersTable.isActive, true),
      cityScopeCondition(principal),
    ));
  return user;
}

async function taskDetailById(id: number, principal: NonNullable<Express.Request["auth"]>) {
  const task = await taskById(id, principal);
  if (!task) return undefined;
  const [members, checklist, comments, activity] = await Promise.all([
    db.select({
      id: authUsersTable.id,
      fullName: authUsersTable.fullName,
      email: authUsersTable.email,
      role: authUsersTable.role,
      phone: authUsersTable.phone,
    }).from(campaignTaskMembersTable)
      .innerJoin(authUsersTable, eq(authUsersTable.id, campaignTaskMembersTable.userId))
      .where(eq(campaignTaskMembersTable.taskId, id))
      .orderBy(asc(authUsersTable.fullName)),
    db.select({
      id: campaignTaskChecklistItemsTable.id,
      title: campaignTaskChecklistItemsTable.title,
      completed: campaignTaskChecklistItemsTable.completed,
      position: campaignTaskChecklistItemsTable.position,
      createdAt: campaignTaskChecklistItemsTable.createdAt,
      updatedAt: campaignTaskChecklistItemsTable.updatedAt,
    }).from(campaignTaskChecklistItemsTable)
      .where(eq(campaignTaskChecklistItemsTable.taskId, id))
      .orderBy(asc(campaignTaskChecklistItemsTable.position), asc(campaignTaskChecklistItemsTable.createdAt)),
    db.select({
      id: campaignTaskCommentsTable.id,
      body: campaignTaskCommentsTable.body,
      createdAt: campaignTaskCommentsTable.createdAt,
      updatedAt: campaignTaskCommentsTable.updatedAt,
      userId: authUsersTable.id,
      userName: authUsersTable.fullName,
    }).from(campaignTaskCommentsTable)
      .innerJoin(authUsersTable, eq(authUsersTable.id, campaignTaskCommentsTable.userId))
      .where(eq(campaignTaskCommentsTable.taskId, id))
      .orderBy(asc(campaignTaskCommentsTable.createdAt)),
    db.select({
      id: campaignTaskActivityTable.id,
      action: campaignTaskActivityTable.action,
      detail: campaignTaskActivityTable.detail,
      createdAt: campaignTaskActivityTable.createdAt,
      actorUserId: authUsersTable.id,
      actorName: authUsersTable.fullName,
    }).from(campaignTaskActivityTable)
      .innerJoin(authUsersTable, eq(authUsersTable.id, campaignTaskActivityTable.actorUserId))
      .where(eq(campaignTaskActivityTable.taskId, id))
      .orderBy(desc(campaignTaskActivityTable.createdAt)),
  ]);
  return { ...task, members, checklist, comments, activity };
}

router.get(
  "/boards",
  requirePermission("boards:view"),
  async (req, res): Promise<void> => {
    const archived = req.query.archived === "true";
    const boards = await db
      .select({
        id: campaignBoardsTable.id,
        title: campaignBoardsTable.title,
        description: campaignBoardsTable.description,
        cityId: campaignBoardsTable.cityId,
        cityName: citiesTable.name,
        regionName: regionsTable.name,
        archived: campaignBoardsTable.archived,
        createdAt: campaignBoardsTable.createdAt,
        updatedAt: campaignBoardsTable.updatedAt,
      })
      .from(campaignBoardsTable)
      .innerJoin(citiesTable, eq(citiesTable.id, campaignBoardsTable.cityId))
      .innerJoin(regionsTable, eq(regionsTable.id, citiesTable.regionId))
      .where(and(eq(campaignBoardsTable.archived, archived), cityScopeCondition(req.auth!)))
      .orderBy(asc(citiesTable.name), desc(campaignBoardsTable.updatedAt));
    res.json(boards);
  },
);

router.get(
  "/boards/:id",
  requirePermission("boards:view"),
  async (req, res): Promise<void> => {
    const board = await boardById(Number(req.params.id), req.auth!);
    if (!board) {
      res.status(404).json({ error: "Quadro não encontrado." });
      return;
    }
    const [members, tasks] = await Promise.all([
      db.select({
        id: authUsersTable.id,
        fullName: authUsersTable.fullName,
        email: authUsersTable.email,
        role: authUsersTable.role,
      }).from(campaignBoardMembersTable)
        .innerJoin(authUsersTable, eq(authUsersTable.id, campaignBoardMembersTable.userId))
        .where(eq(campaignBoardMembersTable.boardId, board.id))
        .orderBy(asc(authUsersTable.fullName)),
      db.select({ id: campaignTasksTable.id })
        .from(campaignTasksTable)
        .where(eq(campaignTasksTable.boardId, board.id)),
    ]);
    res.json({ ...board, members, taskCount: tasks.length });
  },
);

router.post(
  "/boards",
  requirePermission("boards:create"),
  async (req, res): Promise<void> => {
    if (!record(req.body)) {
      res.status(400).json({ error: "Dados inválidos." });
      return;
    }
    const title = stringValue(req.body.title, true);
    const cityId = numberValue(req.body.cityId);
    if (!title || !cityId) {
      res.status(400).json({ error: "Título e cidade são obrigatórios." });
      return;
    }
    const [allowedCity] = await db.select({ id: citiesTable.id })
      .from(citiesTable)
      .where(and(eq(citiesTable.id, cityId), cityScopeCondition(req.auth!)));
    if (!allowedCity) {
      res.status(403).json({ error: "O território está fora do seu escopo." });
      return;
    }
    const [created] = await db.transaction(async (tx) => {
      const [board] = await tx.insert(campaignBoardsTable).values({
        title,
        description: stringValue(req.body.description),
        cityId,
        createdByUserId: req.auth!.user.id,
      }).returning({ id: campaignBoardsTable.id });
      await tx.insert(campaignBoardMembersTable).values({
        boardId: board.id,
        userId: req.auth!.user.id,
        addedByUserId: req.auth!.user.id,
      }).onConflictDoNothing();
      return [board];
    });
    res.status(201).json(await boardById(created.id, req.auth!));
  },
);

router.patch(
  "/boards/:id",
  requirePermission("boards:update"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    const existing = Number.isInteger(id) ? await boardById(id, req.auth!) : undefined;
    if (!existing) {
      res.status(404).json({ error: "Quadro não encontrado." });
      return;
    }
    if (!record(req.body)) {
      res.status(400).json({ error: "Dados inválidos." });
      return;
    }
    const updates: Partial<typeof campaignBoardsTable.$inferInsert> = {};
    if (req.body.title !== undefined) {
      const title = stringValue(req.body.title, true);
      if (!title) {
        res.status(400).json({ error: "O título não pode ficar vazio." });
        return;
      }
      updates.title = title;
    }
    if (req.body.description !== undefined) updates.description = stringValue(req.body.description);
    if (Object.keys(updates).length) await db.update(campaignBoardsTable).set(updates).where(eq(campaignBoardsTable.id, id));
    res.json(await boardById(id, req.auth!));
  },
);

router.post(
  "/boards/:id/archive",
  requirePermission("boards:archive"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    const existing = Number.isInteger(id) ? await boardById(id, req.auth!) : undefined;
    if (!existing) {
      res.status(404).json({ error: "Quadro não encontrado." });
      return;
    }
    const archived = record(req.body) && typeof req.body.archived === "boolean" ? req.body.archived : !existing.archived;
    await db.update(campaignBoardsTable).set({ archived, updatedAt: new Date() }).where(eq(campaignBoardsTable.id, id));
    res.json(await boardById(id, req.auth!));
  },
);

router.post(
  "/boards/:id/members",
  requirePermission("boards:update"),
  async (req, res): Promise<void> => {
    const board = await boardById(Number(req.params.id), req.auth!);
    const userId = record(req.body) ? numberValue(req.body.userId) : undefined;
    if (!board) {
      res.status(404).json({ error: "Quadro não encontrado." });
      return;
    }
    if (!userId) {
      res.status(400).json({ error: "Usuário inválido." });
      return;
    }
    const [user] = await db.select({ id: authUsersTable.id })
      .from(authUsersTable)
      .where(and(eq(authUsersTable.id, userId), eq(authUsersTable.cityId, board.cityId), eq(authUsersTable.isActive, true)));
    if (!user) {
      res.status(400).json({ error: "O usuário precisa estar ativo na cidade do quadro." });
      return;
    }
    await db.insert(campaignBoardMembersTable).values({
      boardId: board.id,
      userId,
      addedByUserId: req.auth!.user.id,
    }).onConflictDoNothing();
    res.status(201).json({ success: true });
  },
);

router.delete(
  "/boards/:id/members/:userId",
  requirePermission("boards:update"),
  async (req, res): Promise<void> => {
    const board = await boardById(Number(req.params.id), req.auth!);
    const userId = Number(req.params.userId);
    if (!board) {
      res.status(404).json({ error: "Quadro não encontrado." });
      return;
    }
    await db.delete(campaignBoardMembersTable).where(and(
      eq(campaignBoardMembersTable.boardId, board.id),
      eq(campaignBoardMembersTable.userId, userId),
    ));
    res.status(204).send();
  },
);

router.get(
  "/tasks/:id",
  requirePermission("tasks:view"),
  async (req, res): Promise<void> => {
    const task = await taskDetailById(Number(req.params.id), req.auth!);
    if (!task) {
      res.status(404).json({ error: "Tarefa não encontrada." });
      return;
    }
    res.json(task);
  },
);

router.get(
  "/tasks/:id/members/options",
  requirePermission("tasks:collaborate"),
  async (req, res): Promise<void> => {
    const task = await taskById(Number(req.params.id), req.auth!);
    if (!task || !task.cityId) {
      res.status(404).json({ error: "Tarefa não encontrada." });
      return;
    }
    const users = await db.select({
      id: authUsersTable.id,
      fullName: authUsersTable.fullName,
      email: authUsersTable.email,
      role: authUsersTable.role,
      phone: authUsersTable.phone,
    }).from(authUsersTable)
      .innerJoin(citiesTable, eq(citiesTable.id, authUsersTable.cityId))
      .where(and(eq(authUsersTable.cityId, task.cityId), eq(authUsersTable.isActive, true), cityScopeCondition(req.auth!)))
      .orderBy(asc(authUsersTable.fullName));
    res.json(users);
  },
);

router.post(
  "/tasks/:id/members",
  requirePermission("tasks:collaborate"),
  async (req, res): Promise<void> => {
    const task = await taskById(Number(req.params.id), req.auth!);
    const userId = record(req.body) ? numberValue(req.body.userId) : undefined;
    if (!task) {
      res.status(404).json({ error: "Tarefa não encontrada." });
      return;
    }
    if (!userId || !task.cityId) {
      res.status(400).json({ error: "Usuário inválido." });
      return;
    }
    const [user] = await db.select({ id: authUsersTable.id })
      .from(authUsersTable)
      .where(and(eq(authUsersTable.id, userId), eq(authUsersTable.cityId, task.cityId), eq(authUsersTable.isActive, true)));
    if (!user) {
      res.status(400).json({ error: "O usuário precisa estar ativo na cidade da tarefa." });
      return;
    }
    await db.insert(campaignTaskMembersTable).values({
      taskId: task.id,
      userId,
      addedByUserId: req.auth!.user.id,
    }).onConflictDoNothing();
    await recordTaskActivity(task.id, req.auth!.user.id, "member_added", `Membro adicionado: ${userId}.`);
    res.status(201).json({ success: true });
  },
);

router.delete(
  "/tasks/:id/members/:userId",
  requirePermission("tasks:collaborate"),
  async (req, res): Promise<void> => {
    const task = await taskById(Number(req.params.id), req.auth!);
    const userId = Number(req.params.userId);
    if (!task) {
      res.status(404).json({ error: "Tarefa não encontrada." });
      return;
    }
    await db.delete(campaignTaskMembersTable).where(and(
      eq(campaignTaskMembersTable.taskId, task.id),
      eq(campaignTaskMembersTable.userId, userId),
    ));
    await recordTaskActivity(task.id, req.auth!.user.id, "member_removed", `Membro removido: ${userId}.`);
    res.status(204).send();
  },
);

router.post(
  "/tasks/:id/checklist",
  requirePermission("tasks:collaborate"),
  async (req, res): Promise<void> => {
    const task = await taskById(Number(req.params.id), req.auth!);
    const title = record(req.body) ? stringValue(req.body.title, true) : null;
    if (!task) {
      res.status(404).json({ error: "Tarefa não encontrada." });
      return;
    }
    if (!title) {
      res.status(400).json({ error: "O item do checklist não pode ficar vazio." });
      return;
    }
    const [last] = await db.select({ position: campaignTaskChecklistItemsTable.position })
      .from(campaignTaskChecklistItemsTable)
      .where(eq(campaignTaskChecklistItemsTable.taskId, task.id))
      .orderBy(desc(campaignTaskChecklistItemsTable.position))
      .limit(1);
    const [item] = await db.insert(campaignTaskChecklistItemsTable).values({
      taskId: task.id,
      title,
      position: (last?.position ?? -1) + 1,
      createdByUserId: req.auth!.user.id,
    }).returning();
    await recordTaskActivity(task.id, req.auth!.user.id, "checklist_added", title);
    res.status(201).json(item);
  },
);

router.patch(
  "/tasks/:id/checklist/:itemId",
  requirePermission("tasks:collaborate"),
  async (req, res): Promise<void> => {
    const task = await taskById(Number(req.params.id), req.auth!);
    const itemId = Number(req.params.itemId);
    if (!task) {
      res.status(404).json({ error: "Tarefa não encontrada." });
      return;
    }
    const [item] = await db.select().from(campaignTaskChecklistItemsTable).where(and(
      eq(campaignTaskChecklistItemsTable.id, itemId),
      eq(campaignTaskChecklistItemsTable.taskId, task.id),
    ));
    if (!item) {
      res.status(404).json({ error: "Item do checklist não encontrado." });
      return;
    }
    const updates: Partial<typeof campaignTaskChecklistItemsTable.$inferInsert> = {};
    if (record(req.body) && typeof req.body.title === "string") {
      const title = stringValue(req.body.title, true);
      if (!title) {
        res.status(400).json({ error: "O item do checklist não pode ficar vazio." });
        return;
      }
      updates.title = title;
    }
    if (record(req.body) && typeof req.body.completed === "boolean") updates.completed = req.body.completed;
    if (Object.keys(updates).length) await db.update(campaignTaskChecklistItemsTable).set(updates).where(eq(campaignTaskChecklistItemsTable.id, item.id));
    await recordTaskActivity(task.id, req.auth!.user.id, "checklist_updated", updates.completed === undefined ? item.title : `${item.title}: ${updates.completed ? "concluído" : "reaberto"}`);
    const [updated] = await db.select().from(campaignTaskChecklistItemsTable).where(eq(campaignTaskChecklistItemsTable.id, item.id));
    res.json(updated);
  },
);

router.delete(
  "/tasks/:id/checklist/:itemId",
  requirePermission("tasks:collaborate"),
  async (req, res): Promise<void> => {
    const task = await taskById(Number(req.params.id), req.auth!);
    const itemId = Number(req.params.itemId);
    if (!task) {
      res.status(404).json({ error: "Tarefa não encontrada." });
      return;
    }
    const [item] = await db.select({ title: campaignTaskChecklistItemsTable.title })
      .from(campaignTaskChecklistItemsTable)
      .where(and(eq(campaignTaskChecklistItemsTable.id, itemId), eq(campaignTaskChecklistItemsTable.taskId, task.id)));
    if (!item) {
      res.status(404).json({ error: "Item do checklist não encontrado." });
      return;
    }
    await db.delete(campaignTaskChecklistItemsTable).where(eq(campaignTaskChecklistItemsTable.id, itemId));
    await recordTaskActivity(task.id, req.auth!.user.id, "checklist_removed", item.title);
    res.status(204).send();
  },
);

router.post(
  "/tasks/:id/comments",
  requirePermission("tasks:collaborate"),
  async (req, res): Promise<void> => {
    const task = await taskById(Number(req.params.id), req.auth!);
    const body = record(req.body) ? stringValue(req.body.body, true) : null;
    if (!task) {
      res.status(404).json({ error: "Tarefa não encontrada." });
      return;
    }
    if (!body) {
      res.status(400).json({ error: "O comentário não pode ficar vazio." });
      return;
    }
    const [comment] = await db.insert(campaignTaskCommentsTable).values({
      taskId: task.id,
      userId: req.auth!.user.id,
      body,
    }).returning();
    await recordTaskActivity(task.id, req.auth!.user.id, "commented", body.slice(0, 120));
    res.status(201).json(comment);
  },
);

router.get(
  "/tasks",
  requirePermission("tasks:view"),
  async (req, res): Promise<void> => {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const conditions = [taskScope(req.auth!)];
    const requestedBoardId = numberValue(req.query.boardId);
    if (requestedBoardId) conditions.push(eq(campaignTasksTable.boardId, requestedBoardId));
    if (typeof req.query.status === "string" && ["todo", "in_progress", "blocked", "done"].includes(req.query.status)) {
      conditions.push(eq(campaignTasksTable.status, req.query.status));
    }
    const requestedAssignee = typeof req.query.assignee === "string" ? req.query.assignee : req.query.assigneeUserId;
    if (requestedAssignee === "none") {
      conditions.push(isNull(campaignTasksTable.assigneeUserId));
    } else {
      const requestedAssigneeId = numberValue(requestedAssignee);
      if (requestedAssigneeId) conditions.push(eq(campaignTasksTable.assigneeUserId, requestedAssigneeId));
    }
    if (typeof req.query.priority === "string" && ["low", "normal", "high", "urgent"].includes(req.query.priority)) {
      conditions.push(eq(campaignTasksTable.priority, req.query.priority));
    }
    const dueFilter = typeof req.query.due === "string" ? req.query.due : "";
    const now = new Date();
    if (dueFilter === "overdue") {
      conditions.push(and(lt(campaignTasksTable.dueAt, now), sql`${campaignTasksTable.dueAt} IS NOT NULL`));
    } else if (dueFilter === "today") {
      const startOfToday = new Date(now);
      startOfToday.setUTCHours(0, 0, 0, 0);
      const startOfTomorrow = new Date(startOfToday);
      startOfTomorrow.setUTCDate(startOfTomorrow.getUTCDate() + 1);
      conditions.push(and(gte(campaignTasksTable.dueAt, startOfToday), lt(campaignTasksTable.dueAt, startOfTomorrow)));
    } else if (dueFilter === "next_7_days") {
      const endOfWindow = new Date(now);
      endOfWindow.setUTCDate(endOfWindow.getUTCDate() + 7);
      conditions.push(and(gte(campaignTasksTable.dueAt, now), lt(campaignTasksTable.dueAt, endOfWindow)));
    } else if (dueFilter === "none") {
      conditions.push(isNull(campaignTasksTable.dueAt));
    }
    if (search) {
      const pattern = `%${search}%`;
      conditions.push(or(
        ilike(campaignTasksTable.title, pattern),
        ilike(campaignTasksTable.description, pattern),
        ilike(citiesTable.name, pattern),
        ilike(campaignBoardsTable.title, pattern),
        ilike(leadershipsTable.name, pattern),
        ilike(authUsersTable.fullName, pattern),
      ));
    }
    const rows = await db
      .select({
        id: campaignTasksTable.id,
        title: campaignTasksTable.title,
        description: campaignTasksTable.description,
        status: campaignTasksTable.status,
        priority: campaignTasksTable.priority,
        dueAt: campaignTasksTable.dueAt,
        boardId: campaignTasksTable.boardId,
        boardName: campaignBoardsTable.title,
        cityId: campaignTasksTable.cityId,
        cityName: citiesTable.name,
        regionName: regionsTable.name,
        leadershipId: campaignTasksTable.leadershipId,
        leadershipName: leadershipsTable.name,
        leadershipContact: leadershipsTable.leadershipContact,
        assigneeUserId: campaignTasksTable.assigneeUserId,
        assigneeName: authUsersTable.fullName,
        createdAt: campaignTasksTable.createdAt,
      })
      .from(campaignTasksTable)
      .leftJoin(campaignBoardsTable, eq(campaignBoardsTable.id, campaignTasksTable.boardId))
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
    if (!title || !cityId || !leadershipId) {
      res.status(400).json({ error: "Título, cidade e liderança responsável são obrigatórios." });
      return;
    }
    const [leadership] = await db.select({
      cityId: leadershipsTable.cityId,
      leadershipContact: leadershipsTable.leadershipContact,
    }).from(leadershipsTable).where(eq(leadershipsTable.id, leadershipId));
    if (!leadership || leadership.cityId !== cityId) {
      res.status(400).json({ error: "A liderança selecionada não pertence à cidade informada." });
      return;
    }
    const [allowedCity] = await db.select({ id: citiesTable.id }).from(citiesTable).where(and(eq(citiesTable.id, cityId), cityScopeCondition(req.auth!)));
    if (!allowedCity) {
      res.status(403).json({ error: "O território está fora do seu escopo." });
      return;
    }
    const boardId = numberValue(req.body.boardId) ?? null;
    if (boardId) {
      const board = await boardById(boardId, req.auth!);
      if (!board || board.archived || board.cityId !== cityId) {
        res.status(400).json({ error: "O quadro selecionado não pertence à cidade ou está arquivado." });
        return;
      }
    }
    const dueAt = req.body.dueAt === null ? null : dateValue(req.body.dueAt);
    const leadershipPhone = stringValue(req.body.leadershipPhone);
    if (leadershipPhone && !normalizeWhatsAppPhone(leadershipPhone)) {
      res.status(400).json({ error: "Informe um telefone válido com DDD para a liderança." });
      return;
    }
    const assigneeUserId = numberValue(req.body.assigneeUserId) ?? null;
    if (assigneeUserId && !(await userInTaskCity(assigneeUserId, cityId, req.auth!))) {
      res.status(400).json({ error: "O responsável precisa estar ativo no território da tarefa." });
      return;
    }
    const [created] = await db.transaction(async (tx) => {
      if (leadershipPhone && !leadership.leadershipContact) {
        await tx.update(leadershipsTable)
          .set({ leadershipContact: leadershipPhone, updatedAt: new Date() })
          .where(eq(leadershipsTable.id, leadershipId));
      }
      return tx.insert(campaignTasksTable).values({
        title,
        description: stringValue(req.body.description),
        status: ["todo", "in_progress", "blocked", "done"].includes(String(req.body.status)) ? String(req.body.status) : "todo",
        priority: ["low", "normal", "high", "urgent"].includes(String(req.body.priority)) ? String(req.body.priority) : "normal",
        dueAt,
        boardId,
        cityId,
        leadershipId,
        assigneeUserId,
        createdByUserId: req.auth!.user.id,
      }).returning({ id: campaignTasksTable.id });
    });
    await recordTaskActivity(created.id, req.auth!.user.id, "created", "Tarefa criada.");
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
    if (req.body.assigneeUserId !== undefined) {
      const assigneeUserId = numberValue(req.body.assigneeUserId) ?? null;
      if (assigneeUserId && !(await userInTaskCity(assigneeUserId, existing.cityId, req.auth!))) {
        res.status(400).json({ error: "O responsável precisa estar ativo no território da tarefa." });
        return;
      }
      updates.assigneeUserId = assigneeUserId;
    }
    if (req.body.boardId !== undefined) {
      const boardId = numberValue(req.body.boardId) ?? null;
      if (boardId) {
        const board = await boardById(boardId, req.auth!);
        if (!board || board.archived || board.cityId !== existing.cityId) {
          res.status(400).json({ error: "O quadro selecionado não pertence à cidade ou está arquivado." });
          return;
        }
      }
      updates.boardId = boardId;
    }
    if (Object.keys(updates).length) await db.update(campaignTasksTable).set(updates).where(eq(campaignTasksTable.id, id));
    if (Object.keys(updates).length) {
      const changedFields = Object.keys(updates).join(", ");
      await recordTaskActivity(id, req.auth!.user.id, "updated", `Campos atualizados: ${changedFields}.`);
    }
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
        type: sql<"user">`'user'`,
        role: authUsersTable.role,
        phone: authUsersTable.phone,
        email: authUsersTable.email,
      })
      .from(authUsersTable)
      .where(and(eq(authUsersTable.isActive, true), sql`${authUsersTable.phone} is not null`, task.cityId ? eq(authUsersTable.cityId, task.cityId) : sql`false`));
    const campaignContacts = task.cityId && task.leadershipId
      ? await db.select({
          id: leadershipsTable.id,
          name: leadershipsTable.name,
          type: sql<"leadership">`'leadership'`,
          phone: leadershipsTable.leadershipContact,
          role: sql<string>`'LIDERANCA'`,
          email: sql<string>`null`,
        }).from(leadershipsTable).where(and(eq(leadershipsTable.id, task.leadershipId), sql`${leadershipsTable.leadershipContact} is not null`))
      : [];
    res.json(
      [...rows, ...campaignContacts].flatMap((recipient) => {
        const phone = normalizeWhatsAppPhone(recipient.phone);
        return phone ? [{ ...recipient, phone }] : [];
      }),
    );
  },
);

router.get(
  "/tasks/:id/share-preparations",
  requirePermission("tasks:share"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    const task = Number.isInteger(id) ? await taskById(id, req.auth!) : undefined;
    if (!task) {
      res.status(404).json({ error: "Tarefa não encontrada." });
      return;
    }
    const batches = await db
      .select({
        id: campaignWhatsappShareBatchesTable.id,
        createdAt: campaignWhatsappShareBatchesTable.createdAt,
        createdByName: authUsersTable.fullName,
      })
      .from(campaignWhatsappShareBatchesTable)
      .innerJoin(authUsersTable, eq(authUsersTable.id, campaignWhatsappShareBatchesTable.createdByUserId))
      .where(and(eq(campaignWhatsappShareBatchesTable.kind, "task"), eq(campaignWhatsappShareBatchesTable.taskId, id)))
      .orderBy(desc(campaignWhatsappShareBatchesTable.createdAt))
      .limit(20);
    const history = await Promise.all(batches.map(async (batch) => ({
      ...batch,
      messages: await db.select({
        id: campaignWhatsappShareMessagesTable.id,
        recipientType: campaignWhatsappShareMessagesTable.recipientType,
        recipientName: campaignWhatsappShareMessagesTable.recipientName,
        phone: campaignWhatsappShareMessagesTable.phone,
        message: campaignWhatsappShareMessagesTable.message,
        whatsappUrl: campaignWhatsappShareMessagesTable.whatsappUrl,
      }).from(campaignWhatsappShareMessagesTable)
        .where(eq(campaignWhatsappShareMessagesTable.batchId, batch.id))
        .orderBy(asc(campaignWhatsappShareMessagesTable.id)),
    })));
    res.json(history);
  },
);

router.post(
  "/tasks/:id/share-preparations",
  requirePermission("tasks:share"),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    const task = Number.isInteger(id) ? await taskById(id, req.auth!) : undefined;
    const requested = record(req.body) ? parseShareRecipients(req.body.recipients) : null;
    if (!task) {
      res.status(404).json({ error: "Tarefa não encontrada." });
      return;
    }
    if (!requested?.length) {
      res.status(400).json({ error: "Selecione pelo menos um destinatário." });
      return;
    }
    const available = await db
      .select({
        id: authUsersTable.id,
        type: sql<"user">`'user'`,
        name: authUsersTable.fullName,
        phone: authUsersTable.phone,
      })
      .from(authUsersTable)
      .where(and(
        eq(authUsersTable.isActive, true),
        sql`${authUsersTable.phone} is not null`,
        task.cityId ? eq(authUsersTable.cityId, task.cityId) : sql`false`,
        inArray(authUsersTable.id, requested.filter((item) => item.type === "user").map((item) => item.id).concat([-1])),
      ));
    const leaderships = task.cityId
      ? await db.select({
          id: leadershipsTable.id,
          type: sql<"leadership">`'leadership'`,
          name: leadershipsTable.name,
          phone: leadershipsTable.leadershipContact,
        }).from(leadershipsTable).where(and(
          eq(leadershipsTable.id, task.leadershipId ?? -1),
          sql`${leadershipsTable.leadershipContact} is not null`,
          inArray(leadershipsTable.id, requested.filter((item) => item.type === "leadership").map((item) => item.id).concat([-1])),
        ))
      : [];
    const candidates = [...available, ...leaderships].flatMap((item) => {
      const phone = normalizeWhatsAppPhone(item.phone);
      return phone ? [{ ...item, phone }] : [];
    });
    const candidateByKey = new Map(candidates.map((item) => [recipientKey({ type: item.type, id: item.id }), item]));
    const selected = requested.map((item) => candidateByKey.get(recipientKey(item))).filter((item): item is NonNullable<typeof item> => Boolean(item));
    if (selected.length !== requested.length) {
      res.status(400).json({ error: "Um ou mais destinatários não estão mais disponíveis para esta tarefa." });
      return;
    }
    const taskLink = `${appUrl(req)}/kanban?boardId=${task.boardId ?? ""}&taskId=${task.id}`;
    const messages = selected.map((recipient) => {
      const message = [
        `EA 2026 — tarefa: ${task.title}`,
        task.description ? `Detalhes: ${task.description}` : "",
        task.cityName ? `Cidade: ${task.cityName}${task.regionName ? ` / ${task.regionName}` : ""}` : "",
        task.leadershipName ? `Liderança: ${task.leadershipName}` : "",
        task.dueAt ? `Prazo: ${formatShareDate(new Date(task.dueAt))}` : "",
        `Status: ${task.status === "todo" ? "A fazer" : task.status === "in_progress" ? "Em andamento" : task.status === "blocked" ? "Bloqueada" : "Concluída"}`,
        `Abrir tarefa: ${taskLink}`,
      ].filter(Boolean).join("\n");
      return {
        recipientType: recipient.type,
        recipientUserId: recipient.type === "user" ? recipient.id : null,
        recipientLeadershipId: recipient.type === "leadership" ? recipient.id : null,
        recipientName: recipient.name ?? "Destinatário",
        phone: recipient.phone,
        message,
        whatsappUrl: `https://wa.me/${recipient.phone}?text=${encodeURIComponent(message)}`,
      };
    });
    const batch = await db.transaction(async (tx) => {
      const [createdBatch] = await tx.insert(campaignWhatsappShareBatchesTable).values({
        kind: "task",
        taskId: task.id,
        createdByUserId: req.auth!.user.id,
      }).returning({ id: campaignWhatsappShareBatchesTable.id, createdAt: campaignWhatsappShareBatchesTable.createdAt });
      await tx.insert(campaignWhatsappShareMessagesTable).values(messages.map((message) => ({ ...message, batchId: createdBatch.id })));
      return createdBatch;
    });
    res.status(201).json({
      batch: { ...batch, createdByName: req.auth!.user.fullName },
      messages: messages.map((message, index) => ({ id: index + 1, ...message })),
    });
  },
);

router.get(
  "/calendar/events",
  requirePermission("calendar:view"),
  async (req, res): Promise<void> => {
    const events = await db
      .select({
        id: campaignCalendarEventsTable.id,
        source: campaignCalendarEventsTable.source,
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
        syncStatus: campaignCalendarEventsTable.syncStatus,
        lastSyncedAt: campaignCalendarEventsTable.lastSyncedAt,
        lastSyncError: campaignCalendarEventsTable.lastSyncError,
      })
      .from(campaignCalendarEventsTable)
      .innerJoin(citiesTable, eq(citiesTable.id, campaignCalendarEventsTable.cityId))
      .innerJoin(regionsTable, eq(regionsTable.id, citiesTable.regionId))
      .where(and(eq(campaignCalendarEventsTable.source, "google"), cityScopeCondition(req.auth!)))
      .orderBy(asc(campaignCalendarEventsTable.startsAt));
    res.json(events);
  },
);

router.get(
  "/calendar/sync-status",
  requirePermission("calendar:view"),
  async (_req, res): Promise<void> => {
    const states = await db.select().from(campaignCalendarSyncStateTable)
      .where(eq(campaignCalendarSyncStateTable.provider, "google"));
    res.json({
      states,
      sourceRules: [
        { source: "google", truth: "Google Calendar é a fonte dos eventos criados na Agenda.", flow: "Google Calendar → Agenda; Agenda → Google Calendar ao criar." },
        { source: "agenda", truth: "A Agenda é a visão operacional filtrada por cidade/território.", flow: "Não é uma terceira fonte de sincronização." },
      ],
    });
  },
);

router.post(
  "/calendar/shares",
  requirePermission("calendar:manage"),
  async (req, res): Promise<void> => {
    if (!record(req.body) || typeof req.body.weekStart !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(req.body.weekStart)) {
      res.status(400).json({ error: "A semana da agenda é obrigatória." });
      return;
    }
    const { share, created } = await calendarShareForScope(
      req.body.weekStart,
      req.auth!,
      stringValue(req.body.label) ?? "Agenda semanal",
    );
    const notification = created
      ? await automaticCalendarNotification({
          triggerType: "weekly_share_created",
          dedupeKey: `weekly_share_created:${share.id}`,
          share,
          principal: req.auth!,
          request: req,
        })
      : null;
    res.status(201).json({ ...share, created, notification });
  },
);

router.get(
  "/calendar/share-recipients",
  requirePermission("calendar:manage"),
  async (req, res): Promise<void> => {
    const weekStart = typeof req.query.weekStart === "string" ? req.query.weekStart : "";
    if (!weekBounds(weekStart)) {
      res.status(400).json({ error: "A semana da agenda é inválida." });
      return;
    }
    res.json(await calendarShareRecipients(weekStart, req.auth!));
  },
);

router.get(
  "/calendar/share-history",
  requirePermission("calendar:manage"),
  async (req, res): Promise<void> => {
    const weekStart = typeof req.query.weekStart === "string" ? req.query.weekStart : "";
    if (!weekBounds(weekStart)) {
      res.status(400).json({ error: "A semana da agenda é inválida." });
      return;
    }
    const shares = await db
      .select({
        id: campaignWhatsappShareBatchesTable.id,
        createdAt: campaignWhatsappShareBatchesTable.createdAt,
        createdByName: authUsersTable.fullName,
        shareToken: campaignCalendarSharesTable.token,
        weekStart: campaignCalendarSharesTable.weekStart,
      })
      .from(campaignWhatsappShareBatchesTable)
      .innerJoin(authUsersTable, eq(authUsersTable.id, campaignWhatsappShareBatchesTable.createdByUserId))
      .innerJoin(campaignCalendarSharesTable, eq(campaignCalendarSharesTable.id, campaignWhatsappShareBatchesTable.calendarShareId))
      .where(and(
        inArray(campaignWhatsappShareBatchesTable.kind, ["calendar", "calendar_automatic"]),
        eq(campaignCalendarSharesTable.weekStart, weekStart),
        req.auth!.user.role === "ADMIN_GERAL"
          ? undefined
          : eq(campaignWhatsappShareBatchesTable.createdByUserId, req.auth!.user.id),
      ))
      .orderBy(desc(campaignWhatsappShareBatchesTable.createdAt))
      .limit(20);
    res.json(await Promise.all(shares.map(async (share) => ({
      ...share,
      messages: await db.select({
        id: campaignWhatsappShareMessagesTable.id,
        recipientType: campaignWhatsappShareMessagesTable.recipientType,
        recipientName: campaignWhatsappShareMessagesTable.recipientName,
        phone: campaignWhatsappShareMessagesTable.phone,
        message: campaignWhatsappShareMessagesTable.message,
        whatsappUrl: campaignWhatsappShareMessagesTable.whatsappUrl,
         status: campaignWhatsappShareMessagesTable.status,
         openedAt: campaignWhatsappShareMessagesTable.openedAt,
      }).from(campaignWhatsappShareMessagesTable)
        .where(eq(campaignWhatsappShareMessagesTable.batchId, share.id))
        .orderBy(asc(campaignWhatsappShareMessagesTable.id)),
    }))));
  },
);

router.get(
  "/calendar/notifications",
  requirePermission("calendar:manage"),
  async (req, res): Promise<void> => {
    const batches = await db
      .select({
        notificationId: campaignWhatsappNotificationEventsTable.id,
        triggerType: campaignWhatsappNotificationEventsTable.triggerType,
        createdAt: campaignWhatsappNotificationEventsTable.createdAt,
        eventId: campaignWhatsappNotificationEventsTable.calendarEventId,
        eventTitle: campaignCalendarEventsTable.title,
        eventCityName: citiesTable.name,
        shareId: campaignCalendarSharesTable.id,
        shareToken: campaignCalendarSharesTable.token,
        shareLabel: campaignCalendarSharesTable.label,
        weekStart: campaignCalendarSharesTable.weekStart,
        createdByName: authUsersTable.fullName,
        createdByUserId: campaignWhatsappShareBatchesTable.createdByUserId,
        batchId: campaignWhatsappShareBatchesTable.id,
      })
      .from(campaignWhatsappShareBatchesTable)
      .innerJoin(campaignWhatsappNotificationEventsTable, eq(campaignWhatsappNotificationEventsTable.id, campaignWhatsappShareBatchesTable.notificationEventId))
      .innerJoin(authUsersTable, eq(authUsersTable.id, campaignWhatsappShareBatchesTable.createdByUserId))
      .leftJoin(campaignCalendarSharesTable, eq(campaignCalendarSharesTable.id, campaignWhatsappShareBatchesTable.calendarShareId))
      .leftJoin(campaignCalendarEventsTable, eq(campaignCalendarEventsTable.id, campaignWhatsappNotificationEventsTable.calendarEventId))
      .leftJoin(citiesTable, eq(citiesTable.id, campaignCalendarEventsTable.cityId))
      .where(and(
        inArray(campaignWhatsappShareBatchesTable.kind, ["calendar_automatic"]),
        req.auth!.user.role === "ADMIN_GERAL"
          ? undefined
          : eq(campaignWhatsappShareBatchesTable.createdByUserId, req.auth!.user.id),
      ))
      .orderBy(desc(campaignWhatsappNotificationEventsTable.createdAt))
      .limit(30);
    res.json(await Promise.all(batches.map(async (batch) => ({
      ...batch,
      messages: await db.select({
        id: campaignWhatsappShareMessagesTable.id,
        recipientType: campaignWhatsappShareMessagesTable.recipientType,
        recipientName: campaignWhatsappShareMessagesTable.recipientName,
        phone: campaignWhatsappShareMessagesTable.phone,
        message: campaignWhatsappShareMessagesTable.message,
        whatsappUrl: campaignWhatsappShareMessagesTable.whatsappUrl,
        status: campaignWhatsappShareMessagesTable.status,
        openedAt: campaignWhatsappShareMessagesTable.openedAt,
      }).from(campaignWhatsappShareMessagesTable)
        .where(eq(campaignWhatsappShareMessagesTable.batchId, batch.batchId))
        .orderBy(asc(campaignWhatsappShareMessagesTable.id)),
    }))));
  },
);

router.post(
  "/calendar/notification-messages/:id/opened",
  requirePermission("calendar:manage"),
  async (req, res): Promise<void> => {
    const messageId = Number(req.params.id);
    if (!Number.isInteger(messageId) || messageId <= 0) {
      res.status(400).json({ error: "Mensagem inválida." });
      return;
    }
    const [message] = await db
      .select({ id: campaignWhatsappShareMessagesTable.id })
      .from(campaignWhatsappShareMessagesTable)
      .innerJoin(campaignWhatsappShareBatchesTable, eq(campaignWhatsappShareBatchesTable.id, campaignWhatsappShareMessagesTable.batchId))
      .where(and(
        eq(campaignWhatsappShareMessagesTable.id, messageId),
        inArray(campaignWhatsappShareBatchesTable.kind, ["calendar", "calendar_automatic"]),
        req.auth!.user.role === "ADMIN_GERAL"
          ? undefined
          : eq(campaignWhatsappShareBatchesTable.createdByUserId, req.auth!.user.id),
      ));
    if (!message) {
      res.status(404).json({ error: "Mensagem não encontrada." });
      return;
    }
    const [updated] = await db.update(campaignWhatsappShareMessagesTable).set({
      status: "opened",
      openedAt: new Date(),
      openedByUserId: req.auth!.user.id,
    }).where(eq(campaignWhatsappShareMessagesTable.id, messageId)).returning({
      id: campaignWhatsappShareMessagesTable.id,
      status: campaignWhatsappShareMessagesTable.status,
      openedAt: campaignWhatsappShareMessagesTable.openedAt,
    });
    res.json(updated);
  },
);

router.post(
  "/calendar/shares/:id/share-preparations",
  requirePermission("calendar:manage"),
  async (req, res): Promise<void> => {
    const shareId = Number(req.params.id);
    const requested = record(req.body) ? parseShareRecipients(req.body.recipients) : null;
    if (!Number.isInteger(shareId) || shareId <= 0 || !requested?.length) {
      res.status(400).json({ error: "Agenda ou destinatários inválidos." });
      return;
    }
    const [share] = await db.select({
      id: campaignCalendarSharesTable.id,
      token: campaignCalendarSharesTable.token,
      weekStart: campaignCalendarSharesTable.weekStart,
      label: campaignCalendarSharesTable.label,
      scopeType: campaignCalendarSharesTable.scopeType,
      scopeRegionId: campaignCalendarSharesTable.scopeRegionId,
      scopeCityId: campaignCalendarSharesTable.scopeCityId,
    }).from(campaignCalendarSharesTable).where(and(
      eq(campaignCalendarSharesTable.id, shareId),
      eq(campaignCalendarSharesTable.active, true),
      req.auth!.user.role === "ADMIN_GERAL"
        ? undefined
        : eq(campaignCalendarSharesTable.createdByUserId, req.auth!.user.id),
    ));
    if (!share || !weekBounds(share.weekStart)) {
      res.status(404).json({ error: "Link da agenda não encontrado." });
      return;
    }
    const available = await calendarShareRecipients(share.weekStart, req.auth!);
    const availableByKey = new Map(available.map((item) => [recipientKey({ type: item.type, id: item.id }), item]));
    const selected = requested.map((item) => availableByKey.get(recipientKey(item))).filter((item): item is NonNullable<typeof item> => Boolean(item));
    if (selected.length !== requested.length) {
      res.status(400).json({ error: "Um ou mais destinatários não estão disponíveis para esta agenda." });
      return;
    }
    const bounds = weekBounds(share.weekStart)!;
    const events = await db.select({
      title: campaignCalendarEventsTable.title,
      startsAt: campaignCalendarEventsTable.startsAt,
      cityName: citiesTable.name,
    }).from(campaignCalendarEventsTable)
      .innerJoin(citiesTable, eq(citiesTable.id, campaignCalendarEventsTable.cityId))
      .where(and(
        eq(campaignCalendarEventsTable.source, "google"),
        gte(campaignCalendarEventsTable.startsAt, bounds.start),
        lt(campaignCalendarEventsTable.startsAt, bounds.end),
        calendarShareScopeCondition(share),
      ))
      .orderBy(asc(campaignCalendarEventsTable.startsAt));
    const agendaLink = `${appUrl(req)}/agenda/compartilhada/${share.token}`;
    const eventLines = events.slice(0, 20).map((event) => `• ${formatShareDate(new Date(event.startsAt))} — ${event.title} (${event.cityName})`);
    const messages = selected.map((recipient) => {
      const message = [
        `EA 2026 — ${share.label}`,
        eventLines.length ? eventLines.join("\n") : "Nenhum compromisso cadastrado para esta semana.",
        `Abrir agenda completa: ${agendaLink}`,
      ].join("\n");
      return {
        recipientType: recipient.type,
        recipientUserId: recipient.type === "user" ? recipient.id : null,
        recipientLeadershipId: recipient.type === "leadership" ? recipient.id : null,
        recipientName: recipient.name ?? "Destinatário",
        phone: recipient.phone,
        message,
        whatsappUrl: `https://wa.me/${recipient.phone}?text=${encodeURIComponent(message)}`,
      };
    });
    const batch = await db.transaction(async (tx) => {
      const [createdBatch] = await tx.insert(campaignWhatsappShareBatchesTable).values({
        kind: "calendar",
        calendarShareId: share.id,
        createdByUserId: req.auth!.user.id,
      }).returning({ id: campaignWhatsappShareBatchesTable.id, createdAt: campaignWhatsappShareBatchesTable.createdAt });
      const insertedMessages = await tx.insert(campaignWhatsappShareMessagesTable).values(messages.map((message) => ({ ...message, batchId: createdBatch.id }))).returning({
        id: campaignWhatsappShareMessagesTable.id,
        recipientType: campaignWhatsappShareMessagesTable.recipientType,
        recipientName: campaignWhatsappShareMessagesTable.recipientName,
        phone: campaignWhatsappShareMessagesTable.phone,
        message: campaignWhatsappShareMessagesTable.message,
        whatsappUrl: campaignWhatsappShareMessagesTable.whatsappUrl,
        status: campaignWhatsappShareMessagesTable.status,
        openedAt: campaignWhatsappShareMessagesTable.openedAt,
      });
      return { batch: createdBatch, messages: insertedMessages };
    });
    res.status(201).json({
      batch: { ...batch.batch, createdByName: req.auth!.user.fullName },
      messages: batch.messages,
    });
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
    const [allowedCity] = await db
      .select({ id: citiesTable.id })
      .from(citiesTable)
      .where(and(eq(citiesTable.id, cityId), cityScopeCondition(req.auth!)));
    if (!allowedCity) {
      res.status(403).json({ error: "O território está fora do seu escopo." });
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
        extendedProperties: { private: { eaCityId: String(cityId), eaSource: "google" } },
      }),
    });
    if (!googleResponse.ok) {
      res.status(502).json({ error: "O Google Calendar não aceitou o evento." });
      return;
    }
    const googleEvent = await googleResponse.json() as { id: string; htmlLink?: string };
    const [created] = await db.insert(campaignCalendarEventsTable).values({
      source: "google",
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
      syncStatus: "synced",
      lastSyncedAt: new Date(),
      sourceUpdatedAt: new Date(),
      createdByUserId: req.auth!.user.id,
    }).returning();
    const { share } = await calendarShareForScope(calendarWeekStart(startsAt), req.auth!, `Agenda de ${calendarWeekStart(startsAt)}`);
    const notification = await automaticCalendarNotification({
      triggerType: "event_created",
      dedupeKey: `event_created:${created.id}`,
      share,
      event: {
        id: created.id,
        title: created.title,
        startsAt: created.startsAt,
        endsAt: created.endsAt,
        cityId: created.cityId,
        cityName: city.name,
        location: created.location,
      },
      principal: req.auth!,
      request: req,
    });
    res.status(201).json({ ...created, share, notification });
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
    const visibleCities = await db
      .select({ id: citiesTable.id })
      .from(citiesTable)
      .where(cityScopeCondition(req.auth!));
    const visibleCityIds = new Set(visibleCities.map((city) => city.id));
    let googleImported = 0;
    let googleCancelled = 0;
    let notificationsPrepared = 0;
    const errors: string[] = [];

    try {
      const response = await googleCalendarRequest(`/calendar/v3/calendars/primary/events?${query.toString()}`);
      if (!response.ok) throw new Error(`Google Calendar indisponível (${response.status}).`);
      const payload = await response.json() as { items?: Array<Record<string, unknown>> };
      for (const event of payload.items ?? []) {
        if (typeof event.id !== "string") continue;
        const privateProps = record(event.extendedProperties) && record(event.extendedProperties.private) ? event.extendedProperties.private : {};
        const cityId = numberValue(privateProps.eaCityId);
        const start = record(event.start) && typeof event.start.dateTime === "string" ? dateValue(event.start.dateTime) : null;
        const end = record(event.end) && typeof event.end.dateTime === "string" ? dateValue(event.end.dateTime) : null;
        if (!cityId || !visibleCityIds.has(cityId)) continue;
        if (event.status === "cancelled") {
          await db.update(campaignCalendarEventsTable).set({
            status: "cancelled",
            ...clearSyncError(),
            updatedAt: new Date(),
          }).where(and(
            eq(campaignCalendarEventsTable.googleCalendarId, "primary"),
            eq(campaignCalendarEventsTable.googleEventId, event.id),
          ));
          googleCancelled += 1;
          continue;
        }
        if (!start || !end || typeof event.summary !== "string") continue;
        const [existing] = await db.select({
          id: campaignCalendarEventsTable.id,
        }).from(campaignCalendarEventsTable).where(and(
          eq(campaignCalendarEventsTable.googleCalendarId, "primary"),
          eq(campaignCalendarEventsTable.googleEventId, event.id),
        )).limit(1);
        const [upserted] = await db.insert(campaignCalendarEventsTable).values({
          source: "google",
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
          ...clearSyncError(),
          sourceUpdatedAt: dateValue(event.updated),
          createdByUserId: req.auth!.user.id,
        }).onConflictDoUpdate({
          target: [campaignCalendarEventsTable.googleCalendarId, campaignCalendarEventsTable.googleEventId],
          set: {
            source: "google",
            title: event.summary,
            description: typeof event.description === "string" ? event.description : null,
            location: typeof event.location === "string" ? event.location : null,
            startsAt: start,
            endsAt: end,
            status: "pending",
            googleHtmlLink: typeof event.htmlLink === "string" ? event.htmlLink : null,
            ...clearSyncError(),
            sourceUpdatedAt: dateValue(event.updated),
            updatedAt: new Date(),
          },
        }).returning();
        if (!existing && upserted) {
          const [eventCity] = await db.select({ name: citiesTable.name }).from(citiesTable).where(eq(citiesTable.id, cityId));
          const { share } = await calendarShareForScope(calendarWeekStart(start), req.auth!, `Agenda de ${calendarWeekStart(start)}`);
          const notification = await automaticCalendarNotification({
            triggerType: "event_imported",
            dedupeKey: `event_imported:${upserted.id}`,
            share,
            event: {
              id: upserted.id,
              title: upserted.title,
              startsAt: upserted.startsAt,
              endsAt: upserted.endsAt,
              cityId: upserted.cityId,
              cityName: eventCity?.name ?? "Cidade não informada",
              location: upserted.location,
            },
            principal: req.auth!,
            request: req,
          });
          if (notification) notificationsPrepared += 1;
        }
        googleImported += 1;
      }
      await recordSyncState("google", "ok");
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Falha ao sincronizar Google Calendar.";
      errors.push(message);
      await recordSyncState("google", "error", message);
    }

    res.json({
      imported: googleImported,
      googleImported,
      googleCancelled,
      notificationsPrepared,
      errors,
      syncedAt: new Date().toISOString(),
    });
  },
);

router.post(
  "/calendar/events/:id/acknowledge",
  requireAnyPermission(["calendar:approve", "calendar:view"]),
  async (req, res): Promise<void> => {
    const id = Number(req.params.id);
    const [event] = await db.select({ id: campaignCalendarEventsTable.id }).from(campaignCalendarEventsTable).innerJoin(citiesTable, eq(citiesTable.id, campaignCalendarEventsTable.cityId)).where(and(eq(campaignCalendarEventsTable.id, id), eq(campaignCalendarEventsTable.source, "google"), cityScopeCondition(req.auth!)));
    if (!event) {
      res.status(404).json({ error: "Evento não encontrado." });
      return;
    }
    await db.insert(campaignEventAcknowledgementsTable).values({ eventId: id, userId: req.auth!.user.id }).onConflictDoNothing();
    res.json({ success: true });
  },
);

export default router;

publicOperationsRouter.get("/calendar/shared/:token", async (req, res): Promise<void> => {
  const token = typeof req.params.token === "string" ? req.params.token : "";
  const [share] = await db.select({
    token: campaignCalendarSharesTable.token,
    weekStart: campaignCalendarSharesTable.weekStart,
    label: campaignCalendarSharesTable.label,
    scopeType: campaignCalendarSharesTable.scopeType,
    scopeRegionId: campaignCalendarSharesTable.scopeRegionId,
    scopeCityId: campaignCalendarSharesTable.scopeCityId,
  }).from(campaignCalendarSharesTable).where(and(
    eq(campaignCalendarSharesTable.token, token),
    eq(campaignCalendarSharesTable.active, true),
  ));
  if (!share) {
    res.status(404).json({ error: "Link de agenda inválido ou desativado." });
    return;
  }
  const weekStart = new Date(`${share.weekStart}T00:00:00-03:00`);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const events = await db.select({
    id: campaignCalendarEventsTable.id,
    title: campaignCalendarEventsTable.title,
    description: campaignCalendarEventsTable.description,
    location: campaignCalendarEventsTable.location,
    startsAt: campaignCalendarEventsTable.startsAt,
    endsAt: campaignCalendarEventsTable.endsAt,
    cityName: citiesTable.name,
    regionName: regionsTable.name,
  }).from(campaignCalendarEventsTable)
    .innerJoin(citiesTable, eq(citiesTable.id, campaignCalendarEventsTable.cityId))
    .innerJoin(regionsTable, eq(regionsTable.id, citiesTable.regionId))
    .where(and(
      eq(campaignCalendarEventsTable.source, "google"),
      sql`${campaignCalendarEventsTable.startsAt} >= ${weekStart}`,
      sql`${campaignCalendarEventsTable.startsAt} < ${weekEnd}`,
      calendarShareScopeCondition(share),
    ))
    .orderBy(asc(campaignCalendarEventsTable.startsAt));
  res.json({ share, events });
});