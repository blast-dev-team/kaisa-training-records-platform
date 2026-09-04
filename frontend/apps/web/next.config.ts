import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@repo/assets", "@repo/ui"],
  images: {
    remotePatterns: [
      // 백엔드가 서빙하는 S3 public 이미지
      { protocol: "https", hostname: "**.amazonaws.com" },
    ],
  },
  async rewrites() {
    // 개발 중 /api 를 백엔드(FastAPI)로 프록시
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:8000/api/:path*",
      },
    ];
  },
  webpack: (config) => {
    const fileLoaderRule = config.module.rules.find((rule: any) =>
      rule.test?.test?.(".svg"),
    );
    if (fileLoaderRule) {
      fileLoaderRule.exclude = /\.svg$/i;
    }
    config.module.rules.push({
      test: /\.svg$/i,
      issuer: /\.[jt]sx?$/,
      use: [{ loader: "@svgr/webpack", options: { icon: true, svgo: true } }],
    });
    return config;
  },
};

export default nextConfig;
