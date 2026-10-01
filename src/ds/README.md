# jpdazab

The personal brand system of Juan, product designer. One violet, a white pill, and a wide geometric monogram. Everything here is built from the logo: the **JD** monogram on a white pill, followed by the handle **/jpdazab**.

> What came from your files: the violet `#5438DC` (`logo-violet`, `violet-500`), white, the pill shape (`radius-full`), the marks themselves, the Switzer typeface, and — from the social post `example1` — the ink `#1A1926`, the canvas `#F5F5F5`, the 60% ink, the orange accent `#F29950`, the post type sizes and the NumberedCard. Everything else — the violet and neutral ramps, the dark theme, the type scale, spacing, radii and shadows — is **derived** from those and marked as such. Swap in real values as they are decided.

> From **juandaza.design** (the Framer portfolio) came the website layer: the action violet `#473BF0` (`violet-web`, `brand-fill`), lavender `#CAC6FA`, the real greys that now drive the dark theme and light tiles, yellow and blue accents, the Website type styles, Geist Mono, `radius-2xl`, the inset/glass shadows, the icon set and eleven components. Where the site had a value for a role that was already here, the site's value replaced the derived one (dark `surface`, `surface-raised`, `ink-muted`, `border`; light `surface-subtle`; `display`; `body-lg`) rather than adding a second token. Near-identical site values map to existing tokens: text `#171717` → `ink`, 14px footer text → `body-sm`, 39px pill radius → `radius-full`.

## How to use this system (read first)

1. **Respect what exists.** Before designing anything, look for a component, template or token that already does it, and use it as is: same colours, type styles, sizes, radii and spacing. Don't restyle or "improve" a defined template; change only its content.
2. **No template for the case? Adapt to the UI that's here.** Build the new piece from the closest existing template and the tokens of the same family (carousel pieces from the `carousel-*` tokens, website pieces from the website tokens), reusing its frame, grid, type styles and component anatomy. Never introduce new colours, fonts, radii or shadows; if something genuinely new is needed, derive it from an existing token and say so.
3. **Fonts stay as they are:** Switzer, Projekt Blackbird and Geist Mono only.

## Content fundamentals

- **Voice:** direct, calm, specific. Say what the decision was and what it changed. Numbers over adjectives.
- **Handle style:** the handle is written lowercase with a leading slash — `/jpdazab` — like a path. Keep that form wherever the handle appears as a brand element; in running text, "Juan".
- **Case:** sentence case for headings and buttons ("Save changes", not "Save Changes").
- **Do:** short sentences, one idea per paragraph, outcomes first.
- **Don't:** exclamation marks, emoji in UI, superlatives ("world-class", "revolutionary").
- **Social posts** (example1 is in Spanish) may end the headline with a single pointing emoji (👇🏻) toward the list below it.

## Visual foundations

### Colour

A neutral-first system with one hue family. Violet is the only colour that carries brand; neutrals are faintly violet-tinted greys so the page never feels cold next to it.

