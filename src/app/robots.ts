import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN ?? "http://localhost:3100";

  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/privacy", "/terms", "/imprint", "/contact", "/support"],
      disallow: ["/admin", "/events", "/players", "/settings"],
    },
    sitemap: `${origin}/sitemap.xml`,
  };
}
