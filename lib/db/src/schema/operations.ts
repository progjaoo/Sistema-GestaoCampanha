import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
import { authUsersTable } from "./auth";
import { citiesTable, leadershipsTable, regionsTable } from "./campaign";

export const campaignTasksTable = pgTable(
  "campaign_tasks",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").notNull().default("todo"),
    priority: text("priority").notNull().default("normal"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    boardId: integer("board_id").references(() => campaignBoardsTable.id, { onDelete: "set null" }),
    cityId: integer("city_id").references(() => citiesTable.id),
    leadershipId: integer("leadership_id").references(() => leadershipsTable.id),
    assigneeUserId: integer("assignee_user_id").references(() => authUsersTable.id),
    createdByUserId: integer("created_by_user_id").notNull().references(() => authUsersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("campaign_tasks_status_idx").on(table.status),
    index("campaign_tasks_city_idx").on(table.cityId),
    index("campaign_tasks_assignee_idx").on(table.assigneeUserId),
  ],
);

export const campaignBoardsTable = pgTable(
  "campaign_boards",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    cityId: integer("city_id").notNull().references(() => citiesTable.id),
    archived: boolean("archived").notNull().default(false),
    createdByUserId: integer("created_by_user_id").notNull().references(() => authUsersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("campaign_boards_city_idx").on(table.cityId),
    index("campaign_boards_archived_idx").on(table.archived),
  ],
);

export const campaignBoardMembersTable = pgTable(
  "campaign_board_members",
  {
    boardId: integer("board_id").notNull().references(() => campaignBoardsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => authUsersTable.id, { onDelete: "cascade" }),
    addedByUserId: integer("added_by_user_id").notNull().references(() => authUsersTable.id),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.boardId, table.userId] })],
);

export const campaignTaskMembersTable = pgTable(
  "campaign_task_members",
  {
    taskId: integer("task_id").notNull().references(() => campaignTasksTable.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => authUsersTable.id, { onDelete: "cascade" }),
    addedByUserId: integer("added_by_user_id").notNull().references(() => authUsersTable.id),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.taskId, table.userId] })],
);

