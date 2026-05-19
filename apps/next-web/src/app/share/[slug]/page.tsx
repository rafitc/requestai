"use client";

import {useEffect, useState} from "react";
import {useParams} from "next/navigation";
import {DownloadIcon, FrownIcon, SparklesIcon} from "lucide-react";

import {Button} from "@/components/lib/shadcn/ui/button";
import env from "@/config";

interface ShareMeta {
	name: string;
	createdAt: string;
	ready: boolean;
	platforms: string[];
}

const PLATFORM_LABELS: Record<string, string> = {
	postman: "Postman",
	bruno: "Bruno",
	hoppscotch: "Hoppscotch",
	thunder: "Thunder Client",
};

/**
 * Public share viewer. Renders collection metadata + per-platform
 * download buttons. No auth — anyone with the link sees this.
 */
export default function SharePage() {
	const params = useParams<{slug: string}>();
	const [meta, setMeta] = useState<ShareMeta | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		async function load() {
			try {
				const res = await fetch(`${env.API_BASE_URL}/api/share/${params.slug}`);
				if (!res.ok) {
					if (cancelled) return;
					setError(
						res.status === 404
							? "This share link is no longer active."
							: "Couldn't load this collection."
					);
					return;
				}
				const json = (await res.json()) as ShareMeta;
				if (!cancelled) setMeta(json);
			} catch {
				if (!cancelled) setError("Network error.");
			}
		}
		void load();
		return () => {
			cancelled = true;
		};
	}, [params.slug]);

	function downloadHref(format: string) {
		return `${env.API_BASE_URL}/api/share/${params.slug}/download/${format}`;
	}

	return (
		<div className="min-h-screen w-full p-3 md:p-5">
			<div className="card-elevated mx-auto max-w-2xl overflow-hidden">
				<div className="relative overflow-hidden border-b border-border px-6 py-5">
					<div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-transparent to-warning/10" />
					<div className="relative flex items-center gap-3">
						<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
							<SparklesIcon className="h-5 w-5" />
						</div>
						<div>
							<p className="text-xs uppercase tracking-wider text-muted-foreground">
								Shared via RequestAi
							</p>
							<h1 className="text-lg font-semibold tracking-tight">
								{meta?.name ?? (error ? "Unavailable" : "Loading…")}
							</h1>
						</div>
					</div>
				</div>

				<div className="space-y-4 px-6 py-6">
					{error && (
						<div className="flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
							<FrownIcon className="h-4 w-4 shrink-0 text-destructive" />
							<span>{error}</span>
						</div>
					)}

					{meta && !meta.ready && (
						<p className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
							The owner hasn&apos;t finished generating this collection yet.
						</p>
					)}

					{meta && meta.ready && meta.platforms.length > 0 && (
						<>
							<p className="text-sm text-muted-foreground">
								Download for your tool of choice. Postman gets a native v2.1
								collection; others get the OpenAPI JSON for their import flow.
							</p>
							<div className="flex flex-wrap gap-2">
								{meta.platforms.map((p) => (
									<Button key={p} variant="outline" className="gap-1.5" asChild>
										<a href={downloadHref(p)} rel="noreferrer">
											<DownloadIcon className="h-3.5 w-3.5" />
											{PLATFORM_LABELS[p] ?? p}
										</a>
									</Button>
								))}
							</div>
						</>
					)}

					{meta && (
						<p className="text-xs text-muted-foreground">
							Created {new Date(meta.createdAt).toLocaleString()}
						</p>
					)}
				</div>
			</div>
		</div>
	);
}
