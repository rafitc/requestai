import type {NextConfig} from "next";

const nextConfig: NextConfig = {
	// Enable transpilation of workspace packages
	transpilePackages: ["@requestai/api-types"],
};

export default nextConfig;
