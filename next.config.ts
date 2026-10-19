import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        // The monthly forecast is back (Timothy's weekly worker, docs/DECISIONS.md §16)
        // at a NEW slug: the old `/forecast/monthly -> distribution` redirect was a
        // permanent 308, which browsers cache forever, so reusing the path would
        // strand anyone who saw it. Fresh visitors are sent on (307).
        source: "/forecast/monthly",
        destination: "/forecast/30d",
        permanent: false,
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
      // Distribution and Calibration removed 2026-10-19 (same engine as the 30-day tab, which is stored and validated).
      { source: "/forecast/calibration", destination: "/forecast/30d", permanent: false },
      { source: "/forecast/distribution", destination: "/forecast/30d", permanent: false },
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
