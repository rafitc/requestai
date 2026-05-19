// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — openapi-to-postmanv2 ships without types
import postmanConverter from "openapi-to-postmanv2";

export type ExportFormat = "postman" | "bruno" | "hoppscotch" | "thunder";

export interface ExportedArtifact {
	filename: string;
	mimeType: string;
	body: Buffer;
}

/**
 * Convert a stored OpenAPI document into the platform-specific download.
 *
 * v1 strategy:
 *   - Postman gets a real Postman Collection v2.1 via openapi-to-postmanv2.
 *   - Bruno / Hoppscotch / Thunder Client all accept OpenAPI directly via
 *     their "Import OpenAPI" UI; for those we hand back the OpenAPI JSON
 *     itself so the user just imports it. Real per-platform native files
 *     (.bru bundles, Thunder collection json, etc.) come later.
 */
class ExporterService {
	async export(
		format: ExportFormat,
		openapiDoc: Record<string, unknown>,
		collectionName: string
	): Promise<ExportedArtifact> {
		const safeName = collectionName.replace(/[^a-zA-Z0-9-_]+/g, "_") || "collection";

		switch (format) {
			case "postman": {
				const postman = await this.openApiToPostman(openapiDoc);
				return {
					filename: `${safeName}.postman_collection.json`,
					mimeType: "application/json",
					body: Buffer.from(JSON.stringify(postman, null, 2), "utf-8"),
				};
			}
			case "bruno":
			case "hoppscotch":
			case "thunder": {
				const body = Buffer.from(JSON.stringify(openapiDoc, null, 2), "utf-8");
				return {
					filename: `${safeName}.openapi.json`,
					mimeType: "application/json",
					body,
				};
			}
			default: {
				const _exhaustive: never = format;
				throw new Error(`Unsupported export format: ${String(_exhaustive)}`);
			}
		}
	}

	private openApiToPostman(openapiDoc: Record<string, unknown>): Promise<unknown> {
		return new Promise((resolve, reject) => {
			postmanConverter.convert(
				{type: "json", data: openapiDoc},
				{},
				(err: Error | null, result: {result: boolean; reason?: string; output?: {data: unknown}[]}) => {
					if (err) {
						reject(err);
						return;
					}
					if (!result.result) {
						reject(new Error(result.reason || "Postman conversion failed"));
						return;
					}
					const first = result.output?.[0]?.data;
					if (!first) {
						reject(new Error("Postman converter returned no output"));
						return;
					}
					resolve(first);
				}
			);
		});
	}
}

const exporterService = new ExporterService();
export default exporterService;