export const campaignTaskChecklistItemsTable = pgTable(
  "campaign_task_checklist_items",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    taskId: integer("task_id").notNull().references(() => campaignTasksTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    completed: boolean("completed").notNull().default(false),
    position: integer("position").notNull().default(0),
    createdByUserId: integer("created_by_user_id").notNull().references(() => authUsersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("campaign_task_checklist_task_idx").on(table.taskId, table.position),
  ],
);

export const campaignTaskCommentsTable = pgTable(
  "campaign_task_comments",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    taskId: integer("task_id").notNull().references(() => campaignTasksTable.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => authUsersTable.id),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [index("campaign_task_comments_task_idx").on(table.taskId, table.createdAt)],
);

export const campaignTaskActivityTable = pgTable(
  "campaign_task_activity",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    taskId: integer("task_id").notNull().references(() => campaignTasksTable.id, { onDelete: "cascade" }),
    actorUserId: integer("actor_user_id").notNull().references(() => authUsersTable.id),
    action: text("action").notNull(),
    detail: text("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("campaign_task_activity_task_idx").on(table.taskId, table.createdAt)],
);

export const campaignCalendarEventsTable = pgTable(
  "campaign_calendar_events",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    source: text("source").notNull().default("google"),
    googleCalendarId: text("google_calendar_id").notNull().default("primary"),
    googleEventId: text("google_event_id").notNull(),
    googleHtmlLink: text("google_html_link"),
    calendlyEventId: text("calendly_event_id"),
    calendlyEventUri: text("calendly_event_uri"),
    title: text("title").notNull(),
    description: text("description"),
    location: text("location"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    cityId: integer("city_id").notNull().references(() => citiesTable.id),
    status: text("status").notNull().default("pending"),
    syncStatus: text("sync_status").notNull().default("synced"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastSyncError: text("last_sync_error"),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    createdByUserId: integer("created_by_user_id").notNull().references(() => authUsersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("campaign_calendar_events_google_unique").on(table.googleCalendarId, table.googleEventId),
    uniqueIndex("campaign_calendar_events_calendly_unique").on(table.calendlyEventId),
    index("campaign_calendar_events_city_idx").on(table.cityId),
    index("campaign_calendar_events_start_idx").on(table.startsAt),
    index("campaign_calendar_events_source_idx").on(table.source),
  ],
);

export const campaignCalendarSyncStateTable = pgTable(
  "campaign_calendar_sync_state",
  {
    provider: text("provider").primaryKey(),
    status: text("status").notNull().default("never"),
    lastAttemptedAt: timestamp("last_attempted_at", { withTimezone: true }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastError: text("last_error"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
);

export const campaignEventAcknowledgementsTable = pgTable(
  "campaign_event_acknowledgements",
  {
    eventId: integer("event_id").notNull().references(() => campaignCalendarEventsTable.id, { onDelete: "cascade" }),
    userId: integer("user_id").notNull().references(() => authUsersTable.id, { onDelete: "cascade" }),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.eventId, table.userId] })],
);

export const campaignCalendarSharesTable = pgTable(
  "campaign_calendar_shares",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    token: text("token").notNull(),
    label: text("label").notNull().default("Agenda semanal"),
    weekStart: date("week_start", { mode: "string" }).notNull(),
    active: boolean("active").notNull().default(true),
    scopeType: text("scope_type").notNull().default("none"),
    scopeRegionId: integer("scope_region_id").references(() => regionsTable.id),
    scopeCityId: integer("scope_city_id").references(() => citiesTable.id),
    createdByUserId: integer("created_by_user_id").notNull().references(() => authUsersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("campaign_calendar_shares_token_unique").on(table.token),
    index("campaign_calendar_shares_week_idx").on(table.weekStart),
  ],
);

export const campaignWhatsappShareBatchesTable = pgTable(
  "campaign_whatsapp_share_batches",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    kind: text("kind").notNull(),
    taskId: integer("task_id").references(() => campaignTasksTable.id, { onDelete: "set null" }),
    calendarShareId: integer("calendar_share_id").references(() => campaignCalendarSharesTable.id, { onDelete: "set null" }),
    createdByUserId: integer("created_by_user_id").notNull().references(() => authUsersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("campaign_whatsapp_batches_task_idx").on(table.taskId, table.createdAt),
    index("campaign_whatsapp_batches_calendar_idx").on(table.calendarShareId, table.createdAt),
  ],
);

export const campaignWhatsappShareMessagesTable = pgTable(
  "campaign_whatsapp_share_messages",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    batchId: integer("batch_id").notNull().references(() => campaignWhatsappShareBatchesTable.id, { onDelete: "cascade" }),
    recipientType: text("recipient_type").notNull(),
    recipientUserId: integer("recipient_user_id").references(() => authUsersTable.id, { onDelete: "set null" }),
    recipientLeadershipId: integer("recipient_leadership_id").references(() => leadershipsTable.id, { onDelete: "set null" }),
    recipientName: text("recipient_name").notNull(),
    phone: text("phone").notNull(),
    message: text("message").notNull(),
    whatsappUrl: text("whatsapp_url").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("campaign_whatsapp_messages_batch_idx").on(table.batchId),
  ],
);

export const insertTaskSchema = z.object({
  title: z.string().min(2),
  description: z.string().nullable().optional(),
  status: z.enum(["todo", "in_progress", "blocked", "done"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  dueAt: z.string().datetime().nullable().optional(),
  boardId: z.number().int().positive().nullable().optional(),
  cityId: z.number().int().positive(),
  leadershipId: z.number().int().positive(),
  leadershipPhone: z.string().nullable().optional(),
  assigneeUserId: z.number().int().positive().nullable().optional(),
});
export type InsertTask = z.infer<typeof insertTaskSchema>;

export const insertCalendarEventSchema = z.object({
  title: z.string().min(2),
  description: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  cityId: z.number().int().positive(),
});
export type InsertCalendarEvent = z.infer<typeof insertCalendarEventSchema>;

export type CampaignTask = typeof campaignTasksTable.$inferSelect;
export type CampaignBoard = typeof campaignBoardsTable.$inferSelect;
export type CampaignBoardMember = typeof campaignBoardMembersTable.$inferSelect;
export type CampaignTaskMember = typeof campaignTaskMembersTable.$inferSelect;
export type CampaignTaskChecklistItem = typeof campaignTaskChecklistItemsTable.$inferSelect;
export type CampaignTaskComment = typeof campaignTaskCommentsTable.$inferSelect;
export type CampaignTaskActivity = typeof campaignTaskActivityTable.$inferSelect;
export type CampaignCalendarEvent = typeof campaignCalendarEventsTable.$inferSelect;
export type CampaignCalendarShare = typeof campaignCalendarSharesTable.$inferSelect;
export type CampaignWhatsappShareBatch = typeof campaignWhatsappShareBatchesTable.$inferSelect;
export type CampaignWhatsappShareMessage = typeof campaignWhatsappShareMessagesTable.$inferSelect;