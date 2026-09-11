import {
  boolean,
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
import { citiesTable, leadershipsTable } from "./campaign";

export const campaignTasksTable = pgTable(
  "campaign_tasks",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").notNull().default("todo"),
    priority: text("priority").notNull().default("normal"),
    dueAt: timestamp("due_at", { withTimezone: true }),
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

export const campaignCalendarEventsTable = pgTable(
  "campaign_calendar_events",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    googleCalendarId: text("google_calendar_id").notNull().default("primary"),
    googleEventId: text("google_event_id").notNull(),
    googleHtmlLink: text("google_html_link"),
    title: text("title").notNull(),
    description: text("description"),
    location: text("location"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    cityId: integer("city_id").notNull().references(() => citiesTable.id),
    status: text("status").notNull().default("pending"),
    createdByUserId: integer("created_by_user_id").notNull().references(() => authUsersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("campaign_calendar_events_google_unique").on(table.googleCalendarId, table.googleEventId),
    index("campaign_calendar_events_city_idx").on(table.cityId),
    index("campaign_calendar_events_start_idx").on(table.startsAt),
  ],
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

export const insertTaskSchema = z.object({
  title: z.string().min(2),
  description: z.string().nullable().optional(),
  status: z.enum(["todo", "in_progress", "blocked", "done"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  dueAt: z.string().datetime().nullable().optional(),
  cityId: z.number().int().positive().nullable().optional(),
  leadershipId: z.number().int().positive().nullable().optional(),
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
export type CampaignCalendarEvent = typeof campaignCalendarEventsTable.$inferSelect;