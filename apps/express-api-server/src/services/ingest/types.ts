/**
 * Detected API-documentation format. Drives whether we need an AI call
 * downstream (deterministic conversions skip the AI entirely).
 */
export const detectedFormats = [
	"openapi-3-json",
	"openapi-3-yaml",
	"swagger-2-json",
	"swagger-2-yaml",
	"postman-v2",
	"har",
	"api-blueprint",
	"graphql-sdl",
	"asyncapi",
	"markdown",
	"html-docs",
	"pdf",
	"docx",
	"unknown",
] as const;

export type DetectedFormat = (typeof detectedFormats)[number];

export const rejectionReasons = [
	"unreachable",
	"login_walled",
	"js_rendered_spa",
	"encrypted_pdf",
	"image_only_pdf",
	"unsupported_async_api",
	"binary_unknown",
	"too_large",
	"invalid_input",
] as const;

export type RejectionReason = (typeof rejectionReasons)[number];

export type PreflightResult =
	| {
			supported: true;
			format: DetectedFormat;
			/** True when downstream pipeline needs an AI call (vs deterministic convert). */
			requiresAi: boolean;
			/** URL the worker should ingest from (normalized; for direct OpenAPI we still go through here). */
			canonicalUrl: string;
			/** Human-readable summary shown to the user before they commit. */
			summary: string;
			/** Non-blocking warnings (e.g. "doc is very large; this may take 1-2 minutes"). */
			warnings: string[];
	  }
	| {
			supported: false;
			reason: RejectionReason;
			message: string;
	  };

export interface PreflightUrlInput {
	kind: "url";
	url: string;
}

export type PreflightInput = PreflightUrlInput; // File-upload input lands in Phase 3
