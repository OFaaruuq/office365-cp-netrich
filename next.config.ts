import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /** Required for container / slim production images */
  output: "standalone",
};

export default nextConfig;
