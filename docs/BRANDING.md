# Padel Turni Branding

The product display name is **Padel Turni**, the short name is **Turni**, and the tagline is **Fair draws. Better games.** `Turni` is brand language inspired by the German word `Turnier`; it is not presented as a German dictionary word. The court mark, favicon, install icon, and social preview use the existing deep green and warm lime palette.

## Repository Brand Surface

| Public surface                         | Source                                      | Embedded name                                      | Rename status    |
| -------------------------------------- | ------------------------------------------- | -------------------------------------------------- | ---------------- |
| Shared wordmark and paddle mark        | `src/components/brand-logo.tsx`             | `Padel Turni` in the wordmark; no text in the mark | Updated          |
| Browser favicon                        | `src/app/icon.svg`                          | None                                               | Reused unchanged |
| Apple touch icon                       | `src/app/apple-icon.tsx`                    | None                                               | Reused unchanged |
| Open Graph and social preview          | `src/app/opengraph-image.tsx`               | `Padel Turni`                                      | Updated          |
| Install name and icon reference        | `src/app/manifest.ts`                       | `Padel Turni` / `Turni`                            | Updated          |
| Page, Open Graph, and Twitter metadata | `src/app/layout.tsx` and `src/app/page.tsx` | `Padel Turni`                                      | Updated          |

The repository has no separate tracked raster photos, screenshots, logo exports,
or alternate social cards. The favicon is the only standalone image file; the
Apple icon and social card are generated from code, and the visible logo is a
shared SVG component.

## External Settings

These settings are not controlled by repository code. The owner should change them only after the new hostname is active and the previous hostname is ready to redirect without dropping paths or query strings:

1. Add and verify `padelturni.asadullahkhalid.com`, then keep `padeltourni.asadullahkhalid.com` as a permanent path- and query-preserving redirect.
2. Rename the GitHub repository to `asadkhalid305/padel-turni`, update the local remote, and verify Actions, Vercel integration, rulesets, webhooks, and badges.
3. Rename the Vercel project to `padel-turni`, make the new custom hostname canonical, retain or redirect `padel-tourni.vercel.app`, and update `NEXT_PUBLIC_APP_ORIGIN`.
4. Rename only the Supabase hosted project display name to `Padel Turni`. Keep project ref `zxgxrubnwpmoaarkrhxy`, API URL, keys, database identifiers, migration history, and callback URL unchanged. Add the new hostname to Auth URLs while retaining the old one during the transition.
5. Update Google OAuth branding, homepage, legal URLs, and display names. Keep the existing project ID, OAuth client ID and secret, and Supabase callback URI unchanged; allow for renewed brand verification.
6. Update visible Resend sender/template branding, Linear project naming, Search Console, public profiles, and cached social previews without rotating stable keys or identifiers.
