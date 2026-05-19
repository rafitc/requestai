import {relations} from "drizzle-orm";
import {index, integer, jsonb, pgTable, text, timestamp, uuid} from "drizzle-orm/pg-core";

import {collections} from "./collections.schema";

/**
 * Append-only history of generations for a given collection. The generated
 * OpenAPI document is the canonical IR; per-platform exports live in
 * `collection_artifacts` and are derived from this.
 */
export const collectionVersions = pgTable(
	"collection_versions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		collectionId: uuid("collection_id")
			.notNull()
			.references(() => collections.id, {onDelete: "cascade"}),
		version: integer("version").notNull(),
		openapiDoc: jsonb("openapi_doc").$type<Record<string, unknown>>(),
		sourceInput: jsonb("source_input").$type<{
			kind: "url" | "upload";
			url?: string;
			storageKey?: string;
			filename?: string;
			mimeType?: string;
			detectedFormat?: string;
			platforms: string[];
			extraPrompt?: string;
		}>(),
		aiProvider: text("ai_provider"),
		aiModel: text("ai_model"),
		promptTokens: integer("prompt_tokens"),
		completionTokens: integer("completion_tokens"),
		createdAt: timestamp("created_at", {withTimezone: true}).defaultNow().notNull(),
	},
	(table) => [index("collection_versions_collection_id_idx").on(table.collectionId)],
);

export type CollectionVersion = typeof collectionVersions.$inferSelect;
export type NewCollectionVersion = typeof collectionVersions.$inferInsert;

export const collectionVersionsRelations = relations(collectionVersions, ({one}) => ({
	collection: one(collections, {
		fields: [collectionVersions.collectionId],
		references: [collections.id],
	}),
}));
