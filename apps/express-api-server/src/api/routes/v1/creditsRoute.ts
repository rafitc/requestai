import type {NextFunction, Request, Response, Router} from "express";

import {creditLedger, db, eq, sql} from "@requestai/database";

import {isAuthorized} from "@api/middlewares/authorizationMiddleware";
import {httpStatusCodes} from "@customTypes/networkTypes";
import {genericServiceErrors} from "@constants/errors/genericServiceErrors";

/**
 * Credits route.
 *
 * GET /credits/balance  — current credit balance for the caller.
 *
 * Balance is computed by summing the ledger; we accept the O(N) cost at
 * read time for now because N is small (one row per credit movement) and
 * it lets us treat `balance_after` as a denormalized check rather than
 * the source of truth.
 */
export default (route: Router): void => {
	route.get(
		"/credits/balance",
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
				const [row] = await db
					.select({balance: sql<number>`coalesce(sum(${creditLedger.delta}), 0)::int`})
					.from(creditLedger)
					.where(eq(creditLedger.userId, userId));

				res.ok({balance: row?.balance ?? 0});
			} catch (error) {
				next(error);
			}
		}
	);
};
