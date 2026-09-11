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
import { citiesTable, leadershipsTable, regionsTable } from "./campaign";

export const authUsersTable = pgTable(
  "campaign_auth_users",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash").notNull(),
    fullName: text("full_name").notNull(),
    phone: text("phone"),
    role: text("role").notNull(),
    regionId: integer("region_id").references(() => regionsTable.id),
    cityId: integer("city_id").references(() => citiesTable.id),
    leadershipId: integer("leadership_id").references(() => leadershipsTable.id),
    isActive: boolean("is_active").notNull().default(true),
    canCreateLeaderUsers: boolean("can_create_leader_users")
      .notNull()
      .default(false),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("campaign_auth_users_email_unique").on(table.email),
    index("campaign_auth_users_role_idx").on(table.role),
    index("campaign_auth_users_region_idx").on(table.regionId),
    index("campaign_auth_users_city_idx").on(table.cityId),
  ],
);

export const authPermissionsTable = pgTable(
  "campaign_auth_permissions",
  {
    id: integer("id").generatedAlwaysAsIdentity().primaryKey(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    description: text("description").notNull(),
    category: text("category").notNull(),
  },
  (table) => [uniqueIndex("campaign_auth_permissions_key_unique").on(table.key)],
);

export const authRolePermissionsTable = pgTable(
  "campaign_auth_role_permissions",
  {
    role: text("role").notNull(),
    permissionId: integer("permission_id")
      .notNull()
      .references(() => authPermissionsTable.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({
      name: "campaign_auth_role_permissions_pk",
      columns: [table.role, table.permissionId],
    }),
    index("campaign_auth_role_permissions_role_idx").on(table.role),
  ],
);

export const authRoleSchema = z.enum([
  "ADMIN_GERAL",
  "ARTICULADOR",
  "COORDENADOR",
  "LIDERANCA",
]);
export type AuthRole = z.infer<typeof authRoleSchema>;

export const insertAuthUserSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(2),
  role: authRoleSchema,
  regionId: z.number().int().positive().nullable().optional(),
  cityId: z.number().int().positive().nullable().optional(),
  leadershipId: z.number().int().positive().nullable().optional(),
  isActive: z.boolean().optional(),
  canCreateLeaderUsers: z.boolean().optional(),
});
export type InsertAuthUser = z.infer<typeof insertAuthUserSchema>;

export type AuthUser = typeof authUsersTable.$inferSelect;