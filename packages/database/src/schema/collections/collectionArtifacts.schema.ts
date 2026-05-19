import {relations} from "drizzle-orm";
import {index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid} from "drizzle-orm/pg-core";

import {collectionVersions} from "./collectionVersions.schema";

export const collectionArtifactFormat = pgEnum("collection_artifact_format", [
	"postman",
	"bruno",
	"hoppscotch",
	"thunder",
]);

/**
 * Materialized per-platform export for a given version. Cached so repeat
 * downloads don't re-run the converter.
 */
export const collectionArtifacts = pgTable(
	"collection_artifacts",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		versionId: uuid("version_id")
			.notNull()
			.references(() => collectionVersions.id, {onDelete: "cascade"}),
		format: collectionArtifactFormat("format").notNull(),
		storageKey: text("storage_key").notNull(),
		byteSize: integer("byte_size").notNull(),
		createdAt: timestamp("created_at", {withTimezone: true}).defaultNow().notNull(),
	},
	(table) => [
		index("collection_artifacts_version_id_idx").on(table.versionId),
		uniqueIndex("collection_artifacts_version_format_uidx").on(table.versionId, table.format),
	],
);

export type CollectionArtifact = typeof collectionArtifacts.$inferSelect;
export type NewCollectionArtifact = typeof collectionArtifacts.$inferInsert;

export const collectionArtifactsRelations = relations(collectionArtifacts, ({one}) => ({
	version: one(collectionVersions, {
		fields: [collectionArtifacts.versionId],
		references: [collectionVersions.id],
	}),
}));
