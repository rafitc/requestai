import logger from "@loaders/logger";

import {
	detectFromStructured,
	detectFromText,
	detectFromYaml,
	isLikelySpaShell,
	isMarkdown,
	tryParseJson,
} from "./detect";
import type {DetectedFormat, PreflightInput, PreflightResult} from "./types";

/**
 * Maximum bytes we'll fetch from a remote URL during preflight. The full
 * download happens later in the worker; preflight just needs enough to
 * classify the content.
 */
const PREFLIGHT_MAX_FETCH_BYTES = 2 * 1024 * 1024; // 2 MB

const FETCH_TIMEOUT_MS = 8000;

/**
 * Pretty labels used in the user-visible summary.
 */
const formatLabels: Record<DetectedFormat, string> = {
	"openapi-3-json": "OpenAPI 3 (JSON)",
	"openapi-3-yaml": "OpenAPI 3 (YAML)",
	"swagger-2-json": "Swagger 2.0 (JSON)",
	"swagger-2-yaml": "Swagger 2.0 (YAML)",
	"postman-v2": "Postman Collection v2",
	har: "HAR",
	"api-blueprint": "API Blueprint",
	"graphql-sdl": "GraphQL SDL",
	asyncapi: "AsyncAPI",
	markdown: "Markdown",
	"html-docs": "HTML documentation",
	pdf: "PDF",
	docx: "DOCX",
	unknown: "unrecognized",
};

const formatsRequiringAi = new Set<DetectedFormat>([
	"markdown",
	"html-docs",
	"pdf",
	"docx",
]);

interface FetchedBody {
	body: string;
	contentType: string | null;
	byteSize: number;
}

