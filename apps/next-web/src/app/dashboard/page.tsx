"use client";

import {useCallback, useEffect, useState} from "react";
import Link from "next/link";
import {useRouter, useSearchParams} from "next/navigation";
import {
	ArrowUpRightIcon,
	FilesIcon,
	PlusIcon,
	SparklesIcon,
	Wand2Icon,
	ZapIcon,
} from "lucide-react";

import {AppShell} from "@/components/AppShell";
import {CreateCollectionModal} from "@/components/CreateCollectionModal";
import {JobProgressBanner} from "@/components/JobProgressBanner";
import {Button} from "@/components/lib/shadcn/ui/button";
import {cn} from "@/components/lib/shadcn/lib/utils";
import {ApiError, apiFetch} from "@/lib/api";
import {clearBearerToken} from "@/lib/authClient";

interface CollectionListItem {
	id: string;
	name: string;
	currentVersionId: string | null;
	shareEnabled: boolean;
	createdAt: string;
	updatedAt: string;
}

interface ActiveJob {
	jobId: string;
	collectionId: string;
}

export default function DashboardPage() {
	const router = useRouter();
	const search = useSearchParams();
	const [items, setItems] = useState<CollectionListItem[] | null>(null);
	const [balance, setBalance] = useState<number | null>(null);
	const [activeJob, setActiveJob] = useState<ActiveJob | null>(null);
	const [modalOpen, setModalOpen] = useState(search.get("new") === "1");
	const [error, setError] = useState<string | null>(null);

	const refresh = useCallback(async () => {
		try {
			const [list, bal] = await Promise.all([
				apiFetch<{items: CollectionListItem[]}>("/collections"),
				apiFetch<{balance: number}>("/credits/balance"),
			]);
			setItems(list.items);
			setBalance(bal.balance);
			setError(null);
		} catch (e) {
			if (e instanceof ApiError && e.status === 401) {
				clearBearerToken();
				router.replace("/login");
				return;
			}
			setError(e instanceof Error ? e.message : "Failed to load");
		}
	}, [router]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	function handleCreated({
		collectionId,
		jobId,
	}: {
		collectionId: string;
		jobId: string;
	}) {
		setModalOpen(false);
		setActiveJob({collectionId, jobId});
		void refresh();
	}

	const readyCount = items?.filter((c) => c.currentVersionId).length ?? 0;
	const generatingCount = items ? items.length - readyCount : 0;
	const sharedCount = items?.filter((c) => c.shareEnabled).length ?? 0;

	return (
		<AppShell
			title="Your collections"
			subtitle="Generate API collections from any docs source — Postman, Bruno, Hoppscotch, Thunder Client."
			balance={balance}
			actions={
				<Button onClick={() => setModalOpen(true)} className="gap-1.5">
					<PlusIcon className="h-4 w-4" />
					New collection
				</Button>
			}
		>
			{/* Stat tiles row */}
			<div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
				<StatTile
					tone="primary"
					icon={<SparklesIcon className="h-5 w-5" />}
					label="Credits available"
					value={balance === null ? "…" : String(balance)}
					hint={
						balance !== null && balance <= 1
							? "Almost out — buy more to keep generating."
							: "1 credit = 1 generated collection."
					}
					cta={
						balance !== null && balance <= 1 ? (
							<Link
								href="/credits"
								className="text-xs font-medium text-primary hover:underline"
							>
								Buy credits ↗
							</Link>
						) : null
					}
				/>
				<StatTile
					tone="success"
					icon={<FilesIcon className="h-5 w-5" />}
					label="Collections"
					value={items === null ? "…" : String(items.length)}
					hint={
						items === null
							? ""
							: `${readyCount} ready${generatingCount > 0 ? ` · ${generatingCount} generating` : ""}`
					}
				/>
				<StatTile
					tone="warning"
					icon={<ZapIcon className="h-5 w-5" />}
					label="Shared publicly"
					value={items === null ? "…" : String(sharedCount)}
					hint={
						sharedCount > 0
							? "Toggle a collection's share link from its detail page."
							: "Share a collection to get a public read-only link."
					}
				/>
			</div>

			{activeJob && (
				<div className="mb-6">
					<JobProgressBanner
						jobId={activeJob.jobId}
						collectionId={activeJob.collectionId}
						onSucceeded={() => {
							setActiveJob(null);
							void refresh();
						}}
						onFailed={(err) => {
							setActiveJob(null);
							setError(err);
							void refresh();
						}}
					/>
				</div>
			)}

			{error && (
				<div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
					{error}
				</div>
			)}

			{/* Collections list */}
			<section>
				<div className="mb-3 flex items-center justify-between">
					<h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
						Recent collections
					</h2>
				</div>

				{items === null ? (
					<SkeletonList />
				) : items.length === 0 ? (
					<EmptyState onCreate={() => setModalOpen(true)} />
				) : (
					<ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
						{items.map((item) => (
							<CollectionCard key={item.id} item={item} />
						))}
					</ul>
				)}
			</section>

			<CreateCollectionModal
				open={modalOpen}
				onClose={() => setModalOpen(false)}
				onCreated={handleCreated}
			/>
		</AppShell>
	);
}

function StatTile({
	tone,
	icon,
	label,
	value,
	hint,
	cta,
}: {
	tone: "primary" | "success" | "warning";
	icon: React.ReactNode;
	label: string;
	value: string;
	hint?: string;
	cta?: React.ReactNode;
}) {
	const toneStyles = {
		primary: "from-primary/15 to-primary/0 text-primary",
		success: "from-success/15 to-success/0 text-success",
		warning: "from-warning/15 to-warning/0 text-warning",
	}[tone];

	return (
		<div className="card-elevated relative overflow-hidden p-5">
			<div
				className={cn(
					"absolute inset-x-0 top-0 h-24 bg-gradient-to-b opacity-80",
					toneStyles
				)}
			/>
			<div className="relative flex items-start justify-between">
				<div>
					<p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
						{label}
					</p>
					<p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
					{hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
					{cta && <div className="mt-3">{cta}</div>}
				</div>
				<div
					className={cn(
						"flex h-10 w-10 items-center justify-center rounded-xl bg-card/60 ring-1 ring-inset ring-border",
						tone === "primary" && "text-primary",
						tone === "success" && "text-success",
						tone === "warning" && "text-warning"
					)}
				>
					{icon}
				</div>
			</div>
		</div>
	);
}

function CollectionCard({item}: {item: CollectionListItem}) {
	const ready = !!item.currentVersionId;
	return (
		<li className="card-elevated group relative flex items-center gap-3 p-4 transition-colors hover:bg-accent/30">
			<div
				className={cn(
					"flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
					ready ? "bg-success/15 text-success" : "bg-primary/15 text-primary"
				)}
			>
				<Wand2Icon className="h-4.5 w-4.5" />
			</div>
			<div className="min-w-0 flex-1">
				<Link
					href={`/collections/${item.id}`}
					className="block truncate text-sm font-medium hover:underline"
				>
					{item.name}
				</Link>
				<p className="mt-0.5 truncate text-xs text-muted-foreground">
					Created {new Date(item.createdAt).toLocaleString()}
				</p>
			</div>
			<div className="flex items-center gap-2">
				<span
					className={cn(
						"rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
						ready ? "bg-success/15 text-success" : "bg-primary/15 text-primary"
					)}
				>
					{ready ? "Ready" : "Generating"}
				</span>
				{item.shareEnabled && (
					<span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-warning">
						Shared
					</span>
				)}
				<Link
					href={`/collections/${item.id}`}
					className="text-muted-foreground transition-colors hover:text-foreground"
					aria-label="Open"
				>
					<ArrowUpRightIcon className="h-4 w-4" />
				</Link>
			</div>
		</li>
	);
}

function SkeletonList() {
	return (
		<ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
			{Array.from({length: 4}).map((_, i) => (
				<li
					key={i}
					className="card-elevated h-[72px] animate-pulse bg-card/50"
				/>
			))}
		</ul>
	);
}

function EmptyState({onCreate}: {onCreate: () => void}) {
	return (
		<div className="card-elevated relative overflow-hidden p-10 text-center">
			<div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-primary/15 to-transparent" />
			<div className="relative">
				<div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary">
					<SparklesIcon className="h-7 w-7" />
				</div>
				<h2 className="text-lg font-semibold">
					Generate your first collection
				</h2>
				<p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
					Paste an API doc URL — OpenAPI, Swagger, Postman, HAR, GraphQL,
					Markdown, or HTML docs. We&apos;ll turn it into downloadable files for
					Postman, Bruno, Hoppscotch, and Thunder Client.
				</p>
				<Button className="mt-6 gap-1.5" onClick={onCreate}>
					<PlusIcon className="h-4 w-4" />
					New collection
				</Button>
				<p className="mt-3 text-xs text-muted-foreground">
					New accounts get 3 free credits.
				</p>
			</div>
		</div>
	);
}
