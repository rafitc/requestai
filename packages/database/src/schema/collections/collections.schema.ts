import {relations} from "drizzle-orm";
import {boolean, index, pgTable, text, timestamp, uniqueIndex, uuid} from "drizzle-orm/pg-core";

import {users} from "../betterAuth/betterAuth.schema";

/**
 * One row per logical collection the user owns. Each generation produces a new
 * `collection_versions` row; `current_version_id` points at the latest.
 */
export const collections = pgTable(
	"collections",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: uuid("user_id")
			.notNull()
			.references(() => users.id, {onDelete: "cascade"}),
		name: text("name").notNull(),
		currentVersionId: uuid("current_version_id"),
		shareSlug: text("share_slug"),
		shareEnabled: boolean("share_enabled").default(false).notNull(),
		deletedAt: timestamp("deleted_at", {withTimezone: true}),
		createdAt: timestamp("created_at", {withTimezone: true}).defaultNow().notNull(),
		updatedAt: timestamp("updated_at", {withTimezone: true})
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
	},
	(table) => [
		index("collections_user_id_idx").on(table.userId),
		uniqueIndex("collections_share_slug_uidx").on(table.shareSlug),
	],
);

export type Collection = typeof collections.$inferSelect;
export type NewCollection = typeof collections.$inferInsert;

export const collectionsRelations = relations(collections, ({one}) => ({
	user: one(users, {
		fields: [collections.userId],
		references: [users.id],
	}),
}));
