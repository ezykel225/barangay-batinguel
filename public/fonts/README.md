# Poppins — self-hosted

The app has declared `font-family: 'Poppins', sans-serif` in 43 places
since it was written, but never loaded the font, so every screen was
actually rendering in the browser's default sans-serif. These files fix
that.

## Why self-hosted rather than a Google Fonts `<link>`

- **No third-party request.** The barangay's connection is the slow part;
  a `<link>` to `fonts.googleapis.com` adds a DNS lookup, a TLS
  handshake and a redirect to `fonts.gstatic.com` before any text can
  render in the right font.
- **No external dependency during a defence or a brownout.** If Google
  Fonts is unreachable, a self-hosted font still loads.
- **Nothing leaks.** A `<link>` tells Google the IP of every visitor to
  a barangay health page. Self-hosting tells them nothing.

## Where the files actually live

This folder holds only the **licence** and this record. The `.woff2`
files are in **`src/styles/fonts/`**.

They had to move there. css-loader resolves every `url()` in a bundled
stylesheet through webpack, so `url('/fonts/poppins-400.woff2')` fails
the build outright — `Module not found: Can't resolve
'/fonts/poppins-400.woff2'`. Files under `public/` are copied, never
resolved, so a bundled stylesheet cannot point at them.

Keeping them in `src/` is the better outcome anyway: webpack emits each
one with a content hash into `build/static/media/`, so replacing a font
later cannot be defeated by a stale browser cache.

`OFL.txt` stays here, in `public/`, on purpose. The OFL asks that the
licence accompany the font software wherever it is redistributed, and a
deployed website redistributes it. Files in `public/` are served
verbatim, so the licence is reachable at `/fonts/OFL.txt` on the live
site. A copy inside `src/` would never be served at all.

One consequence worth knowing: because webpack hashes the filenames,
`index.html` cannot `<link rel="preload">` a font — there is no stable
path to preload. `font-display: swap` covers it: text paints immediately
in the fallback face and swaps when Poppins arrives.

## Files

| File | Weight | Style |
|---|---|---|
| `src/styles/fonts/poppins-400.woff2` | 400 | normal |
| `src/styles/fonts/poppins-400-italic.woff2` | 400 | italic |
| `src/styles/fonts/poppins-500.woff2` | 500 | normal |
| `src/styles/fonts/poppins-600.woff2` | 600 | normal |
| `src/styles/fonts/poppins-700.woff2` | 700 | normal |

**39.2 kB total.** Only the weights the app actually uses:

- **400** — body text (the CSS default), one explicit declaration
- **500** — 28 declarations
- **600** — 83 declarations (the most used weight in the project)
- **700** — 63 declarations, plus 26 `<strong>` elements
- **400 italic** — 5 places: `.role-restricted-note`, `.medicine-note`,
  `.medicine-admin-note`, `.kapitan-quote`, and one inline style in
  `Reservation.jsx`. All of them inherit normal weight, so one italic
  file covers every italic in the app. Without it the browser would
  slant the upright face itself, which Poppins does badly.

No 100/200/300/800/900 weights are downloaded, because nothing asks for
them.

## Subset

**Latin only** (`U+0000-00FF` plus punctuation, quotes and a few
symbols). This covers Filipino and Spanish-derived names including `ñ`
(U+00F1), which several officials' names need.

`latin-ext` and `devanagari` are deliberately **not** included —
`latin-ext` covers Central and Eastern European letters this app has no
use for, and `devanagari` is for Hindi. Including them would have meant
ten more files for glyphs nobody will type.

Arrows (`←` `→`), check marks (`✓`), the warning sign (`⚠`) and the
emoji used on the health centre page are **not** in Poppins at all and
fall back to the system font per glyph. That is unchanged from before —
they already rendered that way.

## Source and provenance

Downloaded on **2026-09-29** from Google's own font CDN, which is what
the Google Fonts CSS API serves:

```
https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap
```

The `latin` `@font-face` blocks in that response point at
`https://fonts.gstatic.com/s/poppins/...` — those exact `.woff2` files
are the ones stored here, renamed from Google's hashed filenames to
something readable. Each was verified to start with the `wOF2` magic
bytes.

`OFL.txt` is the licence as published in Google's official font
repository:

```
https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/OFL.txt
```

## Licence

Poppins is licensed under the **SIL Open Font License, Version 1.1** —
the full text is in `OFL.txt` in this folder.

Copyright 2020 The Poppins Project Authors
(https://github.com/itfoundry/Poppins)

The OFL permits redistribution, including bundling the font with a web
application, provided the licence travels with it. That is why `OFL.txt`
sits next to the font files and is committed to the repository rather
than referenced by link.

## Updating

Re-request the CSS API URL above with a modern browser `User-Agent`
(the API serves `.ttf` to older ones), take the `latin` blocks, and
replace these files. Do not hand-edit the `.woff2` files, and keep
`OFL.txt` alongside them.
