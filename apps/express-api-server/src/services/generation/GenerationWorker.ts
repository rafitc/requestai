import {
	aiJobs,
	collectionVersions,
	collections,
	db,
	eq,
} from "@requestai/database";

import logger from "@loaders/logger";
import {creditService, GENERATION_CREDIT_COST} from "@services/credits";
import {
	jobQueueService,
	type iGenerateCollectionPayload,
} from "@services/jobs";

/**
 * Stub implementation of the collection-generation worker.
 *
 * Real implementation (Phase 3+) will:
 *   ingest source -> AI -> validate OpenAPI -> export per platform -> store
 *
 * This stub walks through the same `progress_step` states with brief delays so
 * the frontend can be built and polled end-to-end without paying for AI calls.
 */

const CANNED_OPENAPI: Record<string, unknown> = {
	openapi: "3.1.0",
	info: {
		title: "Stub Generated Collection",
		version: "0.0.1",
		description: "Placeholder OpenAPI — real AI generation lands in Phase 3.",
	},
	paths: {
		"/ping": {
			get: {
				summary: "Health check",
				responses: {
					"200": {
						description: "OK",
						content: {
							"application/json": {
								schema: {type: "object", properties: {ok: {type: "boolean"}}},
							},
						},
					},
				},
			},
		},
	},
};

const sleep = (ms: number) => {return new Promise((resolve) => {return setTimeout(resolve, ms);});};

async function updateJobStep(
	aiJobId: string,
	step: "ingesting" | "analyzing" | "generating" | "exporting" | "storing" | "completing"
): Promise<void> {
	await db
		.update(aiJobs)
		.set({state: "running", progressStep: step, startedAt: new Date()})
		.where(eq(aiJobs.id, aiJobId));
}

async function processJob(payload: iGenerateCollectionPayload): Promise<void> {
	const {aiJobId, versionId, collectionId, userId} = payload;

	logger.info(null, "GenerationWorker: starting job", {aiJobId});

	try {
		await updateJobStep(aiJobId, "ingesting");
		await sleep(500);

		await updateJobStep(aiJobId, "analyzing");
		await sleep(500);

		await updateJobStep(aiJobId, "generating");
		await sleep(500);

		await updateJobStep(aiJobId, "exporting");
		await sleep(500);

		await updateJobStep(aiJobId, "storing");
		await db
			.update(collectionVersions)
			.set({
				openapiDoc: CANNED_OPENAPI,
				aiProvider: "stub",
				aiModel: "stub",
			})
			.where(eq(collectionVersions.id, versionId));

		await db
			.update(collections)
			.set({currentVersionId: versionId})
			.where(eq(collections.id, collectionId));

		await updateJobStep(aiJobId, "completing");
		await db
			.update(aiJobs)
			.set({state: "succeeded", finishedAt: new Date()})
			.where(eq(aiJobs.id, aiJobId));

		logger.info(null, "GenerationWorker: succeeded", {aiJobId});
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		await db
			.update(aiJobs)
			.set({state: "failed", error: message, finishedAt: new Date()})
			.where(eq(aiJobs.id, aiJobId));

		// Credit was pre-debited in the create route — refund it so the user
		// isn't charged for a failed generation. Best-effort; surface the
		// refund failure in logs but propagate the original error.
		try {
			await creditService.refund({
				userId,
				amount: GENERATION_CREDIT_COST,
				refId: aiJobId,
			});
		} catch (refundError) {
			logger.error(null, "GenerationWorker: refund failed", refundError, {aiJobId, userId});
		}

		logger.error(null, "GenerationWorker: failed", error);
		throw error;
	}
}

/**
 * Register the worker on the JobQueueService. Call once at boot.
 */
export async function registerGenerationWorker(): Promise<void> {
	await jobQueueService.workOnGenerateCollection(processJob);
	logger.info(null, "GenerationWorker registered");
}
