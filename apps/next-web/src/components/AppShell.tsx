"use client";

import {ReactNode, useEffect, useState} from "react";
import Link from "next/link";
import {usePathname, useRouter} from "next/navigation";
import {
	CoinsIcon,
	HomeIcon,
	LogOutIcon,
	PlusIcon,
	SettingsIcon,
} from "lucide-react";

import {cn} from "@/components/lib/shadcn/lib/utils";
import {Button} from "@/components/lib/shadcn/ui/button";
import {authClient, clearBearerToken} from "@/lib/authClient";

interface AppShellProps {
	children: ReactNode;
	/** Header title shown on the left of the topbar */
	title: ReactNode;
	/** Sub-line under the title (optional) */
	subtitle?: ReactNode;
	/** Right-aligned controls in the topbar (e.g. "New collection" button) */
	actions?: ReactNode;
	/** Credit balance pill content — pass null while loading */
	balance?: number | null;
}

interface NavItem {
	href: string;
	label: string;
	icon: typeof HomeIcon;
}

const NAV_ITEMS: NavItem[] = [
	{href: "/dashboard", label: "Dashboard", icon: HomeIcon},
	{href: "/dashboard?new=1", label: "New collection", icon: PlusIcon},
	{href: "/credits", label: "Credits", icon: CoinsIcon},
	{href: "/settings", label: "Settings", icon: SettingsIcon},
];

/**
 * Authed app shell: thin icon sidebar on the left + topbar with title,
 * actions, and user-meta cluster. The reference design has the dashboard
 * inset into a soft outer frame — we mimic that on wide screens via the
 * rounded `card-elevated` container.
 */
export function AppShell({
	children,
	title,
	subtitle,
	actions,
	balance,
}: AppShellProps) {
	const router = useRouter();
	const pathname = usePathname();
	const [userEmail, setUserEmail] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		authClient.getSession().then((res) => {
			if (cancelled) return;
			if (!res.data?.user) {
				router.replace("/login");
				return;
			}
			setUserEmail(res.data.user.email);
		});
		return () => {
			cancelled = true;
		};
	}, [router]);

	async function handleSignOut() {
		try {
			await authClient.signOut();
		} catch {
			/* ignore */
		}
		clearBearerToken();
		router.replace("/login");
	}

	return (
		<div className="min-h-screen w-full p-3 md:p-5">
			<div className="card-elevated relative flex min-h-[calc(100vh-1.5rem)] overflow-hidden md:min-h-[calc(100vh-2.5rem)]">
				<Sidebar pathname={pathname} />
				<div className="flex min-w-0 flex-1 flex-col">
					<Topbar
						title={title}
						subtitle={subtitle}
						actions={actions}
						balance={balance}
						userEmail={userEmail}
						onSignOut={handleSignOut}
					/>
					<main className="flex-1 overflow-y-auto px-5 py-6 md:px-8 md:py-8">
						{children}
					</main>
				</div>
			</div>
		</div>
	);
}

function Sidebar({pathname}: {pathname: string}) {
	return (
		<aside className="hidden w-16 shrink-0 flex-col items-center gap-1 border-r border-border bg-sidebar py-5 md:flex">
			<Link
				href="/dashboard"
				className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary"
				aria-label="RequestAi"
			>
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
					strokeLinejoin="round"
					className="h-5 w-5"
				>
					<path d="M4 4h16v6H4zM4 14h10v6H4z" />
				</svg>
			</Link>

			{NAV_ITEMS.map((item) => {
				const Icon = item.icon;
				const active =
					item.href === "/dashboard"
						? pathname === "/dashboard"
						: pathname.startsWith(item.href.split("?")[0]);
				return (
					<Link
						key={item.label}
						href={item.href}
						className={cn(
							"flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground",
							active && "bg-sidebar-accent text-foreground"
						)}
						title={item.label}
						aria-label={item.label}
					>
						<Icon className="h-4.5 w-4.5" />
					</Link>
				);
			})}
		</aside>
	);
}

function Topbar({
	title,
	subtitle,
	actions,
	balance,
	userEmail,
	onSignOut,
}: {
	title: ReactNode;
	subtitle?: ReactNode;
	actions?: ReactNode;
	balance: number | null | undefined;
	userEmail: string | null;
	onSignOut: () => void;
}) {
	return (
		<header className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4 md:px-8 md:py-5">
			<div className="min-w-0">
				<h1 className="text-xl font-semibold tracking-tight md:text-2xl">
					{title}
				</h1>
				{subtitle && (
					<p className="mt-0.5 text-xs text-muted-foreground md:text-sm">
						{subtitle}
					</p>
				)}
			</div>

			<div className="flex items-center gap-2 md:gap-3">
				{actions}

				<div className="hidden items-center gap-1.5 rounded-full border border-warning/30 bg-warning/10 px-3 py-1.5 text-xs font-medium text-warning sm:flex">
					<CoinsIcon className="h-3.5 w-3.5" />
					{balance === null || balance === undefined
						? "…"
						: `${balance} credits`}
				</div>

				<UserMenu email={userEmail} onSignOut={onSignOut} />
			</div>
		</header>
	);
}

function UserMenu({
	email,
	onSignOut,
}: {
	email: string | null;
	onSignOut: () => void;
}) {
	const initial = email?.[0]?.toUpperCase() ?? "?";
	return (
		<div className="flex items-center gap-2 rounded-full bg-sidebar-accent/70 py-1 pl-1 pr-3">
			<div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
				{initial}
			</div>
			<div className="hidden flex-col text-xs leading-tight md:flex">
				<span className="font-medium">{email?.split("@")[0] ?? "—"}</span>
				<span className="text-muted-foreground">{email ?? ""}</span>
			</div>
			<Button
				variant="ghost"
				size="icon"
				onClick={onSignOut}
				title="Sign out"
				aria-label="Sign out"
				className="h-7 w-7"
			>
				<LogOutIcon className="h-3.5 w-3.5" />
			</Button>
		</div>
	);
}
