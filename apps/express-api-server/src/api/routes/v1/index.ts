import {Router} from "express";

import collectionsRoute from "./collectionsRoute";
import creditsRoute from "./creditsRoute";
import jobsRoute from "./jobsRoute";
import usersRoute from "./usersRoute";
import verificationRoute from "./verificationRoute";

/**
 * Registers all v1 API routes.
 *
 * Note: the Better Auth catch-all (/api/auth/*) is registered in `api/index.ts`
 * outside of the versioning middleware, so it is intentionally absent here.
 *
 * @returns Express router with all v1 routes mounted
 */
export const registerV1Routes = (): Router => {
	const v1Router = Router();

	// User routes
	usersRoute(v1Router);

	// Verification routes
	verificationRoute(v1Router);

	// Collections (create + preflight + list + detail)
	collectionsRoute(v1Router);

	// AI job status polling
	jobsRoute(v1Router);

	// Credit balance
	creditsRoute(v1Router);

	return v1Router;
};

export default registerV1Routes;
