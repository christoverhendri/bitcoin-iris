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
      // Curation 2026-10-18. Temporary (307) on purpose: browsers cache 308s
      // forever, which strands bookmarks if a page is brought back.
      { source: "/market", destination: "/overview", permanent: false },
      { source: "/market/:path*", destination: "/overview", permanent: false },
      { source: "/quant/volatility", destination: "/quant/seasonality", permanent: false },
      { source: "/forecast/calibration", destination: "/forecast/distribution", permanent: false },
      // On-Chain sub-tabs. /chain/derivatives -> long-short also rescues browsers
      // that cached the old permanent /chain/positioning -> /chain/derivatives.
      { source: "/chain/positioning", destination: "/chain/long-short", permanent: false },
      { source: "/chain/derivatives", destination: "/chain/long-short", permanent: false },
      { source: "/chain/flows", destination: "/chain/wallets", permanent: false },
      { source: "/chain/supply", destination: "/chain/wallets", permanent: false },
      { source: "/chain/network", destination: "/chain/etf", permanent: false },
    ];
  },
};

export default nextConfig;
