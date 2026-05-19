import {z} from "zod";

import {uuidv4Schema} from "./common.js";

/**
 * Target platform formats the user can request exports for.
 * Mirrors the `collection_artifact_format` Postgres enum.
 */
export const platformSchema = z.enum(["postman", "bruno", "hoppscotch", "thunder"]);
export type Platform = z.infer<typeof platformSchema>;

/**
 * Source kind for a generation request.
 */
export const sourceKindSchema = z.enum(["url", "upload"]);

/**
 * URL source. (File upload variant lands in Phase 3.)
 */
export const collectionUrlSourceSchema = z.object({
	kind: z.literal("url"),
	url: z.string().url(),
});

export const collectionSourceSchema = collectionUrlSourceSchema;

export const createCollectionRequestSchema = z.object({
	name: z.string().min(1).max(120),
	platforms: z.array(platformSchema).min(1),
	source: collectionSourceSchema,
	extraPrompt: z.string().max(2000).optional(),
});

export type CreateCollectionRequest = z.infer<typeof createCollectionRequestSchema>;

export const createCollectionResponseSchema = z.object({
	collectionId: uuidv4Schema,
	jobId: uuidv4Schema,
});

export type CreateCollectionResponse = z.infer<typeof createCollectionResponseSchema>;

export const preflightRequestSchema = z.object({
	source: collectionSourceSchema,
});

export type PreflightRequest = z.infer<typeof preflightRequestSchema>;

export const preflightResponseSchema = z.discriminatedUnion("supported", [
	z.object({
		supported: z.literal(true),
		format: z.string(),
		requiresAi: z.boolean(),
		canonicalUrl: z.string(),
		summary: z.string(),
		warnings: z.array(z.string()),
	}),
	z.object({
		supported: z.literal(false),
		reason: z.string(),
		message: z.string(),
	}),
]);

export type PreflightResponse = z.infer<typeof preflightResponseSchema>;

export const jobStateSchema = z.enum(["queued", "running", "succeeded", "failed"]);
export const jobStepSchema = z.enum([
	"queued",
	"ingesting",
	"analyzing",
	"generating",
	"exporting",
	"storing",
	"completing",
]);

export const aiJobResponseSchema = z.object({
	id: uuidv4Schema,
	state: jobStateSchema,
	progressStep: jobStepSchema,
	collectionId: uuidv4Schema.nullable(),
	error: z.string().nullable(),
	startedAt: z.string().datetime().nullable(),
	finishedAt: z.string().datetime().nullable(),
	createdAt: z.string().datetime(),
});

export type AiJobResponse = z.infer<typeof aiJobResponseSchema>;

export const collectionListItemSchema = z.object({
	id: uuidv4Schema,
	name: z.string(),
	currentVersionId: uuidv4Schema.nullable(),
	shareEnabled: z.boolean(),
	createdAt: z.string().datetime(),
	updatedAt: z.string().datetime(),
});

export type CollectionListItem = z.infer<typeof collectionListItemSchema>;

export const creditBalanceResponseSchema = z.object({
	balance: z.number().int(),
});

export type CreditBalanceResponse = z.infer<typeof creditBalanceResponseSchema>;
