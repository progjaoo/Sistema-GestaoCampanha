import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { authUsersTable } from "./auth";

export const googleCalendarIntegrationTable = pgTable(
  "campaign_google_calendar_integration",
  {
    id: text("id").primaryKey().default("google_calendar"),
    refreshTokenCiphertext: text("refresh_token_ciphertext").notNull(),
    refreshTokenIv: text("refresh_token_iv").notNull(),
    refreshTokenAuthTag: text("refresh_token_auth_tag").notNull(),
    encryptionVersion: integer("encryption_version").notNull().default(1),
    status: text("status").notNull().default("connected"),
    connectedByUserId: integer("connected_by_user_id").references(
      () => authUsersTable.id,
      { onDelete: "set null" },
    ),
    connectedAt: timestamp("connected_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "campaign_google_calendar_integration_singleton_check",
      sql`${table.id} = 'google_calendar'`,
    ),
    check(
      "campaign_google_calendar_integration_status_check",
      sql`${table.status} in ('connected', 'reauthorization_required')`,
    ),
  ],
);

export const googleCalendarOAuthStatesTable = pgTable(
  "campaign_google_calendar_oauth_states",
  {
    stateHash: text("state_hash").primaryKey(),
    codeVerifierCiphertext: text("code_verifier_ciphertext").notNull(),
    codeVerifierIv: text("code_verifier_iv").notNull(),
    codeVerifierAuthTag: text("code_verifier_auth_tag").notNull(),
    startedByUserId: integer("started_by_user_id")
      .notNull()
      .references(() => authUsersTable.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("campaign_google_calendar_oauth_states_expires_idx").on(
      table.expiresAt,
    ),
  ],
);
