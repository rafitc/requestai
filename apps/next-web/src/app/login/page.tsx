"use client";

import {useEffect, useState} from "react";
import {useRouter} from "next/navigation";
import {SparklesIcon} from "lucide-react";

import {Button} from "@/components/lib/shadcn/ui/button";
import {Input} from "@/components/lib/shadcn/ui/input";
import {Label} from "@/components/lib/shadcn/ui/label";
import {authClient} from "@/lib/authClient";

/**
 * Two-step OTP sign-in (request code → enter code) with a parallel
 * "Continue with Google" button. The right panel is decorative — pure
 * marketing copy to make the login feel less utilitarian.
 */
export default function LoginPage() {
	const router = useRouter();
	const [step, setStep] = useState<"email" | "otp">("email");
	const [email, setEmail] = useState("");
	const [otp, setOtp] = useState("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [info, setInfo] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		authClient.getSession().then((res) => {
			if (!cancelled && res.data?.user) router.replace("/dashboard");
		});
		return () => {
			cancelled = true;
		};
	}, [router]);

	async function handleRequestOtp(event: React.FormEvent) {
		event.preventDefault();
		setBusy(true);
		setError(null);
		setInfo(null);
		try {
			const {error: err} = await authClient.emailOtp.sendVerificationOtp({
				email,
				type: "sign-in",
			});
			if (err) throw new Error(err.message || "Failed to send code");
			setStep("otp");
			setInfo(`Code sent to ${email}. Check Mailpit in dev.`);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to send code");
		} finally {
			setBusy(false);
		}
	}

	async function handleVerifyOtp(event: React.FormEvent) {
		event.preventDefault();
		setBusy(true);
		setError(null);
		try {
			const {error: err} = await authClient.signIn.emailOtp({email, otp});
			if (err) throw new Error(err.message || "Invalid code");
			router.replace("/dashboard");
		} catch (e) {
			setError(e instanceof Error ? e.message : "Invalid code");
		} finally {
			setBusy(false);
		}
	}

	async function handleGoogle() {
		setBusy(true);
		setError(null);
		try {
			await authClient.signIn.social({
				provider: "google",
				callbackURL: `${window.location.origin}/dashboard`,
			});
		} catch (e) {
			setError(e instanceof Error ? e.message : "Google sign-in failed");
			setBusy(false);
		}
	}

	return (
		<div className="min-h-screen w-full p-3 md:p-5">
			<div className="card-elevated grid min-h-[calc(100vh-1.5rem)] grid-cols-1 overflow-hidden md:min-h-[calc(100vh-2.5rem)] md:grid-cols-2">
				{/* Decorative panel */}
				<div className="relative hidden flex-col justify-between bg-sidebar p-10 md:flex">
					<div className="flex items-center gap-2 text-sm font-semibold tracking-tight">
						<div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
							<SparklesIcon className="h-5 w-5" />
						</div>
						RequestAi
					</div>

					<div className="relative">
						<div className="absolute -left-10 -top-10 h-72 w-72 rounded-full bg-primary/25 blur-3xl" />
						<div className="absolute right-0 top-20 h-56 w-56 rounded-full bg-warning/20 blur-3xl" />
						<div className="relative space-y-3">
							<h2 className="text-3xl font-semibold leading-tight tracking-tight">
								Generate API collections in seconds.
							</h2>
							<p className="max-w-sm text-sm text-muted-foreground">
								Paste an API doc URL — OpenAPI, Swagger, Postman, HAR, GraphQL,
								Markdown, or HTML — and download ready-to-import files for
								Postman, Bruno, Hoppscotch, and Thunder Client.
							</p>
						</div>
					</div>

					<div className="flex items-center gap-3 text-xs text-muted-foreground">
						<span className="rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-success">
							3 free credits
						</span>
						<span>on signup. No card required.</span>
					</div>
				</div>

				{/* Login card */}
				<div className="flex items-center justify-center p-6 md:p-12">
					<div className="w-full max-w-sm space-y-6">
						<div>
							<h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
							<p className="mt-1 text-sm text-muted-foreground">
								Use your email or continue with Google.
							</p>
						</div>

						{step === "email" && (
							<form onSubmit={handleRequestOtp} className="space-y-3">
								<div className="space-y-1.5">
									<Label htmlFor="email">Email</Label>
									<Input
										id="email"
										type="email"
										required
										autoComplete="email"
										value={email}
										onChange={(e) => setEmail(e.target.value)}
										placeholder="you@example.com"
									/>
								</div>
								<Button
									type="submit"
									disabled={busy || !email}
									className="w-full"
								>
									{busy ? "Sending…" : "Send sign-in code"}
								</Button>
							</form>
						)}

						{step === "otp" && (
							<form onSubmit={handleVerifyOtp} className="space-y-3">
								<div className="space-y-1.5">
									<Label htmlFor="otp">6-digit code</Label>
									<Input
										id="otp"
										type="text"
										inputMode="numeric"
										pattern="\d{6}"
										maxLength={6}
										required
										autoFocus
										value={otp}
										onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
										placeholder="000000"
										className="tracking-[0.4em] text-center text-lg"
									/>
								</div>
								<Button
									type="submit"
									disabled={busy || otp.length !== 6}
									className="w-full"
								>
									{busy ? "Verifying…" : "Sign in"}
								</Button>
								<button
									type="button"
									className="w-full text-xs text-muted-foreground hover:text-foreground"
									onClick={() => {
										setStep("email");
										setOtp("");
										setInfo(null);
									}}
								>
									Use a different email
								</button>
							</form>
						)}

						<div className="relative">
							<div className="absolute inset-0 flex items-center">
								<span className="w-full border-t border-border" />
							</div>
							<div className="relative flex justify-center text-[10px] uppercase tracking-wider">
								<span className="bg-card px-2 text-muted-foreground">or</span>
							</div>
						</div>

						<Button
							variant="outline"
							className="w-full"
							onClick={handleGoogle}
							disabled={busy}
						>
							<GoogleMark className="h-4 w-4" />
							Continue with Google
						</Button>

						{info && <p className="text-xs text-muted-foreground">{info}</p>}
						{error && <p className="text-xs text-destructive">{error}</p>}
					</div>
				</div>
			</div>
		</div>
	);
}

function GoogleMark({className}: {className?: string}) {
	return (
		<svg viewBox="0 0 18 18" className={className} aria-hidden="true">
			<path
				d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.49h4.84a4.14 4.14 0 0 1-1.79 2.71v2.26h2.9c1.7-1.57 2.69-3.88 2.69-6.62Z"
				fill="#4285F4"
			/>
			<path
				d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.9-2.26c-.81.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.71H.97v2.33A9 9 0 0 0 9 18Z"
				fill="#34A853"
			/>
			<path
				d="M3.95 10.71A5.41 5.41 0 0 1 3.66 9c0-.59.1-1.17.29-1.71V4.96H.97A9 9 0 0 0 0 9c0 1.45.35 2.82.97 4.04l2.98-2.33Z"
				fill="#FBBC05"
			/>
			<path
				d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .97 4.96l2.98 2.33C4.66 5.17 6.65 3.58 9 3.58Z"
				fill="#EA4335"
			/>
		</svg>
	);
}
