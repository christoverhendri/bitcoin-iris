import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        // `/forecast/monthly` was removed: it answered the same 30-day question
        // as the distribution page but inherited its window's drift, so the two
        // disagreed. See docs/DECISIONS.md §4. Old bookmarks land on the page
        // that replaced it, at the matching horizon.
        //
        // This lives here rather than as a `redirect()` stub page so the route
        // folder is genuinely gone. Middleware cannot cover it — its matcher
        // only sees single-segment section paths like `/forecast`.
        source: "/forecast/monthly",
        destination: "/forecast/distribution?h=1M",
        permanent: true,
      },
      {
        // The Research section was removed: its only page repeated the
        // Confluence card already on Overview. Old bookmarks land there.
        source: "/research/:path*",
        destination: "/overview",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
