import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const regionsTable = pgTable(
  "campaign_regions",
  {
    id: integer("id").primaryKey(),
    name: text("name").notNull(),
    contact: text("contact"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("campaign_regions_name_unique").on(table.name)],
);

export const citiesTable = pgTable(
  "campaign_cities",
  {
    id: integer("id").primaryKey(),
    name: text("name").notNull(),
    contact: text("contact"),
    regionId: integer("region_id")
      .notNull()
      .references(() => regionsTable.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("campaign_cities_name_region_unique").on(
      table.name,
      table.regionId,
    ),
    index("campaign_cities_region_idx").on(table.regionId),
  ],
);

export const federalDeputiesTable = pgTable(
  "campaign_federal_deputies",
  {
    id: integer("id").primaryKey(),
    canonicalName: text("canonical_name").notNull(),
    isAlliance: boolean("is_alliance").notNull().default(false),
    variants: text("variants"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("campaign_federal_deputies_name_unique").on(table.canonicalName),
  ],
);

export const articulatorsTable = pgTable(
  "campaign_articulators",
  {
    id: integer("id").primaryKey(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("campaign_articulators_name_unique").on(table.name)],
);

export const coordinatorsTable = pgTable(
  "campaign_coordinators",
  {
    id: integer("id").primaryKey(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("campaign_coordinators_name_unique").on(table.name)],
);

export const leadershipsTable = pgTable(
  "campaign_leaderships",
  {
    id: integer("id").primaryKey(),
    cityId: integer("city_id")
      .notNull()
      .references(() => citiesTable.id),
    internalRegion: text("internal_region"),
    articulatorId: integer("articulator_id").references(
      () => articulatorsTable.id,
    ),
    coordinatorId: integer("coordinator_id").references(
      () => coordinatorsTable.id,
    ),
    coordinatorContact: text("coordinator_contact"),
    name: text("name"),
    leadershipContact: text("leadership_contact"),
    federalDeputyId: integer("federal_deputy_id").references(
      () => federalDeputiesTable.id,
    ),
    allianceStatus: text("alliance_status"),
    originalFederalDeputy: text("original_federal_deputy"),
    religion: text("religion"),
    sourceSheet: text("source_sheet").notNull(),
    sourceRow: integer("source_row").notNull(),
    needsReview: boolean("needs_review").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("campaign_leaderships_source_unique").on(
      table.sourceSheet,
      table.sourceRow,
    ),
    index("campaign_leaderships_city_idx").on(table.cityId),
    index("campaign_leaderships_review_idx").on(table.needsReview),
    index("campaign_leaderships_name_idx").on(table.name),
  ],
);

export const reviewIssuesTable = pgTable(
  "campaign_review_issues",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    leadershipId: integer("leadership_id")
      .notNull()
      .references(() => leadershipsTable.id),
    type: text("type").notNull(),
    severity: text("severity").notNull(),
    details: text("details").notNull(),
    status: text("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    index("campaign_review_issues_status_idx").on(table.status),
    uniqueIndex("campaign_review_issues_leadership_type_unique").on(
      table.leadershipId,
      table.type,
    ),
  ],
);

export const insertRegionSchema = createInsertSchema(regionsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertRegion = z.infer<typeof insertRegionSchema>;
export type Region = typeof regionsTable.$inferSelect;

export const insertCitySchema = createInsertSchema(citiesTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertCity = z.infer<typeof insertCitySchema>;
export type City = typeof citiesTable.$inferSelect;

export const insertFederalDeputySchema = createInsertSchema(
  federalDeputiesTable,
).omit({ createdAt: true, updatedAt: true });
export type InsertFederalDeputy = z.infer<typeof insertFederalDeputySchema>;
export type FederalDeputy = typeof federalDeputiesTable.$inferSelect;

export const insertArticulatorSchema = createInsertSchema(
  articulatorsTable,
).omit({ createdAt: true, updatedAt: true });
export type InsertArticulator = z.infer<typeof insertArticulatorSchema>;
export type Articulator = typeof articulatorsTable.$inferSelect;

export const insertCoordinatorSchema = createInsertSchema(
  coordinatorsTable,
).omit({ createdAt: true, updatedAt: true });
export type InsertCoordinator = z.infer<typeof insertCoordinatorSchema>;
export type Coordinator = typeof coordinatorsTable.$inferSelect;

export const insertLeadershipSchema = createInsertSchema(
  leadershipsTable,
).omit({ createdAt: true, updatedAt: true });
export type InsertLeadership = z.infer<typeof insertLeadershipSchema>;
export type Leadership = typeof leadershipsTable.$inferSelect;

export const insertReviewIssueSchema = createInsertSchema(
  reviewIssuesTable,
).omit({ createdAt: true, resolvedAt: true });
export type InsertReviewIssue = z.infer<typeof insertReviewIssueSchema>;
export type ReviewIssue = typeof reviewIssuesTable.$inferSelect;