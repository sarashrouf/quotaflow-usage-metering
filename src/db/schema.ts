import { sql } from "drizzle-orm";

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  date,
  uniqueIndex,
  index,
  check,
  foreignKey,
} from "drizzle-orm/pg-core";

// A plan applies either to a company or to an individual user.
export const planTypeEnum = pgEnum("plan_type", [
  "account",
  "user",
]);

// The result of a consumption attempt.
export const requestStatusEnum = pgEnum("request_status", [
  "accepted",
  "rejected",
]);

// ############################################

export const accounts = pgTable("accounts", {
  id: uuid("id").defaultRandom().primaryKey(),

  name: text("name").notNull(),

  apiKeyHash: text("api_key_hash").notNull().unique(),

  createdAt: timestamp("created_at", {
    withTimezone: true,
  }).defaultNow().notNull(),
});

// ############################################
export const plans = pgTable(
  "plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    code: text("code").notNull().unique(),

    name: text("name").notNull(),

    type: planTypeEnum("type").notNull(),

    monthlyAllowance: integer("monthly_allowance").notNull(),

    maxPerRequest: integer("max_per_request").notNull(),

    isSystem: boolean("is_system").default(false).notNull(),

    ownerAccountId: uuid("owner_account_id").references(
      () => accounts.id,
      { onDelete: "cascade" }
    ),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    }).defaultNow().notNull(),
  },
  (table) => [
    check(
      "plans_monthly_positive",
      sql`${table.monthlyAllowance} > 0`
    ),

    check(
      "plans_per_request_positive",
      sql`${table.maxPerRequest} > 0`
    ),

    check(
      "plans_owner_valid",
      sql`(
        (${table.isSystem} = true AND ${table.ownerAccountId} IS NULL)
        OR
        (${table.isSystem} = false AND ${table.ownerAccountId} IS NOT NULL)
      )`
    ),

    uniqueIndex("plans_owner_name_type_unique").on(
      table.ownerAccountId,
      table.name,
      table.type
    ),
  ]
);

// ############################################

export const accountPlanAssignments = pgTable(
  "account_plan_assignments",
  {
    accountId: uuid("account_id")
      .primaryKey()
      .references(() => accounts.id, {
        onDelete: "cascade",
      }),

    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, {
        onDelete: "restrict",
      }),

    assignedAt: timestamp("assigned_at", {
      withTimezone: true,
    }).defaultNow().notNull(),
  }
);

// ############################################

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, {
        onDelete: "cascade",
      }),

    externalId: text("external_id").notNull(),

    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, {
        onDelete: "restrict",
      }),

    createdAt: timestamp("created_at", {
      withTimezone: true,
    }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("users_account_external_unique").on(
      table.accountId,
      table.externalId
    ),

    uniqueIndex("users_account_id_unique").on(
      table.accountId,
      table.id
    ),
  ]
);

//############################################

export const accountUsage = pgTable(
  "account_usage",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    accountId: uuid("account_id")
      .notNull()
      .references(() => accounts.id, {
        onDelete: "cascade",
      }),

    month: date("month", { mode: "string" }).notNull(),

    consumedUnits: bigint("consumed_units", {
      mode: "number",
    }).default(0).notNull(),
  },
  (table) => [
    uniqueIndex("account_usage_month_unique").on(
      table.accountId,
      table.month
    ),

    check(
      "account_usage_nonnegative",
      sql`${table.consumedUnits} >= 0`
    ),
  ]
);

//############################################
export const userUsage = pgTable(
  "user_usage",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    accountId: uuid("account_id").notNull(),

    userId: uuid("user_id").notNull(),

    month: date("month", { mode: "string" }).notNull(),

    consumedUnits: bigint("consumed_units", {
      mode: "number",
    }).default(0).notNull(),
  },
  (table) => [
    foreignKey({
      name: "user_usage_account_user_fk",
      columns: [table.accountId, table.userId],
      foreignColumns: [users.accountId, users.id],
    }).onDelete("cascade"),

    uniqueIndex("user_usage_month_unique").on(
      table.userId,
      table.month
    ),

    index("user_usage_account_month_idx").on(
      table.accountId,
      table.month
    ),

    check(
      "user_usage_nonnegative",
      sql`${table.consumedUnits} >= 0`
    ),
  ]
);

//############################################

export const requestHistory = pgTable(
  "request_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),

    accountId: uuid("account_id").notNull(),

    userId: uuid("user_id").notNull(),

    requestId: text("request_id").notNull(),

    requestedUnits: integer("requested_units").notNull(),

    status: requestStatusEnum("status").notNull(),

    rejectionLevel: text("rejection_level"),

    rejectionRule: text("rejection_rule"),

    processedAt: timestamp("processed_at", {
      withTimezone: true,
    }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "request_history_account_user_fk",
      columns: [table.accountId, table.userId],
      foreignColumns: [users.accountId, users.id],
    }).onDelete("restrict"),

    uniqueIndex("request_history_request_unique").on(
      table.accountId,
      table.requestId
    ),

    index("request_history_account_time_idx").on(
      table.accountId,
      table.processedAt
    ),

    index("request_history_user_time_idx").on(
      table.userId,
      table.processedAt
    ),

    check(
      "request_history_positive_units",
      sql`${table.requestedUnits} > 0`
    ),

    check(
      "request_history_reason_valid",
      sql`(
        (${table.status} = 'accepted'
          AND ${table.rejectionLevel} IS NULL
          AND ${table.rejectionRule} IS NULL)
        OR
        (${table.status} = 'rejected'
          AND ${table.rejectionLevel} IN ('account', 'user')
          AND ${table.rejectionRule} IS NOT NULL)
      )`
    ),
  ]
);