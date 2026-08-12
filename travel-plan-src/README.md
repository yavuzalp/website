# travel-plan-src

Source files for the `/travel-plan` page (unlisted — see below).

- `roadtrip.html` — the trip plan content, as a self-contained HTML
  document with its own dark "night sky" design. This is the file to
  replace when the trip plan changes.
- `template.html` — the site "shell" (nav, `<head>` boilerplate, the
  `noindex`/`nofollow` meta tag). Not regenerated from anything — edit it
  directly if the shell itself needs to change.

## Updating the trip plan

1. Replace `roadtrip.html` with the new version (same filename), or pass a
   different path to the build script.
2. From the repo root:
   ```bash
   node scripts/build-travel-plan.js
   # or: node scripts/build-travel-plan.js path/to/some-other-source.html
   ```
   This regenerates `dist/travel-plan/index.html`. It only writes that one
   file — it does not commit or deploy anything.
3. Preview it before shipping — root-relative asset paths (`/css/...`,
   `/js/...`) don't resolve under `file://`, so serve `dist/` over real
   HTTP first (e.g. the `static-site` launch config, or `npx serve dist`).
4. Commit and deploy the same way as any other change to `dist/` — see
   CLAUDE.md at the repo root for the exact `gh-pages` copy/commit/push
   sequence.

## What the build script does, briefly

`roadtrip.html` is written as a fully standalone page (its own `:root`
theme variables, its own `body`/`h1`-`h6`/`p`/`li` styling, generic class
names like `.row`/`.box`). Dropped in unmodified, that would collide with
the site's Bootstrap `.row` and get its text color silently overridden by
`futuristic.css`'s global `!important` rules on heading/paragraph tags.
The build script scopes every selector from the source's `<style>` block
under `.travel-plan-page` and adds defensive `!important` to color/
background/font-family so it reliably wins regardless of those global
rules — see the comments in `scripts/build-travel-plan.js` for the full
reasoning, including a fallback rule for any heading/paragraph/list item
that doesn't declare its own color (very possible in a hand-authored
source file) so it can't get silently miscolored the next time the source
changes.

## Keep this page unlisted

`/travel-plan` is intentionally **not** linked from any nav, has no
listing anywhere on the site, and is not searchable/crawlable
(`noindex, nofollow` in `template.html`, which the build script never
touches). There is no `sitemap.xml` on this site to worry about either.
When editing `template.html`, don't add a nav link to this page from any
other page's nav, and don't remove the `noindex` meta tag — the page
should stay reachable only by whoever has the direct URL.
