import type {NextFunction, Request, Response, Router} from "express";
import {nanoid} from "nanoid";
import {z} from "zod";

import {
	aiJobs,
	collectionVersions,
	collections,
	db,
	desc,
	eq,
} from "@requestai/database";
import {
	createCollectionRequestSchema,
	preflightRequestSchema,
} from "@requestai/api-types";

import {isAuthorized} from "@api/middlewares/authorizationMiddleware";
import {httpStatusCodes} from "@customTypes/networkTypes";
import {genericServiceErrors} from "@constants/errors/genericServiceErrors";
import logger from "@loaders/logger";
import {creditService, GENERATION_CREDIT_COST} from "@services/credits";
import {exporterService, type ExportFormat} from "@services/exporters";
import {ingestService} from "@services/ingest";
import {jobQueueService} from "@services/jobs";
import expressUtil from "@util/expressUtil";

const SUPPORTED_DOWNLOAD_FORMATS: ExportFormat[] = ["postman", "bruno", "hoppscotch", "thunder"];

const updateCollectionSchema = z.object({
	name: z.string().min(1).max(120).optional(),
});

const shareToggleSchema = z.object({
	enabled: z.boolean(),
});

/**
 * Collections routes.
 *
 * POST /collections           create + enqueue job (after preflight passes)
 * POST /collections/preflight classify the source without committing
 * GET  /collections           list collections owned by the caller
 * GET  /collections/:id       detail (latest version)
 */
