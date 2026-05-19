"use client";

import {useState} from "react";
import {
	CheckCircle2Icon,
	GlobeIcon,
	SparklesIcon,
	XCircleIcon,
	XIcon,
} from "lucide-react";

import {Button} from "@/components/lib/shadcn/ui/button";
import {Input} from "@/components/lib/shadcn/ui/input";
import {Label} from "@/components/lib/shadcn/ui/label";
import {Textarea} from "@/components/lib/shadcn/ui/textarea";
import {cn} from "@/components/lib/shadcn/lib/utils";
import {ApiError, apiFetch} from "@/lib/api";

interface CreateCollectionModalProps {
	open: boolean;
	onClose: () => void;
	onCreated: (args: {collectionId: string; jobId: string}) => void;
}

type Platform = "postman" | "bruno" | "hoppscotch" | "thunder";

const ALL_PLATFORMS: {key: Platform; label: string; tint: string}[] = [
	{key: "postman", label: "Postman", tint: "text-[#FF6C37]"},
	{key: "bruno", label: "Bruno", tint: "text-[#F4A261]"},
	{key: "hoppscotch", label: "Hoppscotch", tint: "text-[#50FA7B]"},
	{key: "thunder", label: "Thunder", tint: "text-[#9D7BFF]"},
];

type PreflightResult =
	| {
			supported: true;
			format: string;
			requiresAi: boolean;
			summary: string;
			warnings: string[];
	  }
	| {supported: false; reason: string; message: string};