- `surface` / `surface-subtle` / `surface-raised` for grounds, `canvas` (#F5F5F5) for posts and slides; `ink` (#1A1926 in light) and `ink-muted` for text, `ink-soft` (ink at 60%) for lead lines and card descriptions in posts.
- `brand` for primary actions, links and active states. Text on a brand fill is `on-brand` — white in light, near-black in dark (the dark brand is the lighter `violet-400`).
- `brand-soft` + `brand-soft-ink` for selected rows, soft badges and highlights.
- `border` is for hairlines only; control edges use `border-strong` (≥3:1).
- `logo-violet` is fixed in every theme — the logo never re-themes.
- **Two violets, on purpose.** `logo-violet` / `brand` (#5438DC) is the logo ink and the text/link colour. `brand-fill` (#473BF0, from the website) is for large violet fills: the hero card, pill buttons, case-study cards; text on it is `on-brand-fill`, secondary words `on-brand-fill-muted` (lavender, 24px+ only). They are 6% apart — if one should win everywhere, repoint `brand-fill` to `{violet-500}` (or the reverse) in one place.
- **Inverse cards** on a light page (testimonial, "Know how", the dark pill button) use `surface-inverse` + `on-inverse` / `on-inverse-muted`.
- **Dark sections** are simply the dark theme: wrap them in `data-theme="dark"` — `surface` #0A0A0A, `surface-raised` #1F1F1F, `ink-muted` #A3A3A3 and `border` (grey-200 at 50%) are the website's exact values.
- `highlight` yellow + `highlight-ink` for the one CV-style card; `accent-cool` blue for mono overlines on dark cards; `ink-faint` for the faded second line of light tiles; `glass` for the nav bar.
- `accent` (orange `#F29950`) marks the one emphasised phrase in a display headline, set in Medium italic. It is only 2.0:1 on `canvas`: decorative emphasis at 64px, never body text or meaning.
- Status colours (success, warning, danger) are **not defined yet**: the logo doesn't provide them.

Failing pairs kept from the source, decorative only: `ink-faint` on `surface-subtle` (2.2:1), `highlight-ink` on `highlight` (2.75:1), `accent` on `canvas` (2.0:1). The first line of each card carries the meaning.

Contrast (checked): `ink` ≥15.9:1, `ink-muted` ≥5.4:1 on every surface; `brand` 7.1:1 on white (light) and 6.3:1 on `neutral-950` (dark); `on-brand` ≥6.3:1.

### Type

One sans family, **Switzer** (supplied as font files, every weight from Thin to Black with italics). Headings at Semibold 600 with slight negative tracking; body at Regular 400; labels and captions at Medium 500. Keep to 400–700 in UI; Thin–Light and Extrabold–Black are for large display moments only. Code, handles and overlines use **Geist Mono** (Google Fonts, as on the website), falling back to the system monospace stack.

**Projekt Blackbird** (supplied as a font file, Regular 400 only) is available as the `blackbird` family, falling back to Switzer. Its character set is basic Latin plus a few extras (Ç, Ë): it has **no Spanish accents or ñ** (á é í ó ú ñ ¿ ¡), so don't set Spanish copy in it — those glyphs would fall back to Switzer mid-word. It is the voice of the **carousel card**: its title, tag, chart labels, handle and "Swipe" (the "Carousel card" type styles).

| Style | Size / line | Use |
|---|---|---|
| `display` | 56 / 60 · 600 | Hero, one per page |
| `h1` `h2` `h3` | 40 · 28 · 20 | Page, section, sub-section |
| `body-lg` `body` `body-sm` | 18 · 16 · 14 | Lead, default, dense |
| `label` · `caption` | 14 · 12 (500) | Controls · metadata |

**Website** styles (Switzer; the site sets headings Regular with tight tracking, unlike the Semibold UI headings above):

| Style | Size / line | Use |
|---|---|---|
| `section-title` | 46 / 55.2 · 400 · −0.04em | Section titles |
| `list-title` | 32 / 44.8 · 400 | Article rows |
| `title-lg` · `lead-lg` | 24 / 28.8 · 500 · 400 | Card titles, quotes · hero lead |
| `eyebrow` | 18 / 21.6 · 700 | Kicker above a lead |
| `button` | 16 / 25.6 · 400 · +0.01em | Pill labels, nav links |
| `overline` | Geist Mono 16 / 25.6, uppercase | Label above card text |

`display` is now the website statement (Bold 56/67.2) and `body-lg` the website body (18/28.8).

### Shape, space, depth

- **The pill is the signature shape.** The logo sits on a full pill whose radius is half its height; use `radius-full` for primary buttons, tags (`Tag`) and avatars. Everything else is softly rounded: `radius-sm` (inputs), `radius-md` (cards, secondary buttons), `radius-lg` (panels, image frames), `radius-xl` 24 (review and case-study cards), `radius-2xl` 32 (bento, hero and testimonial cards).
- **Spacing** is a 4px grid: `space-1` 4 → `space-16` 64. Cards pad `space-4`–`space-6`; sections sit `space-12` apart.
- **Website grid:** 32px page gutters, 16–24px between bento cards, 50px between sections (≈ `space-12`); the dark section is a sheet with 24px top corners.
- **Depth** is quiet: `shadow-sm` for resting cards, `shadow-md` for menus and popovers. Prefer a `border` hairline to a shadow on flat layouts. Website cards use inner light instead: `shadow-inset-highlight` on light tiles, `shadow-inset-glow` on dark ones, `shadow-glass` + `blur-glass` on the nav.
- **Focus:** a 2px `focus-ring` with a 2px gap in the surface colour.

### Social post (1080 × 1351)

Measured from `example1` (see the **Examples** asset group):

- **Frame:** 1080 × 1351, `canvas` ground, `space-20` (80px) margin on every side.
- **Headline:** `post-headline` — Regular 64/80 in `ink`, max two lines; the emphasised phrase in `post-headline-accent` (Medium italic, `accent`).
- **Lead:** `post-lead` — Regular 46/70; the first line in `ink-soft`, the key line in `ink`. **8px (`space-2`) below the headline**, so headline and lead read as one block.
- **Points:** a `NumberedCardList` — number cell + white card, `radius-xl` (24px), `space-6` (24px) gaps, `space-10` (40px) padding; title `post-card-title` Semibold 46/58 in `brand`, description `post-card-body` Regular 32/42 in `ink-soft`.
- **Footer:** the `jpdazab-lockup.svg` (JD on its white pill + `/jpdazab`) at **55px high**, 70% of its native 79px, so the mark signs the post without competing with the content. Keep the lockup file whole; never rebuild it from type.
- Lead, list and footer are spread evenly down the remaining height (≈50px between blocks).

### Data post (1080 × 1351)

A one-image recap of numbers, built for `example2-ai-summit-recap` (see **Examples**). Same frame, headline and footer rules as the social post; the body is a bento of stat cards instead of a list.

- **Header:** a `caption`-sized kicker in `ink-soft` (event and dates), then the `post-headline` with its accent phrase, then an `ink-soft` lead whose key clause is in `ink`, 8px below the headline.
- **Grid:** two columns, `space-6` (24px) gaps. Cards are `surface-raised` (white) with `radius-xl` and 32px padding; one `ink` card and one `brand` card per image at most, to set rhythm.
- **Card anatomy:** a Semibold 24px title in `ink` stating the finding, the chart, then a Medium 15px source line in `ink-soft` pinned to the bottom.
- **Data colour:** `brand` for the main series, `accent` for the contrast value (the gap, the minority, the stall point). Tracks behind bars use the 15–20% tints of each. On the `ink` card, violet-300 and `accent`.
- **Numbers:** Semibold 38–44px, tight tracking, coloured like their series.
- **Closing card:** the `brand` card holds the takeaway, Semibold 36px in white with a Regular 22px line at 80% white.

### Carousel card (1231 × 1731)

The social carousel template, measured 1:1 from `template-post` (see **Examples**) and built as the `CarouselCard` component.

- **Frame:** white page; a `canvas` card 40px in from the top and sides (1151 × 1507, radius 50px, 40px padding); the footer sits on white below it.
- **Head:** a `Tag` (lg, yellow `highlight`) top-left; optional meta top-right in `carousel-meta` (Switzer 36/40), right-aligned, max two lines.
- **Title:** `carousel-title` — Projekt Blackbird 128/138, centred, **two lines in two colours**: `ink`, then `brand-fill`.
- **Summary:** `carousel-summary` — Switzer 51/67 in `carousel-summary` grey, centred, 8px under the title, **max three lines**, same size on every slide.
- **Visual:** one chart or image, centred in the rest of the card. The source's Venn is `CarouselVenn` (white sets, `brand-fill` overlap, Blackbird 56 labels).
- **Footer:** `jd-monogram-bare` + `@jpdazab` (`carousel-handle`) left; "Swipe" + `arrow-right` in `brand-fill` right. Drop "Swipe" on the last slide.
- **Language:** the Blackbird parts are English only (no accents in the font); the Switzer summary and meta can be Spanish.

### Carousel covers & slides (1231 × 1731)

The current carousel system, measured 1:1 from **Cover_Main, Cover_black, Cover_black-1, Cover_yellow** and **Template-1 … Template-7** (PDFs in the **Carousel templates** asset group). Every PDF is a ready card (the *Carousel templates* previews) that works alone or inside a `Carousel`. For new carousels use these; `CarouselCard` above stays for the older centred style.

- **Colours:** `carousel-card` #E6E6E6 grey card, `carousel-ink` #050516 (text, dark tag, dark tiles, dark cover), `carousel-accent` electric blue #0004EB (title line 2, cover titles, JD mark, Swipe, blue cover and tiles), `carousel-highlight` pale yellow #FFFFB3 (tag and titles on dark/blue covers, yellow cover, soft tiles, Venn overlap), `carousel-summary` grey for slide summaries, `carousel-handle` for the footer handle, `carousel-data-ink` #171717 for chart labels, `carousel-placeholder` #D9D9D9. Template-6 bars keep `brand-fill` #473BF0 as in the source.
- **Fonts (unchanged):** the PDFs' display face maps to **Projekt Blackbird** (titles, tag, numbers, chart labels, handle, Swipe) and their text face to **Switzer** (summary, meta, bar labels). Blackbird has no accents: those parts in English.
- **Cover** (`CoverCard`, tones `grey` · `ink` · `blue` · `yellow`): card 40px in on every side, `radius-slide` 50, 80px padding; tag + meta on top; title `cover-title` 109/106, left, max 3 lines, one `<u>`nderlined word; summary `cover-summary` 50/67, max 3 lines; footer inside the card.
- **Inner slide** (`SlideCard`): card 1151 × 1507 with 80px padding; title `slide-title` 80/80 in two colours (ink, then accent); summary `slide-summary` 40/49, max 3 lines; one 991px visual; footer on white below the card.
- **Visuals:** `StatGrid` (Template-1/2: 221px tiles, 24px gaps, `radius-tile` 16, tones white/ink/blue/yellow), `ComparisonBars` (Template-3), `CarouselVenn tone="highlight" diameter={660}` (Template-4), `CarouselImage` (Template-5), `ProgressBars` brand/highlight (Template-6/7).
- **Footer:** `JDMark` (the monogram traced from these PDFs, in `currentColor`) + `@jpdazab`, "Swipe →" right; drop Swipe on the last slide. Here the mark takes the footer colour (blue, or white on dark), because the source does; everywhere else the logo files stay violet.
- **Folded source values:** the PDFs' pure black (#000) titles and numbers → `carousel-ink`; summary #47464F → `carousel-summary`; handle #918F9A → `carousel-handle`.
- **No template fits?** Keep the `SlideCard` frame and compose the visual from these tokens: white tiles or tracks with `radius-tile` on `carousel-card`, `carousel-accent` for the main value, `carousel-highlight` or `carousel-ink` for contrast, Blackbird numbers, Switzer sentences, 24px gaps, 991px width.

## Logo

See the **Logos** asset group. The lockup is the JD monogram on a white pill, then `/jpdazab`. The monogram alone works as an avatar or favicon. The marks are single-ink violet `#5438DC` (`logo-violet`); don't recolour, outline, stretch or add effects.

- Clear space: at least the height of the J stem's cap (≈ half the pill height) on every side.
- On dark grounds, keep the white pill behind JD. The violet wordmark alone is only 2.7:1 on `neutral-950`, so don't set it on dark backgrounds — no reversed (white) version has been supplied yet.

## Iconography

The website's outline set, in the **Icons** asset group and as the `Icon` component: `arrow-up-right`, `arrow-right`, `mail`, `globe`, `music`, `map`. 24px grid, 1.5px stroke, round caps and joins (echoing the pill), no fills. 20px in buttons and cards, 14px beside a link. `arrow-right` stays on the site, `arrow-up-right` leaves it. Draw in `ink`, `ink-muted`, `on-brand-fill` or `on-inverse`; add new icons in the same style.

## Components

- **Website:** `Button`, `NavBar`, `HeroCard`, `BentoCard`, `TestimonialCard`, `ReviewCard`, `SectionHeader`, `LinkList`, `CaseStudyCard`, `Statement`, `Icon`.
- **Social post:** `NumberedCard` / `NumberedCardList`; carousel: `CarouselCard`, `CarouselVenn`, `Tag`.
- **Carousel covers & slides:** `CoverCard`, `SlideCard`, `StatGrid` / `StatCard`, `ComparisonBars`, `ProgressBars`, `CarouselImage`, `CarouselVenn`, `JDMark`, and `Carousel` to show them as a swipeable set. One ready card per source PDF under *Carousel templates*.
- **Labels:** `Tag` (pill; lg for carousels, md for UI; tones highlight, ink, soft).
- A page: `NavBar` → a bento grid (`HeroCard`, `BentoCard`s, a photo, `TestimonialCard`) on `surface` → a `data-theme="dark"` sheet with `Statement`, `ReviewCard`s, `SectionHeader` + `LinkList`, `SectionHeader` + `CaseStudyCard`s → a white footer with a `title-lg` headline and primary Buttons.
