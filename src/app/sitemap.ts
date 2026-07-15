import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = (
    process.env.NEXT_PUBLIC_APP_ORIGIN ?? "http://localhost:3100"
  ).replace(/\/$/, "");
  const pages = ["", "/privacy", "/terms", "/imprint", "/contact", "/support"];

  return pages.map((path) => ({
    url: `${origin}${path}`,
    changeFrequency: path === "" ? "monthly" : "yearly",
    priority: path === "" ? 1 : 0.4,
  }));
}