export default (route: Router): void => {
	/**
	 * Preflight: classify a source without committing or charging.
	 */
	route.post(
		"/collections/preflight",
		isAuthorized,
		async (req: Request, res: Response, next: NextFunction): Promise<void> => {
			const uniqueRequestId = expressUtil.parseUniqueRequestId(req);

			try {
				const parsed = preflightRequestSchema.parse(req.body);
				const result = await ingestService.preflight(parsed.source);

				logger.info(uniqueRequestId, "Preflight result", null, {
					supported: result.supported,
					format: result.supported ? result.format : undefined,
					reason: result.supported ? undefined : result.reason,
				});

				res.ok(result);
			} catch (error) {
				next(error);
			}
		}
	);

	/**
	 * Create a collection. Runs preflight first; on success, persists the
	 * collection + an initial version row and enqueues the generation job.
	 * Credit is deducted inside the worker on completion (refunded on failure).
	 */
	route.post(
		"/collections",
		isAuthorized,
		async (req: Request, res: Response, next: NextFunction): Promise<void> => {
			const uniqueRequestId = expressUtil.parseUniqueRequestId(req);
			const userId = req.user?.id;

			if (!userId) {
				res.fail(
					genericServiceErrors.auth.NoAuthorizationToken,
					httpStatusCodes.CLIENT_ERROR_UNAUTHORIZED
				);
				return;
			}

			try {
				const parsed = createCollectionRequestSchema.parse(req.body);

				// Cheap balance check up front so we can reject before running
				// preflight or touching the database. The authoritative gate is
				// `tryDebit` below — that's the one that handles concurrent
				// requests safely.
				const balance = await creditService.getBalance(userId);
				if (balance < GENERATION_CREDIT_COST) {
					res.status(httpStatusCodes.CLIENT_ERROR_PAYMENT_REQUIRED).json({
						isSuccess: false,
						error: {
							code: "insufficient_credits",
							message: "You're out of credits. Buy more to keep generating.",
						},
					});
					return;
				}

				const preflight = await ingestService.preflight(parsed.source);
				if (!preflight.supported) {
					res.status(httpStatusCodes.CLIENT_ERROR_BAD_REQUEST).json({
						isSuccess: false,
						error: {
							code: "preflight_failed",
							reason: preflight.reason,
							message: preflight.message,
						},
					});
					return;
				}

				// Everything in one transaction: insert collection/version/job rows
				// AND debit the credit. Either everything commits, or nothing does.
				// The debit's `SELECT … FOR UPDATE` lock prevents two simultaneous
				// requests from sharing the last credit.
				let insufficient = false;
				const result = await db.transaction(async (tx) => {
					const [collectionRow] = await tx
						.insert(collections)
						.values({userId, name: parsed.name})
						.returning({id: collections.id});
					if (!collectionRow) {throw new Error("Failed to insert collection row");}

					const [versionRow] = await tx
						.insert(collectionVersions)
						.values({
							collectionId: collectionRow.id,
							version: 1,
							sourceInput: {
								kind: parsed.source.kind,
								url: parsed.source.kind === "url" ? parsed.source.url : undefined,
								platforms: parsed.platforms,
								extraPrompt: parsed.extraPrompt,
								detectedFormat: preflight.format,
							},
						})
						.returning({id: collectionVersions.id});
					if (!versionRow) {throw new Error("Failed to insert collection version row");}

					const [jobRow] = await tx
						.insert(aiJobs)
						.values({
							userId,
							collectionId: collectionRow.id,
							state: "queued",
							progressStep: "queued",
							input: {versionId: versionRow.id, source: parsed.source, platforms: parsed.platforms},
						})
						.returning({id: aiJobs.id});
					if (!jobRow) {throw new Error("Failed to insert ai_jobs row");}

					// Debit inside the same transaction. If the user raced past the
					// earlier balance check and is now broke, this returns null and
					// we abort the whole transaction.
					const debited = await creditService.tryDebit({
						userId,
						amount: GENERATION_CREDIT_COST,
						reason: "generation_spend",
						refId: jobRow.id,
						exec: tx,
					});
					if (debited === null) {
						insufficient = true;
						throw new Error("__INSUFFICIENT_CREDITS__");
					}

					return {
						collectionId: collectionRow.id,
						versionId: versionRow.id,
						jobId: jobRow.id,
					};
				}).catch((err) => {
					if (insufficient) {return null;}
					throw err;
				});

				if (insufficient || !result) {
					res.status(httpStatusCodes.CLIENT_ERROR_PAYMENT_REQUIRED).json({
						isSuccess: false,
						error: {
							code: "insufficient_credits",
							message: "You're out of credits. Buy more to keep generating.",
						},
					});
					return;
				}

				const bossJobId = await jobQueueService.enqueueGenerateCollection({
					aiJobId: result.jobId,
					userId,
					collectionId: result.collectionId,
					versionId: result.versionId,
				});

				if (bossJobId) {
					await db
						.update(aiJobs)
						.set({bossJobId})
						.where(eq(aiJobs.id, result.jobId));
				}

				logger.info(uniqueRequestId, "Collection created and job enqueued", null, {
					collectionId: result.collectionId,
					jobId: result.jobId,
				});

				res.ok({collectionId: result.collectionId, jobId: result.jobId});
			} catch (error) {
				next(error);
			}
		}
	);

	/**
	 * List collections owned by the caller.
	 */
	route.get(
		"/collections",
		isAuthorized,
		async (req: Request, res: Response, next: NextFunction): Promise<void> => {
			const userId = req.user?.id;

			if (!userId) {
				res.fail(
					genericServiceErrors.auth.NoAuthorizationToken,
					httpStatusCodes.CLIENT_ERROR_UNAUTHORIZED
				);
				return;
			}

			try {
				const rows = await db
					.select({
						id: collections.id,
						name: collections.name,
						currentVersionId: collections.currentVersionId,
						shareEnabled: collections.shareEnabled,
						createdAt: collections.createdAt,
						updatedAt: collections.updatedAt,
					})
					.from(collections)
					.where(eq(collections.userId, userId))
					.orderBy(desc(collections.createdAt));

				const items = rows.map((row) => {return {
					id: row.id,
					name: row.name,
					currentVersionId: row.currentVersionId,
					shareEnabled: row.shareEnabled,
					createdAt: row.createdAt.toISOString(),
					updatedAt: row.updatedAt.toISOString(),
				};});

				res.ok({items});
			} catch (error) {
				next(error);
			}
		}
	);

	/**
	 * Detail view for a single collection, including its latest version.
	 */
	route.get(
		"/collections/:id",
		isAuthorized,
		async (req: Request, res: Response, next: NextFunction): Promise<void> => {
			const userId = req.user?.id;
			const id = req.params.id;

			if (!userId) {
				res.fail(
					genericServiceErrors.auth.NoAuthorizationToken,
					httpStatusCodes.CLIENT_ERROR_UNAUTHORIZED
				);
				return;
			}
			if (!id) {
				res.status(httpStatusCodes.CLIENT_ERROR_BAD_REQUEST).json({
					isSuccess: false,
					error: {code: "missing_id", message: "Collection id is required."},
				});
				return;
			}

			try {
				const [row] = await db
					.select()
					.from(collections)
					.where(eq(collections.id, id))
					.limit(1);

				if (!row || row.userId !== userId || row.deletedAt) {
					res.status(httpStatusCodes.CLIENT_ERROR_NOT_FOUND).json({
						success: false,
						error: {code: "not_found", message: "Collection not found"},
					});
					return;
				}

				let latestVersion = null;
				if (row.currentVersionId) {
					const [versionRow] = await db
						.select()
						.from(collectionVersions)
						.where(eq(collectionVersions.id, row.currentVersionId))
						.limit(1);
					latestVersion = versionRow ?? null;
				}

				res.ok({
					id: row.id,
					name: row.name,
					currentVersionId: row.currentVersionId,
					shareEnabled: row.shareEnabled,
					shareSlug: row.shareEnabled ? row.shareSlug : null,
					createdAt: row.createdAt.toISOString(),
					updatedAt: row.updatedAt.toISOString(),
					latestVersion,
				});
			} catch (error) {
				next(error);
			}
		}
	);

	/**
	 * Download the current version of a collection in a platform-specific
	 * format. Bypasses the JSON response envelope to stream the file body
	 * directly with Content-Disposition: attachment.
	 *
	 * Postman gets a real Postman Collection v2.1 via ExporterService.
	 * Bruno / Hoppscotch / Thunder Client get the raw OpenAPI JSON; all three
	 * tools have a native "Import OpenAPI" flow that consumes it directly.
	 */
	route.get(
		"/collections/:id/download/:format",
		isAuthorized,
		async (req: Request, res: Response, next: NextFunction): Promise<void> => {
			const userId = req.user?.id;
			const id = req.params.id;
			const format = req.params.format;

			if (!userId) {
				res.fail(
					genericServiceErrors.auth.NoAuthorizationToken,
					httpStatusCodes.CLIENT_ERROR_UNAUTHORIZED
				);
				return;
			}
			if (!id || !format) {
				res.status(httpStatusCodes.CLIENT_ERROR_BAD_REQUEST).json({
					isSuccess: false,
					error: {code: "missing_params", message: "Collection id and format are required."},
				});
				return;
			}

			if (!SUPPORTED_DOWNLOAD_FORMATS.includes(format as ExportFormat)) {
				res.status(httpStatusCodes.CLIENT_ERROR_BAD_REQUEST).json({
					isSuccess: false,
					error: {code: "unsupported_format", message: `Unsupported format: ${format}`},
				});
				return;
			}

			try {
				const [row] = await db
					.select()
					.from(collections)
					.where(eq(collections.id, id))
					.limit(1);

				if (!row || row.userId !== userId || row.deletedAt) {
					res.status(httpStatusCodes.CLIENT_ERROR_NOT_FOUND).json({
						isSuccess: false,
						error: {code: "not_found", message: "Collection not found"},
					});
					return;
				}

				if (!row.currentVersionId) {
					res.status(httpStatusCodes.CLIENT_ERROR_BAD_REQUEST).json({
						isSuccess: false,
						error: {
							code: "not_ready",
							message: "Collection is still being generated.",
						},
					});
					return;
				}

				const [versionRow] = await db
					.select()
					.from(collectionVersions)
					.where(eq(collectionVersions.id, row.currentVersionId))
					.limit(1);

				if (!versionRow?.openapiDoc) {
					res.status(httpStatusCodes.CLIENT_ERROR_BAD_REQUEST).json({
						isSuccess: false,
						error: {code: "not_ready", message: "No OpenAPI document on this version."},
					});
					return;
				}

				const artifact = await exporterService.export(
					format as ExportFormat,
					versionRow.openapiDoc,
					row.name
				);

				res.setHeader("Content-Type", artifact.mimeType);
				res.setHeader(
					"Content-Disposition",
					`attachment; filename="${artifact.filename}"`
				);
				res.setHeader("Content-Length", artifact.body.length.toString());
				// Expose the filename header so the browser fetch in the FE can
				// pick the right filename from Content-Disposition.
				res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
				res.status(httpStatusCodes.SUCCESS_OK).send(artifact.body);

				logger.info(null, "Collection downloaded", null, {
					collectionId: id,
					format,
					userId,
					bytes: artifact.body.length,
				});
			} catch (error) {
				next(error);
			}
		}
	);

	/**
	 * Rename a collection. Free — no credit deducted.
	 *
	 * Body: { name: string }
	 *
	 * "Update" (re-running generation against a new doc/prompt) is a separate,
	 * paid endpoint that will land in Phase 4 alongside the real AI worker.
	 */
	route.patch(
		"/collections/:id",
		isAuthorized,
		async (req: Request, res: Response, next: NextFunction): Promise<void> => {
			const userId = req.user?.id;
			const id = req.params.id;

			if (!userId) {
				res.fail(
					genericServiceErrors.auth.NoAuthorizationToken,
					httpStatusCodes.CLIENT_ERROR_UNAUTHORIZED
				);
				return;
			}
			if (!id) {
				res.status(httpStatusCodes.CLIENT_ERROR_BAD_REQUEST).json({
					isSuccess: false,
					error: {code: "missing_id", message: "Collection id is required."},
				});
				return;
			}

			try {
				const parsed = updateCollectionSchema.parse(req.body);

				const [existing] = await db
					.select({userId: collections.userId, deletedAt: collections.deletedAt})
					.from(collections)
					.where(eq(collections.id, id))
					.limit(1);

				if (!existing || existing.userId !== userId || existing.deletedAt) {
					res.status(httpStatusCodes.CLIENT_ERROR_NOT_FOUND).json({
						isSuccess: false,
						error: {code: "not_found", message: "Collection not found"},
					});
					return;
				}

				if (parsed.name !== undefined) {
					await db
						.update(collections)
						.set({name: parsed.name})
						.where(eq(collections.id, id));
				}

				res.ok({id});
			} catch (error) {
				next(error);
			}
		}
	);

	/**
	 * Soft delete a collection. Sets `deleted_at` so it disappears from the
	 * caller's list but its rows + ledger entries are retained for audit.
	 */
	route.delete(
		"/collections/:id",
		isAuthorized,
		async (req: Request, res: Response, next: NextFunction): Promise<void> => {
			const userId = req.user?.id;
			const id = req.params.id;

			if (!userId) {
				res.fail(
					genericServiceErrors.auth.NoAuthorizationToken,
					httpStatusCodes.CLIENT_ERROR_UNAUTHORIZED
				);
				return;
			}
			if (!id) {
				res.status(httpStatusCodes.CLIENT_ERROR_BAD_REQUEST).json({
					isSuccess: false,
					error: {code: "missing_id", message: "Collection id is required."},
				});
				return;
			}

			try {
				const [existing] = await db
					.select({userId: collections.userId, deletedAt: collections.deletedAt})
					.from(collections)
					.where(eq(collections.id, id))
					.limit(1);

				if (!existing || existing.userId !== userId || existing.deletedAt) {
					res.status(httpStatusCodes.CLIENT_ERROR_NOT_FOUND).json({
						isSuccess: false,
						error: {code: "not_found", message: "Collection not found"},
					});
					return;
				}

				await db
					.update(collections)
					.set({deletedAt: new Date(), shareEnabled: false, shareSlug: null})
					.where(eq(collections.id, id));

				logger.info(null, "Collection soft-deleted", null, {collectionId: id, userId});
				res.ok({id});
			} catch (error) {
				next(error);
			}
		}
	);

	/**
	 * Toggle public sharing for a collection.
	 *
	 * Body: { enabled: boolean }
	 *
	 * Enabling generates a fresh random slug (so old links die when sharing is
	 * disabled and re-enabled). Disabling clears the slug.
	 */
	route.post(
		"/collections/:id/share",
		isAuthorized,
		async (req: Request, res: Response, next: NextFunction): Promise<void> => {
			const userId = req.user?.id;
			const id = req.params.id;

			if (!userId) {
				res.fail(
					genericServiceErrors.auth.NoAuthorizationToken,
					httpStatusCodes.CLIENT_ERROR_UNAUTHORIZED
				);
				return;
			}
			if (!id) {
				res.status(httpStatusCodes.CLIENT_ERROR_BAD_REQUEST).json({
					isSuccess: false,
					error: {code: "missing_id", message: "Collection id is required."},
				});
				return;
			}

			try {
				const parsed = shareToggleSchema.parse(req.body);

				const [existing] = await db
					.select({userId: collections.userId, deletedAt: collections.deletedAt})
					.from(collections)
					.where(eq(collections.id, id))
					.limit(1);

				if (!existing || existing.userId !== userId || existing.deletedAt) {
					res.status(httpStatusCodes.CLIENT_ERROR_NOT_FOUND).json({
						isSuccess: false,
						error: {code: "not_found", message: "Collection not found"},
					});
					return;
				}

				const slug = parsed.enabled ? nanoid(16) : null;

				await db
					.update(collections)
					.set({shareEnabled: parsed.enabled, shareSlug: slug})
					.where(eq(collections.id, id));

				res.ok({shareEnabled: parsed.enabled, shareSlug: slug});
			} catch (error) {
				next(error);
			}
		}
	);
};