export function CreateCollectionModal({
	open,
	onClose,
	onCreated,
}: CreateCollectionModalProps) {
	const [name, setName] = useState("");
	const [platforms, setPlatforms] = useState<Set<Platform>>(
		new Set(["postman"])
	);
	const [url, setUrl] = useState("");
	const [extraPrompt, setExtraPrompt] = useState("");
	const [preflight, setPreflight] = useState<PreflightResult | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	if (!open) return null;

	function togglePlatform(p: Platform) {
		const next = new Set(platforms);
		if (next.has(p)) next.delete(p);
		else next.add(p);
		setPlatforms(next);
	}

	function reset() {
		setName("");
		setPlatforms(new Set(["postman"]));
		setUrl("");
		setExtraPrompt("");
		setPreflight(null);
		setError(null);
	}

	async function handlePreflight() {
		setBusy(true);
		setError(null);
		setPreflight(null);
		try {
			const result = await apiFetch<PreflightResult>("/collections/preflight", {
				method: "POST",
				body: JSON.stringify({source: {kind: "url", url}}),
			});
			setPreflight(result);
		} catch (e) {
			if (e instanceof ApiError) setError(e.message);
			else setError(e instanceof Error ? e.message : "Preflight failed");
		} finally {
			setBusy(false);
		}
	}

	async function handleSubmit() {
		if (!preflight?.supported) return;
		setBusy(true);
		setError(null);
		try {
			const result = await apiFetch<{collectionId: string; jobId: string}>(
				"/collections",
				{
					method: "POST",
					body: JSON.stringify({
						name: name || "Untitled collection",
						platforms: Array.from(platforms),
						source: {kind: "url", url},
						extraPrompt: extraPrompt || undefined,
					}),
				}
			);
			reset();
			onCreated(result);
		} catch (e) {
			if (e instanceof ApiError) setError(e.message);
			else setError(e instanceof Error ? e.message : "Create failed");
		} finally {
			setBusy(false);
		}
	}

	const canPreflight = !!url && !busy;
	const canSubmit =
		preflight?.supported === true && platforms.size > 0 && !busy;

	return (
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
			onClick={onClose}
		>
			<div
				className="card-elevated relative w-full max-w-2xl overflow-hidden"
				onClick={(e) => e.stopPropagation()}
			>
				{/* Gradient header */}
				<div className="relative overflow-hidden border-b border-border px-6 py-5">
					<div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-transparent to-warning/10" />
					<div className="relative flex items-start justify-between">
						<div className="flex items-start gap-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
								<SparklesIcon className="h-5 w-5" />
							</div>
							<div>
								<h2 className="text-lg font-semibold tracking-tight">
									New collection
								</h2>
								<p className="mt-0.5 text-xs text-muted-foreground">
									Point us at an API doc; we&apos;ll turn it into downloadable
									files.
								</p>
							</div>
						</div>
						<button
							type="button"
							onClick={onClose}
							className="rounded-lg p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
							aria-label="Close"
						>
							<XIcon className="h-4 w-4" />
						</button>
					</div>
				</div>

				<div className="space-y-5 px-6 py-5">
					<div className="space-y-1.5">
						<Label htmlFor="name">Name</Label>
						<Input
							id="name"
							placeholder="My API"
							value={name}
							onChange={(e) => setName(e.target.value)}
						/>
					</div>

					<div className="space-y-2">
						<Label>Target platforms</Label>
						<div className="flex flex-wrap gap-2">
							{ALL_PLATFORMS.map((p) => {
								const active = platforms.has(p.key);
								return (
									<button
										type="button"
										key={p.key}
										onClick={() => togglePlatform(p.key)}
										className={cn(
											"group flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition-all",
											active
												? "border-primary/60 bg-primary/15 text-foreground shadow-[0_0_0_3px_oklch(0.72_0.18_235_/_12%)]"
												: "border-border bg-card hover:bg-accent/40"
										)}
									>
										<span
											className={cn(
												"h-2 w-2 rounded-full transition-colors",
												active ? "bg-primary" : "bg-muted-foreground/40"
											)}
										/>
										<span className={cn("font-medium", active && p.tint)}>
											{p.label}
										</span>
									</button>
								);
							})}
						</div>
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="url">API doc URL</Label>
						<div className="relative">
							<GlobeIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								id="url"
								type="url"
								className="pl-9"
								placeholder="https://petstore3.swagger.io/api/v3/openapi.json"
								value={url}
								onChange={(e) => {
									setUrl(e.target.value);
									setPreflight(null);
								}}
							/>
						</div>
						<p className="text-xs text-muted-foreground">
							OpenAPI · Swagger · Postman · HAR · GraphQL SDL · Markdown · HTML
							docs. File upload coming soon.
						</p>
					</div>

					<div className="space-y-1.5">
						<Label htmlFor="prompt">Extra instructions (optional)</Label>
						<Textarea
							id="prompt"
							rows={3}
							placeholder="e.g. Skip admin endpoints. Add example auth headers."
							value={extraPrompt}
							onChange={(e) => setExtraPrompt(e.target.value)}
						/>
					</div>

					{preflight && (
						<div
							className={cn(
								"flex items-start gap-3 rounded-xl border px-4 py-3 text-sm",
								preflight.supported
									? "border-success/30 bg-success/10"
									: "border-destructive/40 bg-destructive/10"
							)}
						>
							{preflight.supported ? (
								<CheckCircle2Icon className="mt-0.5 h-4 w-4 shrink-0 text-success" />
							) : (
								<XCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
							)}
							<div className="min-w-0">
								{preflight.supported ? (
									<>
										<p className="font-medium">Ready to generate</p>
										<p className="mt-1 text-muted-foreground">
											{preflight.summary}
										</p>
										{preflight.warnings.length > 0 && (
											<ul className="mt-2 list-disc pl-5 text-xs text-muted-foreground">
												{preflight.warnings.map((w) => (
													<li key={w}>{w}</li>
												))}
											</ul>
										)}
									</>
								) : (
									<>
										<p className="font-medium">We can&apos;t use this source</p>
										<p className="mt-1 text-muted-foreground">
											{preflight.message}
										</p>
									</>
								)}
							</div>
						</div>
					)}

					{error && <p className="text-sm text-destructive">{error}</p>}
				</div>

				<div className="flex justify-end gap-2 border-t border-border bg-card/50 px-6 py-4">
					<Button variant="ghost" onClick={onClose} disabled={busy}>
						Cancel
					</Button>
					{!preflight?.supported ? (
						<Button onClick={handlePreflight} disabled={!canPreflight}>
							{busy ? "Analyzing…" : "Analyze source"}
						</Button>
					) : (
						<Button
							onClick={handleSubmit}
							disabled={!canSubmit}
							className="gap-1.5"
						>
							<SparklesIcon className="h-4 w-4" />
							{busy ? "Creating…" : "Create collection"}
						</Button>
					)}
				</div>
			</div>
		</div>
	);
}
