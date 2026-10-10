import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return [
      {
        source: "/skill.md",
        destination: "/agent-docs/buyer-skill",
      },
      {
        source: "/merchant/skill.md",
        destination: "/agent-docs/merchant-skill",
      },
      {
        source: "/storefront/skill.md",
        destination: "/agent-docs/storefront-skill",
      },
    ];
  },
};

export default nextConfig;
