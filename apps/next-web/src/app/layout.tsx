import {Geist, Geist_Mono} from "next/font/google";

import type {Metadata, Viewport} from "next";
import "./globals.css";

import {ReduxProvider} from "@/store/Provider";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

export const viewport: Viewport = {
	width: "device-width",
	initialScale: 1,
};

export const metadata: Metadata = {
	title: "RequestAi",
	description: "A Full-Stack TypeScript Template for Scalable Applications",
	appleWebApp: {
		title: "RequestAi",
	},
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" className="dark">
			<body
				className={`${geistSans.variable} ${geistMono.variable} antialiased`}
			>
				<ReduxProvider>{children}</ReduxProvider>
			</body>
		</html>
	);
}
