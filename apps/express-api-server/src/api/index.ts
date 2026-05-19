import {Router} from "express";

import {apiVersioningMiddleware} from "@api/middlewares";
import authRoute from "@api/routes/v1/authRoute";
import healthRoute from "@api/routes/healthRoute";
import shareRoute from "@api/routes/shareRoute";
import {registerV1Routes} from "@api/routes/v1";

/**
 * Returns the configured API router with all routes attached.
 *
 * Route structure:
 * - /api/health  — unversioned health check (for load balancers, monitoring)
 * - /api/auth/*  — Better Auth catch-all; intentionally NOT versioned because
 *                  Better Auth's basePath default is /api/auth and its own
 *                  endpoint contracts are managed by the upstream library.
 * - /api/v1/*    — versioned business endpoints (users, collections, jobs, …)
 */
export default (): Router => {
	const apiRouter = Router();

	// Unversioned health check endpoint
	healthRoute(apiRouter);

	// Better Auth catch-all (also unversioned). Must be registered BEFORE the
	// versioning middleware so its /api/auth/... paths don't get rejected.
	authRoute(apiRouter);

	// Public share routes — no auth, no version prefix. Registered before
	// the versioning middleware so /api/share/* slugs work directly.
	shareRoute(apiRouter);

	// Versioning middleware guards everything below — only versioned business
	// endpoints from here on out.
	apiRouter.use(apiVersioningMiddleware);

	// Mount v1 routes
	apiRouter.use("/v1", registerV1Routes());

	return apiRouter;
};
