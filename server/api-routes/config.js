export default function handler(_req, res) {
  res.setHeader("cache-control", "s-maxage=300, stale-while-revalidate=3600");
  res.status(200).json({
    posthogKey: process.env.NEXT_PUBLIC_POSTHOG_KEY || "",
    posthogHost: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com",
    hotjarId: process.env.NEXT_PUBLIC_HOTJAR_ID || "",
    hotjarVersion: process.env.NEXT_PUBLIC_HOTJAR_VERSION || "6"
  });
}
