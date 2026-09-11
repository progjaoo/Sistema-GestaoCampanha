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
import { authUsersTable } from "./auth";
import { citiesTable } from "./campaign";

export const campaignMaterialsTable = pgTable(
  "campaign_materials",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    unit: text("unit").notNull().default("unidade"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("campaign_materials_name_unique").on(table.name),
    index("campaign_materials_active_idx").on(table.isActive),
  ],
);

export const campaignMaterialWithdrawalsTable = pgTable(
  "campaign_material_withdrawals",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    cityId: integer("city_id").notNull().references(() => citiesTable.id),
    responsibleUserId: integer("responsible_user_id").notNull().references(() => authUsersTable.id),
    status: text("status").notNull().default("requested"),
    postalCode: text("postal_code").notNull(),
    street: text("street").notNull(),
    number: text("number").notNull(),
    complement: text("complement"),
    neighborhood: text("neighborhood").notNull(),
    addressCity: text("address_city").notNull(),
    state: text("state").notNull(),
    notes: text("notes"),
    createdByUserId: integer("created_by_user_id").notNull().references(() => authUsersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("campaign_material_withdrawals_city_idx").on(table.cityId),
    index("campaign_material_withdrawals_status_idx").on(table.status),
    index("campaign_material_withdrawals_responsible_idx").on(table.responsibleUserId),
    index("campaign_material_withdrawals_created_idx").on(table.createdAt),
  ],
);

export const campaignMaterialWithdrawalItemsTable = pgTable(
  "campaign_material_withdrawal_items",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    withdrawalId: integer("withdrawal_id")
      .notNull()
      .references(() => campaignMaterialWithdrawalsTable.id, { onDelete: "cascade" }),
    materialId: integer("material_id")
      .notNull()
      .references(() => campaignMaterialsTable.id),
    quantity: integer("quantity"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("campaign_material_withdrawal_items_unique").on(table.withdrawalId, table.materialId),
    index("campaign_material_withdrawal_items_material_idx").on(table.materialId),
  ],
);

export const insertCampaignMaterialSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  unit: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});
export const insertCampaignMaterialWithdrawalSchema = z.object({
  cityId: z.number().int().positive(),
  responsibleUserId: z.number().int().positive(),
  status: z.string().optional(),
  postalCode: z.string().min(1),
  street: z.string().min(1),
  number: z.string().min(1),
  complement: z.string().nullable().optional(),
  neighborhood: z.string().min(1),
  addressCity: z.string().min(1),
  state: z.string().min(1),
  notes: z.string().nullable().optional(),
  createdByUserId: z.number().int().positive(),
});
export const insertCampaignMaterialWithdrawalItemSchema = z.object({
  withdrawalId: z.number().int().positive(),
  materialId: z.number().int().positive(),
  quantity: z.number().int().positive().nullable().optional(),
});

export type CampaignMaterial = typeof campaignMaterialsTable.$inferSelect;
export type CampaignMaterialWithdrawal = typeof campaignMaterialWithdrawalsTable.$inferSelect;
export type CampaignMaterialWithdrawalItem = typeof campaignMaterialWithdrawalItemsTable.$inferSelect;
export type InsertCampaignMaterial = z.infer<typeof insertCampaignMaterialSchema>;
export type InsertCampaignMaterialWithdrawal = z.infer<typeof insertCampaignMaterialWithdrawalSchema>;
export type InsertCampaignMaterialWithdrawalItem = z.infer<typeof insertCampaignMaterialWithdrawalItemSchema>;