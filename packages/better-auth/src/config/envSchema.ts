import {z} from "zod";

/**
 * Environment schema for better-auth configuration.
 * Validates all required environment variables.
 */
export const envSchema = z.object({
	// Core better-auth settings
	BETTER_AUTH_SECRET: z.string().min(64, "Secret must be at least 64 characters"),
	BETTER_AUTH_BASE_URL: z.string().url("Must be a valid URL"),
	BETTER_AUTH_BASE_PATH: z.string().default("/api/auth"),

	// Cookie settings
	BETTER_AUTH_COOKIE_SECURE: z
		.enum(["true", "false"])
		.default("false")
		.transform((val) => val === "true"),
	BETTER_AUTH_COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),

	// Response envelope
	BETTER_AUTH_ENABLE_RESPONSE_ENVELOPE: z
		.enum(["true", "false"])
		.default("true")
		.transform((val) => val === "true"),

	// Comma-separated list of origins Better Auth will accept requests from.
	// The configured BETTER_AUTH_BASE_URL is always trusted; this is for
	// additional origins (e.g. a separate frontend dev server).
	BETTER_AUTH_TRUSTED_ORIGINS: z
		.string()
		.optional()
		.transform((val) =>
			(val ?? "")
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean)
		),

	// Google OAuth (optional — leave both blank to disable the Google provider)
	GOOGLE_CLIENT_ID: z.string().optional(),
	GOOGLE_CLIENT_SECRET: z.string().optional(),

	// Signup credit grant — how many free credits a new user receives
	SIGNUP_CREDIT_GRANT: z
		.string()
		.default("3")
		.transform((val) => parseInt(val, 10))
		.pipe(z.number().int().min(0)),

	// Database (inherited from @requestai/database, but we reference it here)
	DATABASE_URL: z.string().optional(),
});

export type EnvConfig = z.infer<typeof envSchema>;
