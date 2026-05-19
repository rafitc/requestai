import {envSchema} from "./envSchema.js";
import {defaultAllowedEndpoints} from "./allowedEndpoints.js";

/**
 * Load and validate environment configuration.
 * Falls back to process.env if no custom env is provided.
 */
function loadConfig() {
	const result = envSchema.safeParse(process.env);

	if (!result.success) {
		console.error("Better-Auth configuration error:", result.error.format());
		throw new Error("Invalid better-auth configuration. Check environment variables.");
	}

	const env = result.data;

	const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

	return {
		betterAuth: {
			secret: env.BETTER_AUTH_SECRET,
			baseURL: env.BETTER_AUTH_BASE_URL,
			basePath: env.BETTER_AUTH_BASE_PATH,
			cookies: {
				secure: env.BETTER_AUTH_COOKIE_SECURE,
				sameSite: env.BETTER_AUTH_COOKIE_SAME_SITE as "lax" | "strict" | "none",
			},
			enableResponseEnvelope: env.BETTER_AUTH_ENABLE_RESPONSE_ENVELOPE,
			allowedEndpoints: defaultAllowedEndpoints,
			google: googleEnabled
				? {
						clientId: env.GOOGLE_CLIENT_ID as string,
						clientSecret: env.GOOGLE_CLIENT_SECRET as string,
					}
				: null,
			signupCreditGrant: env.SIGNUP_CREDIT_GRANT,
			trustedOrigins: env.BETTER_AUTH_TRUSTED_ORIGINS,
		},
	};
}

const config = loadConfig();

export default config;
export {defaultAllowedEndpoints, isEndpointAllowed} from "./allowedEndpoints.js";
export type {EnvConfig} from "./envSchema.js";
