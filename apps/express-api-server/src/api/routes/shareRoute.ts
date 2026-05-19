import type {NextFunction, Request, Response, Router} from "express";

import {collectionVersions, collections, db, eq} from "@requestai/database";

import {httpStatusCodes} from "@customTypes/networkTypes";
import logger from "@loaders/logger";
import {exporterService, type ExportFormat} from "@services/exporters";

const SUPPORTED_FORMATS: ExportFormat[] = ["postman", "bruno", "hoppscotch", "thunder"];

/**
 * Public share routes — no auth required.
 *
 * Anyone with a non-expired `share_slug` can fetch the collection and
 * download per-platform artifacts. When the owner disables sharing the
 * slug is wiped (and rotated on re-enable), so old links 404 immediately.
 *
 * Mounted under `/api/share/*` outside the versioning middleware so the
 * URLs stay short and stable for sharing.
 */
export default (route: Router): void => {
	route.get(
		"/share/:slug/download/:format",
		async (req: Request, res: Response, next: NextFunction): Promise<void> => {
			const slug = req.params.slug;
			const format = req.params.format;

			if (!slug || !format) {
				res.status(httpStatusCodes.CLIENT_ERROR_BAD_REQUEST).json({
					isSuccess: false,
					error: {code: "missing_params", message: "Share slug and format are required."},
				});
				return;
			}
			if (!SUPPORTED_FORMATS.includes(format as ExportFormat)) {
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
					.where(eq(collections.shareSlug, slug))
					.limit(1);

				if (!row || !row.shareEnabled || row.deletedAt || !row.currentVersionId) {
					res.status(httpStatusCodes.CLIENT_ERROR_NOT_FOUND).json({
						isSuccess: false,
						error: {code: "not_found", message: "Share link not found"},
					});
					return;
				}

				const [versionRow] = await db
					.select()
					.from(collectionVersions)
					.where(eq(collectionVersions.id, row.currentVersionId))
					.limit(1);

				if (!versionRow?.openapiDoc) {
					res.status(httpStatusCodes.CLIENT_ERROR_NOT_FOUND).json({
						isSuccess: false,
						error: {code: "not_ready", message: "Shared collection has no document yet."},
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
				res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");
				res.status(httpStatusCodes.SUCCESS_OK).send(artifact.body);

				logger.info(null, "Shared collection downloaded", null, {
					slug,
					format,
					bytes: artifact.body.length,
				});
			} catch (error) {
				next(error);
			}
		}
	);

	/**
	 * Lightweight metadata fetch for a share viewer page. Returns the
	 * collection name and what formats are available.
	 */
	route.get(
		"/share/:slug",
		async (req: Request, res: Response, next: NextFunction): Promise<void> => {
			const slug = req.params.slug;
			if (!slug) {
				res.status(httpStatusCodes.CLIENT_ERROR_BAD_REQUEST).json({
					isSuccess: false,
					error: {code: "missing_slug", message: "Share slug is required."},
				});
				return;
			}

			try {
				const [row] = await db
					.select({
						id: collections.id,
						name: collections.name,
						shareEnabled: collections.shareEnabled,
						deletedAt: collections.deletedAt,
						currentVersionId: collections.currentVersionId,
						createdAt: collections.createdAt,
					})
					.from(collections)
					.where(eq(collections.shareSlug, slug))
					.limit(1);

				if (!row || !row.shareEnabled || row.deletedAt) {
					res.status(httpStatusCodes.CLIENT_ERROR_NOT_FOUND).json({
						isSuccess: false,
						error: {code: "not_found", message: "Share link not found"},
					});
					return;
				}

				let platforms: string[] = [];
				if (row.currentVersionId) {
					const [versionRow] = await db
						.select({sourceInput: collectionVersions.sourceInput})
						.from(collectionVersions)
						.where(eq(collectionVersions.id, row.currentVersionId))
						.limit(1);
					platforms = versionRow?.sourceInput?.platforms ?? [];
				}

				res.status(httpStatusCodes.SUCCESS_OK).json({
					name: row.name,
					createdAt: row.createdAt.toISOString(),
					ready: Boolean(row.currentVersionId),
					platforms,
				});
			} catch (error) {
				next(error);
			}
		}
	);
};