async function fetchForPreflight(url: string): Promise<FetchedBody> {
	const controller = new AbortController();
	const timeout = setTimeout(() => {return controller.abort();}, FETCH_TIMEOUT_MS);

	try {
		const response = await fetch(url, {
			signal: controller.signal,
			redirect: "follow",
			headers: {
				// Some doc sites block default fetch UAs.
				"user-agent": "RequestAi-Preflight/1.0 (+https://requestai)",
				accept: "*/*",
			},
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status} ${response.statusText}`);
		}

		const contentType = response.headers.get("content-type");
		const reader = response.body?.getReader();
		if (!reader) {
			const text = await response.text();
			return {body: text, contentType, byteSize: text.length};
		}

		const chunks: Uint8Array[] = [];
		let total = 0;
		 
		while (true) {
			const {done, value} = await reader.read();
			if (done) {break;}
			chunks.push(value);
			total += value.length;
			if (total >= PREFLIGHT_MAX_FETCH_BYTES) {
				await reader.cancel();
				break;
			}
		}

		const combined = new Uint8Array(total);
		let offset = 0;
		for (const chunk of chunks) {
			combined.set(chunk, offset);
			offset += chunk.length;
		}
		const body = new TextDecoder("utf-8", {fatal: false}).decode(combined);
		return {body, contentType, byteSize: total};
	} finally {
		clearTimeout(timeout);
	}
}

function rejectionFromUnreachable(message: string): PreflightResult {
	return {
		supported: false,
		reason: "unreachable",
		message: `We couldn't fetch that URL: ${message}. Check the link is public and reachable, then try again.`,
	};
}

function buildSuccessResult(args: {
	format: DetectedFormat;
	canonicalUrl: string;
	requiresAi: boolean;
	byteSize: number;
}): PreflightResult {
	const warnings: string[] = [];
	if (args.byteSize >= PREFLIGHT_MAX_FETCH_BYTES) {
		warnings.push(
			"Document is large; generation may take 1-2 minutes."
		);
	}
	return {
		supported: true,
		format: args.format,
		requiresAi: args.requiresAi,
		canonicalUrl: args.canonicalUrl,
		summary: args.requiresAi
			? `Detected ${formatLabels[args.format]} — AI will read and structure it into a collection.`
			: `Detected ${formatLabels[args.format]} — we'll convert it directly (no AI cost).`,
		warnings,
	};
}

class IngestService {
	/**
	 * Classify the input without committing to a job. Used by the create-modal
	 * "Analyze source" step so we can reject unsupported sources before the
	 * user is charged a credit.
	 */
	async preflight(input: PreflightInput): Promise<PreflightResult> {
		if (input.kind !== "url") {
			return {
				supported: false,
				reason: "invalid_input",
				message: "Only URL inputs are supported in this preflight build.",
			};
		}

		let urlObj: URL;
		try {
			urlObj = new URL(input.url);
		} catch {
			return {
				supported: false,
				reason: "invalid_input",
				message: "That doesn't look like a valid URL.",
			};
		}

		if (urlObj.protocol !== "http:" && urlObj.protocol !== "https:") {
			return {
				supported: false,
				reason: "invalid_input",
				message: "Only http(s) URLs are supported.",
			};
		}

		let fetched: FetchedBody;
		try {
			fetched = await fetchForPreflight(urlObj.toString());
		} catch (error) {
			const message = error instanceof Error ? error.message : "unknown error";
			logger.warning(null, "Preflight fetch failed", null, {url: urlObj.toString(), message});
			return rejectionFromUnreachable(message);
		}

		const {body, contentType, byteSize} = fetched;
		const canonicalUrl = urlObj.toString();

		// 1. JSON-structured detection
		const jsonParsed = tryParseJson(body);
		if (jsonParsed !== null) {
			const detected = detectFromStructured(jsonParsed);
			if (detected) {
				if (detected === "asyncapi") {
					return {
						supported: false,
						reason: "unsupported_async_api",
						message:
							"AsyncAPI documents are not supported yet — collection targets (Postman/Bruno/Hoppscotch/Thunder) don't model async APIs cleanly.",
					};
				}
				return buildSuccessResult({
					format: detected,
					canonicalUrl,
					requiresAi: false,
					byteSize,
				});
			}
		}

		// 2. YAML-structured detection (covers OpenAPI YAML, etc.)
		if (!jsonParsed) {
			const yamlDetected = detectFromYaml(body);
			if (yamlDetected) {
				if (yamlDetected === "asyncapi") {
					return {
						supported: false,
						reason: "unsupported_async_api",
						message:
							"AsyncAPI documents are not supported yet — collection targets don't model async APIs cleanly.",
					};
				}
				return buildSuccessResult({
					format: yamlDetected,
					canonicalUrl,
					requiresAi: false,
					byteSize,
				});
			}
		}

		// 3. Text-heuristic detection (API Blueprint, GraphQL SDL)
		const textDetected = detectFromText(body);
		if (textDetected) {
			return buildSuccessResult({
				format: textDetected,
				canonicalUrl,
				requiresAi: false,
				byteSize,
			});
		}

		// 4. Markdown detection
		if (isMarkdown(contentType, body)) {
			return buildSuccessResult({
				format: "markdown",
				canonicalUrl,
				requiresAi: true,
				byteSize,
			});
		}

		// 5. HTML — accept only if it has meaningful body text (not a JS shell)
		const isHtml = /<html\b/i.test(body.slice(0, 1024)) || (contentType?.includes("text/html") ?? false);
		if (isHtml) {
			if (isLikelySpaShell(body)) {
				return {
					supported: false,
					reason: "js_rendered_spa",
					message:
						"This URL appears to be a JavaScript-rendered docs site (Mintlify / ReadMe / etc.). We can't read it directly yet. Try uploading the underlying OpenAPI spec, or paste the rendered docs as Markdown/PDF.",
				};
			}
			return buildSuccessResult({
				format: "html-docs",
				canonicalUrl,
				requiresAi: true,
				byteSize,
			});
		}

		// 6. Give up — unrecognized binary or unknown text.
		return {
			supported: false,
			reason: "binary_unknown",
			message:
				"We couldn't recognize the document format at that URL. Supported formats: OpenAPI/Swagger, Postman, HAR, API Blueprint, GraphQL SDL, Markdown, HTML docs, PDF (via upload), DOCX (via upload).",
		};
	}
}

const ingestService = new IngestService();
export default ingestService;
