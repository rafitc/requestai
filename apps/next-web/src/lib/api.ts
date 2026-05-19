"use client";

import env from "@/config";
import {getBearerToken} from "@/lib/authClient";

/**
 * Thin fetch wrapper for the RequestAi v1 API. Attaches the bearer token
 * from authClient storage and unwraps the backend's response envelope
 * (`{isSuccess, data, error, meta, httpStatusCode}`).
 */

export class ApiError extends Error {
	readonly status: number;
	readonly payload: unknown;

	constructor(status: number, message: string, payload: unknown) {
		super(message);
		this.name = "ApiError";
		this.status = status;
		this.payload = payload;
	}
}

interface ResponseEnvelope<T> {
	isSuccess: boolean;
	httpStatusCode: number;
	meta?: unknown;
	error: {
		error?: string;
		message?: string;
		details?: unknown;
		[k: string]: unknown;
	} | null;
	data: T | null;
}

export async function apiFetch<T>(
	path: string,
	init?: RequestInit
): Promise<T> {
	const headers = new Headers(init?.headers);
	if (!headers.has("Content-Type") && init?.body) {
		headers.set("Content-Type", "application/json");
	}
	const token = getBearerToken();
	if (token) headers.set("Authorization", `Bearer ${token}`);

	const res = await fetch(`${env.API_BASE_URL}/api/v1${path}`, {
		...init,
		headers,
	});

	let body: ResponseEnvelope<T> | unknown = null;
	try {
		body = await res.json();
	} catch {
		/* fall through */
	}

	const envelope =
		body && typeof body === "object" && "isSuccess" in (body as object)
			? (body as ResponseEnvelope<T>)
			: null;

	if (!res.ok || (envelope && envelope.isSuccess === false)) {
		const message =
			envelope?.error?.message ||
			(body as {error?: {message?: string}})?.error?.message ||
			res.statusText ||
			"Request failed";
		throw new ApiError(res.status, message, body);
	}

	if (envelope) {
		return envelope.data as T;
	}
	return body as T;
}

/**
 * Authenticated file download. Fetches the resource as a Blob and triggers
 * a browser download via a transient object URL. The filename is taken from
 * the response's Content-Disposition header when present, otherwise from the
 * caller's `fallbackFilename`.
 */
export async function downloadFile(
	path: string,
	fallbackFilename: string
): Promise<void> {
	const headers = new Headers();
	const token = getBearerToken();
	if (token) headers.set("Authorization", `Bearer ${token}`);

	const res = await fetch(`${env.API_BASE_URL}/api/v1${path}`, {headers});

	if (!res.ok) {
		let payload: unknown = null;
		try {
			payload = await res.json();
		} catch {
			/* ignore */
		}
		const message =
			(payload as {error?: {message?: string}})?.error?.message ||
			res.statusText ||
			"Download failed";
		throw new ApiError(res.status, message, payload);
	}

	const disposition = res.headers.get("content-disposition") || "";
	const match = disposition.match(/filename="?([^"]+)"?/i);
	const filename = match?.[1] || fallbackFilename;

	const blob = await res.blob();
	const url = URL.createObjectURL(blob);
	const anchor = document.createElement("a");
	anchor.href = url;
	anchor.download = filename;
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	URL.revokeObjectURL(url);
}
