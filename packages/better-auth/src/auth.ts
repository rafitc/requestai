/**
 * Runtime Better Auth configuration.
 *
 * This file creates the actual better-auth instance with:
 * - Database connection from @requestai/database
 * - Environment-based configuration
 * - All plugins from shared config
 */
import {betterAuth} from "better-auth";
import {drizzleAdapter} from "better-auth/adapters/drizzle";
import {db, creditLedger} from "@requestai/database";
import * as schema from "@requestai/database/schema";

import config from "@/config/index.js";
import {betterAuthSharedConfig, corePlugins, devPlugins} from "./auth.shared.js";

/**
 * Determine which plugins to use based on environment.
 * Returns core plugins in production, core + dev plugins otherwise.
 */
const getPlugins = () => {
	if (process.env.NODE_ENV === "production") {
		return [...corePlugins];
	}
	return [...corePlugins, ...devPlugins];
};

/**
 * Build the social-providers object from env. Empty object disables socials.
 */
const getSocialProviders = () => {
	if (config.betterAuth.google) {
		return {
			google: {
				clientId: config.betterAuth.google.clientId,
				clientSecret: config.betterAuth.google.clientSecret,
			},
		};
	}
	return {};
};

/**
 * Grant the configured number of free credits to a newly-created user.
 *
 * Runs inside an immediate transaction so the user row and the ledger row
 * commit together — if the ledger insert fails, the user creation is
 * rolled back too (better-auth's after-hook is wrapped in its own tx).
 */
async function grantSignupCredits(userId: string): Promise<void> {
	const amount = config.betterAuth.signupCreditGrant;
	if (amount <= 0) return;

	await db.insert(creditLedger).values({
		userId,
		delta: amount,
		balanceAfter: amount,
		reason: "signup_grant",
		refId: null,
	});
}

/**
 * The main better-auth instance.
 * Import this in your Express/Hono routes.
 */
export const auth = betterAuth({
	// Base configuration from environment
	baseURL: config.betterAuth.baseURL,
	basePath: config.betterAuth.basePath,
	secret: config.betterAuth.secret,

	// Additional origins Better Auth will accept requests from. baseURL is
	// trusted implicitly; this is for the separate frontend dev server.
	trustedOrigins: config.betterAuth.trustedOrigins,

	// Database adapter using existing Drizzle instance
	database: drizzleAdapter(db, {
		...betterAuthSharedConfig.drizzleAdapterConfig,
		schema: schema,
	}),

	// Email and password settings
	emailAndPassword: betterAuthSharedConfig.emailAndPassword,

	// Email verification settings
	emailVerification: betterAuthSharedConfig.emailVerification,

	// Social providers (Google) from env
	socialProviders: getSocialProviders(),

	// Plugins
	plugins: getPlugins(),

	// Database hooks — grant free credits on signup
	databaseHooks: {
		user: {
			create: {
				after: async (user) => {
					await grantSignupCredits(user.id);
				},
			},
		},
	},

	// Advanced settings
	advanced: {
		...betterAuthSharedConfig.advanced,
		defaultCookieAttributes: {
			secure: config.betterAuth.cookies.secure,
			httpOnly: true,
			sameSite: config.betterAuth.cookies.sameSite,
			path: "/",
		},
	},
});

/**
 * Export the auth type for type inference.
 */
export type Auth = typeof auth;
