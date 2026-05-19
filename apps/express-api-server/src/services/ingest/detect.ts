import yaml from "js-yaml";

import type {DetectedFormat} from "./types";

/**
 * Heuristic format detectors. Each takes the raw fetched body (string)
 * plus an optional content-type and returns the detected format or null
 * if it doesn't match.
 *
 * Order matters in the orchestrator: structured formats (JSON/YAML) are
 * checked first, then text-heuristic formats, then HTML last.
 */

const MAX_PARSE_BYTES = 5 * 1024 * 1024; // 5 MB — guard against accidental huge inputs

function tryParseJson(body: string): unknown | null {
	if (body.length > MAX_PARSE_BYTES) {return null;}
	try {
		return JSON.parse(body);
	} catch {
		return null;
	}
}

function tryParseYaml(body: string): unknown | null {
	if (body.length > MAX_PARSE_BYTES) {return null;}
	try {
		return yaml.load(body);
	} catch {
		return null;
	}
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function detectFromStructured(parsed: unknown): DetectedFormat | null {
	if (!isObject(parsed)) {return null;}

	// OpenAPI 3.x: top-level "openapi" key with a string version >= "3"
	if (typeof parsed.openapi === "string" && parsed.openapi.startsWith("3")) {
		return "openapi-3-json";
	}

	// Swagger 2.0: top-level "swagger": "2.0"
	if (parsed.swagger === "2.0") {
		return "swagger-2-json";
	}

	// AsyncAPI: top-level "asyncapi" key
	if (typeof parsed.asyncapi === "string") {
		return "asyncapi";
	}

	// Postman Collection v2.x: has info.schema starting with the Postman URL
	const info = parsed.info;
	if (isObject(info) && typeof info.schema === "string" && info.schema.includes("schema.getpostman.com/collection")) {
		return "postman-v2";
	}

	// HAR: has top-level "log" with "version" and "entries"
	const log = parsed.log;
	if (isObject(log) && typeof log.version === "string" && Array.isArray(log.entries)) {
		return "har";
	}

	return null;
}

/**
 * Try YAML, then if it parses to a structured object run the same checks
 * as JSON but report YAML variants.
 */
export function detectFromYaml(body: string): DetectedFormat | null {
	const parsed = tryParseYaml(body);
	if (!isObject(parsed)) {return null;}

	if (typeof parsed.openapi === "string" && parsed.openapi.startsWith("3")) {
		return "openapi-3-yaml";
	}
	if (parsed.swagger === "2.0") {
		return "swagger-2-yaml";
	}
	if (typeof parsed.asyncapi === "string") {
		return "asyncapi";
	}
	return null;
}

/**
 * Text-heuristic detectors run on raw body.
 */
export function detectFromText(body: string): DetectedFormat | null {
	const head = body.slice(0, 4096);

	// API Blueprint starts with `FORMAT: 1A`
	if (/^\s*FORMAT:\s*1A\b/m.test(head)) {
		return "api-blueprint";
	}

	// GraphQL SDL: presence of `type Query`, `schema {`, or `scalar` at top level
	if (/^\s*(type\s+Query|schema\s*\{|scalar\s+[A-Z]\w*)/m.test(head)) {
		return "graphql-sdl";
	}

	return null;
}

/**
 * Detect "is this an empty SPA shell?". Heuristic: HTML where the body
 * contains < N chars of meaningful (non-script) text after stripping tags.
 */
const SPA_TEXT_THRESHOLD = 400;

export function isLikelySpaShell(html: string): boolean {
	const stripped = html
		.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
		.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
		.replace(/<[^>]+>/g, " ")
		.replace(/\s+/g, " ")
		.trim();

	return stripped.length < SPA_TEXT_THRESHOLD;
}

export function isMarkdown(contentType: string | null, body: string): boolean {
	if (contentType && /(text\/markdown|text\/x-markdown)/i.test(contentType)) {return true;}
	// Cheap heuristic: lots of `## ` headings and not enclosed in `<html`
	if (/<html\b/i.test(body.slice(0, 1024))) {return false;}
	const headingCount = (body.match(/^#{1,6}\s/gm) || []).length;
	return headingCount >= 3;
}

export {tryParseJson, tryParseYaml};
