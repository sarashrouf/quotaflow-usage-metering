CREATE TYPE "public"."plan_type" AS ENUM('account', 'user');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('accepted', 'rejected');--> statement-breakpoint
CREATE TABLE "account_plan_assignments" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"plan_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "account_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"month" date NOT NULL,
	"consumed_units" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "account_usage_nonnegative" CHECK ("account_usage"."consumed_units" >= 0)
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"api_key_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_api_key_hash_unique" UNIQUE("api_key_hash")
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" "plan_type" NOT NULL,
	"monthly_allowance" integer NOT NULL,
	"max_per_request" integer NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"owner_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_code_unique" UNIQUE("code"),
	CONSTRAINT "plans_monthly_positive" CHECK ("plans"."monthly_allowance" > 0),
	CONSTRAINT "plans_per_request_positive" CHECK ("plans"."max_per_request" > 0),
	CONSTRAINT "plans_owner_valid" CHECK ((
        ("plans"."is_system" = true AND "plans"."owner_account_id" IS NULL)
        OR
        ("plans"."is_system" = false AND "plans"."owner_account_id" IS NOT NULL)
      ))
);
--> statement-breakpoint
CREATE TABLE "request_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"request_id" text NOT NULL,
	"requested_units" integer NOT NULL,
	"status" "request_status" NOT NULL,
	"rejection_level" text,
	"rejection_rule" text,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "request_history_positive_units" CHECK ("request_history"."requested_units" > 0),
	CONSTRAINT "request_history_reason_valid" CHECK ((
        ("request_history"."status" = 'accepted'
          AND "request_history"."rejection_level" IS NULL
          AND "request_history"."rejection_rule" IS NULL)
        OR
        ("request_history"."status" = 'rejected'
          AND "request_history"."rejection_level" IN ('account', 'user')
          AND "request_history"."rejection_rule" IS NOT NULL)
      ))
);
--> statement-breakpoint
CREATE TABLE "user_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"month" date NOT NULL,
	"consumed_units" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "user_usage_nonnegative" CHECK ("user_usage"."consumed_units" >= 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"plan_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_plan_assignments" ADD CONSTRAINT "account_plan_assignments_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_plan_assignments" ADD CONSTRAINT "account_plan_assignments_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_usage" ADD CONSTRAINT "account_usage_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_owner_account_id_accounts_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_account_id_unique"
ON "users" USING btree ("account_id","id");
ALTER TABLE "request_history" ADD CONSTRAINT "request_history_account_user_fk" FOREIGN KEY ("account_id","user_id") REFERENCES "public"."users"("account_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_usage" ADD CONSTRAINT "user_usage_account_user_fk" FOREIGN KEY ("account_id","user_id") REFERENCES "public"."users"("account_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_usage_month_unique" ON "account_usage" USING btree ("account_id","month");--> statement-breakpoint
CREATE UNIQUE INDEX "plans_owner_name_type_unique" ON "plans" USING btree ("owner_account_id","name","type");--> statement-breakpoint
CREATE UNIQUE INDEX "request_history_request_unique" ON "request_history" USING btree ("account_id","request_id");--> statement-breakpoint
CREATE INDEX "request_history_account_time_idx" ON "request_history" USING btree ("account_id","processed_at");--> statement-breakpoint
CREATE INDEX "request_history_user_time_idx" ON "request_history" USING btree ("user_id","processed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_usage_month_unique" ON "user_usage" USING btree ("user_id","month");--> statement-breakpoint
CREATE INDEX "user_usage_account_month_idx" ON "user_usage" USING btree ("account_id","month");--> statement-breakpoint
CREATE UNIQUE INDEX "users_account_external_unique" ON "users" USING btree ("account_id","external_id");--> statement-breakpoint
