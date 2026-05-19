import type {NextFunction, Request, Response, Router} from "express";

import {aiJobs, db, eq} from "@requestai/database";

import {isAuthorized} from "@api/middlewares/authorizationMiddleware";
import {httpStatusCodes} from "@customTypes/networkTypes";
import {genericServiceErrors} from "@constants/errors/genericServiceErrors";

/**
 * Job status route. Polled by the frontend during the create flow.
 *
 * GET /jobs/:id  — returns current state + progress step for the caller's job.
 */
export default (route: Router): void => {
	route.get(
		"/jobs/:id",
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
					error: {code: "missing_id", message: "Job id is required."},
				});
				return;
			}

			try {
				const [row] = await db
					.select()
					.from(aiJobs)
					.where(eq(aiJobs.id, id))
					.limit(1);

				if (!row || row.userId !== userId) {
					res.status(httpStatusCodes.CLIENT_ERROR_NOT_FOUND).json({
						success: false,
						error: {code: "not_found", message: "Job not found"},
					});
					return;
				}

				res.ok({
					id: row.id,
					state: row.state,
					progressStep: row.progressStep,
					collectionId: row.collectionId,
					error: row.error,
					startedAt: row.startedAt?.toISOString() ?? null,
					finishedAt: row.finishedAt?.toISOString() ?? null,
					createdAt: row.createdAt.toISOString(),
				});
			} catch (error) {
				next(error);
			}
		}
	);
};
