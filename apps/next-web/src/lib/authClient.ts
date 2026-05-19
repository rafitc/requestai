"use client";

import {createAuthClient} from "better-auth/react";
import {emailOTPClient} from "better-auth/client/plugins";

import env from "@/config";

const BEARER_STORAGE_KEY = "requestai_bearer_token";

/**
 * Read the bearer token (browser only — returns empty string on SSR).
 */
export function getBearerToken(): string {
	if (typeof window === "undefined") return "";
	return window.localStorage.getItem(BEARER_STORAGE_KEY) || "";
}

export function clearBearerToken(): void {
	if (typeof window === "undefined") return;
	window.localStorage.removeItem(BEARER_STORAGE_KEY);
}

/**
 * Better Auth client configured for cross-origin bearer-token auth.
 *
 * Flow: on sign-in, the backend sends `set-auth-token` in a response header
 * (the bearer plugin); we capture it from `onSuccess` and stash it in
 * localStorage. Every subsequent request attaches it as `Authorization: Bearer`.
 *
 * The custom fetch wrapper in `./api.ts` reads the same key so non-auth
 * routes (collections, jobs, credits) authenticate the same way.
 */
export const authClient = createAuthClient({
	baseURL: env.API_BASE_URL,
	plugins: [emailOTPClient()],
	fetchOptions: {
		auth: {
			type: "Bearer",
			token: () => getBearerToken(),
		},
		onSuccess: (ctx) => {
			const token = ctx.response.headers.get("set-auth-token");
			if (token && typeof window !== "undefined") {
				window.localStorage.setItem(BEARER_STORAGE_KEY, token);
			}
		},
	},
});
