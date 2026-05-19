"use client";

import {useEffect} from "react";
import {useRouter} from "next/navigation";

import {authClient} from "@/lib/authClient";

/**
 * Landing acts as an auth-aware redirector. Logged-in users go straight
 * to the dashboard; everyone else goes to login. We keep this client-side
 * because the bearer token lives in localStorage.
 */
export default function HomePage() {
	const router = useRouter();

	useEffect(() => {
		let cancelled = false;
		authClient.getSession().then((res) => {
			if (cancelled) return;
			router.replace(res.data?.user ? "/dashboard" : "/login");
		});
		return () => {
			cancelled = true;
		};
	}, [router]);

	return (
		<div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
			Loading…
		</div>
	);
}
