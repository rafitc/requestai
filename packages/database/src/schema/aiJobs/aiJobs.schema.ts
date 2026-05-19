import {relations} from "drizzle-orm";
import {index, jsonb, pgEnum, pgTable, text, timestamp, uuid} from "drizzle-orm/pg-core";

import {users} from "../betterAuth/betterAuth.schema";
import {collections} from "../collections/collections.schema";

export const aiJobState = pgEnum("ai_job_state", ["queued", "running", "succeeded", "failed"]);

export const aiJobStep = pgEnum("ai_job_step", [
	"queued",
	"ingesting",
	"analyzing",
	"generating",
	"exporting",
	"storing",
	"completing",
]);

/**
 * UI-facing job tracking. Mirrors what pg-boss has internally but is the
 * source of truth for "what is the user seeing right now?"
 *
 * `bossJobId` correlates back to the pg-boss row so we can join for debug.
 */
export const aiJobs = pgTable(
	"ai_jobs",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		bossJobId: text("boss_job_id"),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, {onDelete: "cascade"}),
		collectionId: uuid("collection_id").references(() => collections.id, {onDelete: "set null"}),
		state: aiJobState("state").default("queued").notNull(),
		progressStep: aiJobStep("progress_step").default("queued").notNull(),
		input: jsonb("input").$type<Record<string, unknown>>(),
		error: text("error"),
		startedAt: timestamp("started_at", {withTimezone: true}),
		finishedAt: timestamp("finished_at", {withTimezone: true}),
		createdAt: timestamp("created_at", {withTimezone: true}).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", {withTimezone: true})
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		index("ai_jobs_user_id_idx").on(table.userId),
		index("ai_jobs_collection_id_idx").on(table.collectionId),
		index("ai_jobs_state_idx").on(table.state),
	],
);

export type AiJob = typeof aiJobs.$inferSelect;
export type NewAiJob = typeof aiJobs.$inferInsert;

export const aiJobsRelations = relations(aiJobs, ({one}) => ({
	user: one(users, {
		fields: [aiJobs.userId],
		references: [users.id],
	}),
	collection: one(collections, {
		fields: [aiJobs.collectionId],
		references: [collections.id],
	}),
}));
