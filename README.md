# juliarieger.com

Personal site — software engineer / creative technologist.

Four files, no framework, no build step. Open `index.html` in a browser and it works.

```
index.html      all the content and structure
styles.css      all the design (tokens at the top)
main.js         path tracer, index interactions, nav state
assets/
  favicon.svg   the pink sphere
  og.png        link-preview image (1200×630)
```

---

## 1. Fill in the TODOs first

Search the project for `TODO` — there are only a handful, and they're the difference
between a placeholder and your site.

**In `index.html`:**

| What | Where |
| --- | --- |
| GitHub URL | `https://github.com/TODO-your-username` (3 places) |
| LinkedIn URL | `https://www.linkedin.com/in/TODO-your-handle` (3 places) |
| Email | `TODO@example.com` (3 places) |
| Your domain | `https://TODO-your-domain.com/` in the `<link rel="canonical">`, the Open Graph tags, and the JSON-LD |
| Résumé PDF | drop it at `assets/Julia-Rieger-Resume.pdf` (that exact name, or update the 3 links) |
| CV thesis entry | the `M·03` row — topic, method, result, link |
| Girls Get Together entry | the `M·04` row — year, org, what you built, links |
| Girls Get Together year | the `row-venue` on `M·04` currently reads `TODO · year` |

Find-and-replace works fine for the first three.

**Images.** Every project has a plate that currently says *Plate TK*. Replace one with a real
image like this:

```html
<!-- was: <div class="plate" data-plate="pbr" aria-hidden="true">…</div> -->
<img class="plate" src="assets/plates/pbr-01.png"
     alt="Path-traced interior scene with a glass sphere and soft area light">
```

The `.plate` class already handles the sizing and aspect ratio, so an `<img>` drops straight in.
Do the path tracer renders first — they're the strongest visual material you have, and the
sticky viewer on desktop is built to show them large. Same swap works for the portrait:
replace `.portrait-frame` with an `<img class="portrait-frame" src="assets/julia.jpg" alt="…">`.

**Sticky viewer note:** on desktop the plate shown on the right comes from the *viewer*, not
from inside the row, so also update the plate in `<aside class="viewer">` if you want a real
image there. Easiest version: give each row's `data-plate` a matching `<img>` and let the row's
own plate show on mobile.

**og.png** is a placeholder I generated. Swapping it for a render with your name over it would
be a real upgrade — it's the image that shows up when someone shares the link in Slack.

---

## 2. Adding a project

Copy any `<li class="row">` block in `index.html` and change five things:

- `data-kind` — `work` or `made`; this drives the filter
- `data-plate` — a key defined near the bottom of `styles.css` (`billing`, `pbr`, `terrain`, …), or add a new one
- `data-caption` / `data-metrics` — the title and one-line slate in the sticky viewer
- `aria-controls` on the button **and** the matching `id` on `.detail` — must be unique
- `.row-idx` — `W·06`, `M·05`, and so on

Then bump the entry count in `.label-count` ("9 entries").

---

## 3. Deploying

**Cloudflare Pages** is the one I'd pick: free, fast everywhere, free HTTPS, and it handles a
custom domain without much ceremony. No build step means nothing can break in a build step.

1. Put this folder in a GitHub repo:

   ```bash
   cd julia-rieger-site
   git init
   git add .
   git commit -m "Initial site"
   gh repo create julia-rieger-site --public --source=. --push
   # or create the repo on github.com and: git remote add origin … && git push -u origin main
   ```

2. Go to [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** →
   **Create** → **Pages** → **Connect to Git**. Authorize GitHub, pick the repo.

3. On the build settings screen:
   - Framework preset: **None**
   - Build command: **leave empty**
   - Build output directory: **`/`**

   Save and deploy. You'll get a `something.pages.dev` URL in about twenty seconds.

4. Every `git push` to `main` redeploys automatically. Pull requests get their own preview URL.

5. Custom domain: buy `juliarieger.com` (Cloudflare Registrar, Namecheap, wherever), then in the
   Pages project → **Custom domains** → **Set up a domain**. If the domain is registered at
   Cloudflare it's two clicks; otherwise you'll add a `CNAME` record pointing at your
   `pages.dev` hostname. Then update the `canonical` and `og:url` tags in `index.html`.

**Netlify** and **Vercel** work identically — connect the repo, no build command, publish
directory `.`. **GitHub Pages** also works (Settings → Pages → deploy from `main`, root) but
custom domains and HTTPS are slightly more fiddly, and you get a `/repo-name/` path prefix
unless you use a custom domain. All the paths in this project are relative, so it'll survive
either way.

---

## 4. Things worth knowing about the code

**The path tracer** (`main.js`, part 1) is a real Monte Carlo path tracer: 176×220 pixels, three
spheres, a floor, and a sun in the sky. It fires one sample per pixel per frame and averages,
which is why it starts noisy and resolves. It stops at 240 samples, pauses when scrolled out of
view, and renders a single quiet pass if the visitor has reduced motion turned on. Turn the
`MAX_SPP` and canvas `width`/`height` down if you ever want it cheaper.

**The design tokens** are the first block of `styles.css`. Change `--pink` and the whole site
follows. Dark mode is defined in the two blocks right underneath, and both are wired up — the
`prefers-color-scheme` block and the `[data-theme="dark"]` block have to stay in sync.

**Accessibility** is already handled and worth not breaking: the index rows are real
`<button>`s with `aria-expanded`, the filters are `aria-pressed` toggles, there's a skip link,
focus outlines are visible, and every animation is disabled under
`prefers-reduced-motion: reduce`. If you add interactive things, use buttons and links rather
than clickable `<div>`s.

**No analytics, no cookies, no fonts other than Google Fonts.** If you'd rather not hit Google,
download the three families into `assets/fonts/` and swap the `<link>` for `@font-face` rules.
