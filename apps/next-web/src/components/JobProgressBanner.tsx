"use client";

import {useEffect, useRef, useState} from "react";
import {LoaderIcon} from "lucide-react";

import {cn} from "@/components/lib/shadcn/lib/utils";
import {apiFetch} from "@/lib/api";

interface JobProgressBannerProps {
	jobId: string;
	collectionId: string;
	onSucceeded: () => void;
	onFailed: (error: string) => void;
}

type JobStep =
	| "queued"
	| "ingesting"
	| "analyzing"
	| "generating"
	| "exporting"
	| "storing"
	| "completing";

interface JobResponse {
	id: string;
	state: "queued" | "running" | "succeeded" | "failed";
	progressStep: JobStep;
	collectionId: string | null;
	error: string | null;
}

const STEPS: {key: JobStep; label: string}[] = [
	{key: "queued", label: "Queued"},
	{key: "ingesting", label: "Reading"},
	{key: "analyzing", label: "Analyzing"},
	{key: "generating", label: "Generating"},
	{key: "exporting", label: "Exporting"},
	{key: "storing", label: "Saving"},
	{key: "completing", label: "Wrapping up"},
];

export function JobProgressBanner({
	jobId,
	collectionId,
	onSucceeded,
	onFailed,
}: JobProgressBannerProps) {
	const [job, setJob] = useState<JobResponse | null>(null);
	const intervalRef = useRef<number | null>(null);

	useEffect(() => {
		let cancelled = false;

		async function poll() {
			try {
				const next = await apiFetch<JobResponse>(`/jobs/${jobId}`);
				if (cancelled) return;
				setJob(next);
				if (next.state === "succeeded") {
					if (intervalRef.current) window.clearInterval(intervalRef.current);
					onSucceeded();
				} else if (next.state === "failed") {
					if (intervalRef.current) window.clearInterval(intervalRef.current);
					onFailed(next.error || "Job failed");
				}
			} catch (e) {
				if (cancelled) return;
				if (intervalRef.current) window.clearInterval(intervalRef.current);
				onFailed(e instanceof Error ? e.message : "Polling failed");
			}
		}

		void poll();
		intervalRef.current = window.setInterval(poll, 1500);

		return () => {
			cancelled = true;
			if (intervalRef.current) window.clearInterval(intervalRef.current);
		};
	}, [jobId, onSucceeded, onFailed]);

	const currentIdx = job
		? STEPS.findIndex((s) => s.key === job.progressStep)
		: 0;
	const pct = Math.max(0, ((currentIdx + 1) / STEPS.length) * 100);

	return (
		<div className="card-elevated relative overflow-hidden p-5">
			<div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-primary/15 to-transparent" />
			<div className="relative flex items-start justify-between gap-4">
				<div className="flex items-center gap-3">
					<div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
						<LoaderIcon className="h-5 w-5 animate-spin" />
					</div>
					<div>
						<p className="text-sm font-medium">
							Generating collection
							{job && (
								<span className="ml-2 rounded-full bg-card/60 px-2 py-0.5 text-[10px] font-normal uppercase tracking-wider text-muted-foreground ring-1 ring-inset ring-border">
									{STEPS.find((s) => s.key === job.progressStep)?.label ??
										job.progressStep}
								</span>
							)}
						</p>
						<p className="mt-0.5 text-xs text-muted-foreground">
							Collection <code>{collectionId.slice(0, 8)}</code>
						</p>
					</div>
				</div>
			</div>

			{/* Progress track */}
			<div className="relative mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
				<div
					className="h-full rounded-full bg-gradient-to-r from-primary to-warning transition-[width] duration-500"
					style={{width: `${pct}%`}}
				/>
			</div>

			{/* Step pills */}
			<div className="mt-3 hidden flex-wrap gap-1.5 sm:flex">
				{STEPS.map((s, i) => (
					<span
						key={s.key}
						className={cn(
							"rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider transition-colors",
							i < currentIdx
								? "bg-success/15 text-success"
								: i === currentIdx
									? "bg-primary/15 text-primary"
									: "bg-muted text-muted-foreground"
						)}
					>
						{s.label}
					</span>
				))}
			</div>
		</div>
	);
}
