/* ============================================================================
   Julia V Rieger — site behavior
   Four small pieces, in order:
     1. pathTracer()  — the masthead render
     2. index()       — filters, expanding rows, the sticky viewer
     3. navState()    — which section you're in
     4. misc()        — the year in the colophon
   No dependencies. Nothing here needs a build step.
   ========================================================================== */

(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ==========================================================================
     1. A very small Monte Carlo path tracer.

     One floor, three spheres, a sky with a sun in it. For each pixel we fire a
     ray, let it bounce a few times, and average the light that comes back.
     Averaging is why the image starts noisy and cleans up — same idea as the
     C++ renderer further down the page, just much smaller.

     The inner loop is written with plain numbers rather than vector objects,
     because it runs a few million times and the garbage collector notices.
     ====================================================================== */
  function pathTracer() {
    var canvas = document.getElementById("tracer");
    if (!canvas || !canvas.getContext) return;

    var ctx = canvas.getContext("2d", { alpha: false });
    var frameEl = canvas.parentNode;
    var sppEl = document.getElementById("spp");
    var button = document.getElementById("rerender");

    var MAX_SPP = reduceMotion ? 120 : 240;
    var MAX_BOUNCES = 4;

    /* ── scene ───────────────────────────────────────────────────────────
       Spheres are flat arrays: x, y, z, radius, albedo r/g/b, mirror flag. */
    var SPH = [
      [-0.34, 1.00, 0.00, 1.00, 0.97, 0.22, 0.55, 0],   // the pink one
      [ 1.34, 0.60, 1.55, 0.60, 0.91, 0.89, 0.85, 0],   // bone
      [-1.62, 0.34, 2.35, 0.34, 0.26, 0.33, 0.28, 0]    // deep moss, cropped
    ];
    var N_SPH = SPH.length;

    var FLOOR_R = 0.62, FLOOR_G = 0.60, FLOOR_B = 0.57;
    var BG_R = 0.038, BG_G = 0.052, BG_B = 0.044;   // seen directly behind the scene
    var SUN_X, SUN_Y, SUN_Z;
    // A big soft sun: cheaper to hit by chance, so the image is far less
    // noisy, and the shadows come out soft instead of stencilled.
    var SUN_COS = 0.90;
    var SUN_R = 4.6, SUN_G = 4.1, SUN_B = 3.4;
    var EXPOSURE = 1.12;

    (function () {
      var x = -0.46, y = 0.80, z = 0.40;
      var l = Math.sqrt(x * x + y * y + z * z);
      SUN_X = x / l; SUN_Y = y / l; SUN_Z = z / l;
    })();

    /* ── camera ──────────────────────────────────────────────────────────── */
    var EYE_X = 0.30, EYE_Y = 1.90, EYE_Z = 8.10;
    var FX, FY, FZ, RX, RY, RZ, UX, UY, UZ;

    (function () {
      var tx = 0, ty = 0.80, tz = 0;
      var fx = tx - EYE_X, fy = ty - EYE_Y, fz = tz - EYE_Z;
      var fl = Math.sqrt(fx * fx + fy * fy + fz * fz);
      FX = fx / fl; FY = fy / fl; FZ = fz / fl;
      // right = normalize(cross(forward, worldUp)) with worldUp = (0, 1, 0)
      var rx = -FZ, ry = 0, rz = FX;
      var rl = Math.sqrt(rx * rx + rz * rz);
      RX = rx / rl; RY = ry; RZ = rz / rl;
      // up = cross(right, forward)
      UX = RY * FZ - RZ * FY;
      UY = RZ * FX - RX * FZ;
      UZ = RX * FY - RY * FX;
    })();

    var TAN_HALF = Math.tan((33 * Math.PI / 180) / 2);

    /* ── canvas size ─────────────────────────────────────────────────────
       The bitmap is sized to the frame's real shape rather than a fixed
       176×220, so the render never gets stretched when the layout changes
       between the desktop column and the stacked mobile version. We hold the
       pixel count roughly constant so the cost stays the same either way. */
    var PIXEL_BUDGET = 42000;
    var W, H, ASPECT, accum, image, lastAspect = 0;

    function sizeCanvas() {
      var box = frameEl.getBoundingClientRect();
      var ar = box.width > 0 && box.height > 0 ? box.width / box.height : 0.8;
      W = Math.max(120, Math.round(Math.sqrt(PIXEL_BUDGET * ar)));
      H = Math.max(120, Math.round(W / ar));
      canvas.width = W;
      canvas.height = H;
      ASPECT = W / H;
      accum = new Float32Array(W * H * 3);
      image = ctx.createImageData(W, H);
      lastAspect = ar;
    }

    var samples = 0;
    var running = false;
    var visible = true;

    // trace() writes its result here instead of allocating.
    var outR = 0, outG = 0, outB = 0;

    function trace(ox, oy, oz, dx, dy, dz) {
      var tr = 1, tg = 1, tb = 1;      // throughput
      var cr = 0, cg = 0, cb = 0;      // collected radiance

      for (var bounce = 0; bounce < MAX_BOUNCES; bounce++) {
        var best = Infinity;
        var hit = -1;                  // -1 miss, -2 floor, >= 0 sphere index

        for (var i = 0; i < N_SPH; i++) {
          var s = SPH[i];
          var ex = ox - s[0], ey = oy - s[1], ez = oz - s[2];
          var b = ex * dx + ey * dy + ez * dz;
          var c = ex * ex + ey * ey + ez * ez - s[3] * s[3];
          var disc = b * b - c;
          if (disc <= 0) continue;
          var sq = Math.sqrt(disc);
          var t = -b - sq;
          if (t < 0.001) t = -b + sq;
          if (t > 0.001 && t < best) { best = t; hit = i; }
        }

        if (dy < -1e-6) {
          var tp = -oy / dy;
          if (tp > 0.001 && tp < best) { best = tp; hit = -2; }
        }

        if (hit === -1) {
          if (bounce === 0) {
            cr += BG_R; cg += BG_G; cb += BG_B;
          } else {
            var sd = dx * SUN_X + dy * SUN_Y + dz * SUN_Z;
            if (sd > SUN_COS) {
              cr += tr * SUN_R; cg += tg * SUN_G; cb += tb * SUN_B;
            } else {
              var h = dy * 0.5 + 0.5;
              if (h < 0) h = 0; else if (h > 1) h = 1;
              cr += tr * (0.13 * (1 - h) + 0.07 * h);
              cg += tg * (0.14 * (1 - h) + 0.09 * h);
              cb += tb * (0.17 * (1 - h) + 0.14 * h);
            }
          }
          break;
        }

        var px = ox + dx * best, py = oy + dy * best, pz = oz + dz * best;
        var nx, ny, nz, ar, ag, ab, mirror = 0;

        if (hit === -2) {
          nx = 0; ny = 1; nz = 0;
          // a faint checker so the floor reads as a surface rather than a void
          var chk = ((Math.floor(px * 0.9) + Math.floor(pz * 0.9)) & 1) ? 1 : 0.82;
          ar = FLOOR_R * chk; ag = FLOOR_G * chk; ab = FLOOR_B * chk;
        } else {
          var sp = SPH[hit];
          var invr = 1 / sp[3];
          nx = (px - sp[0]) * invr; ny = (py - sp[1]) * invr; nz = (pz - sp[2]) * invr;
          ar = sp[4]; ag = sp[5]; ab = sp[6]; mirror = sp[7];
        }

        tr *= ar; tg *= ag; tb *= ab;

        if (mirror) {
          var dn = dx * nx + dy * ny + dz * nz;
          dx -= 2 * dn * nx; dy -= 2 * dn * ny; dz -= 2 * dn * nz;
        } else {
          // cosine-weighted direction in the hemisphere around the normal
          var a = Math.random() * 6.283185307179586;
          var r2 = Math.random();
          var rr = Math.sqrt(r2);
          var lx = Math.cos(a) * rr, ly = Math.sin(a) * rr, lz = Math.sqrt(1 - r2);

          var txx, tyy, tzz;
          if (Math.abs(nx) > 0.9) { txx = nz; tyy = 0; tzz = -nx; }
          else { txx = 0; tyy = -nz; tzz = ny; }
          var tl = Math.sqrt(txx * txx + tyy * tyy + tzz * tzz);
          txx /= tl; tyy /= tl; tzz /= tl;

          var bxx = ny * tzz - nz * tyy;
          var byy = nz * txx - nx * tzz;
          var bzz = nx * tyy - ny * txx;

          dx = txx * lx + bxx * ly + nx * lz;
          dy = tyy * lx + byy * ly + ny * lz;
          dz = tzz * lx + bzz * ly + nz * lz;
        }

        ox = px + nx * 0.0015; oy = py + ny * 0.0015; oz = pz + nz * 0.0015;
      }

      outR = cr; outG = cg; outB = cb;
    }

    function onePass() {
      var i = 0;
      for (var y = 0; y < H; y++) {
        for (var x = 0; x < W; x++) {
          var u = ((x + Math.random()) / W * 2 - 1) * ASPECT * TAN_HALF;
          var v = (1 - (y + Math.random()) / H * 2) * TAN_HALF;
          var dx = FX + RX * u + UX * v;
          var dy = FY + RY * u + UY * v;
          var dz = FZ + RZ * u + UZ * v;
          var dl = Math.sqrt(dx * dx + dy * dy + dz * dz);
          trace(EYE_X, EYE_Y, EYE_Z, dx / dl, dy / dl, dz / dl);
          accum[i] += outR; accum[i + 1] += outG; accum[i + 2] += outB;
          i += 3;
        }
      }
      samples++;
    }

    function present() {
      var data = image.data;
      var inv = EXPOSURE / samples;
      var n = W * H * 3;
      for (var p = 0, q = 0; p < n; p += 3, q += 4) {
        var r = accum[p] * inv, g = accum[p + 1] * inv, b = accum[p + 2] * inv;
        // Tonemap on luminance rather than per channel — per-channel Reinhard
        // washes the color out of anything bright, and the pink is the point.
        var l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        var k = l > 1e-5 ? (l / (1 + l)) / l : 0;
        r *= k; g *= k; b *= k;
        if (r > 1) r = 1; if (g > 1) g = 1; if (b > 1) b = 1;
        data[q]     = Math.pow(r, 0.4545) * 255;                    // gamma
        data[q + 1] = Math.pow(g, 0.4545) * 255;
        data[q + 2] = Math.pow(b, 0.4545) * 255;
        data[q + 3] = 255;
      }
      ctx.putImageData(image, 0, 0);
      if (sppEl) {
        sppEl.textContent = samples >= MAX_SPP
          ? "spp " + pad(samples) + " · converged"
          : "spp " + pad(samples);
      }
    }

    function pad(n) { return ("0000" + n).slice(-4); }

    // We always render in requestAnimationFrame slices so the page stays
    // responsive. Under reduced motion we do the same work but only paint the
    // finished frame, so there's no visible refining.
    function frame() {
      if (samples >= MAX_SPP || !visible) { running = false; return; }
      var began = performance.now();
      do { onePass(); } while (samples < MAX_SPP && performance.now() - began < 12);
      if (!reduceMotion || samples >= MAX_SPP) present();
      if (samples >= MAX_SPP) { running = false; return; }
      requestAnimationFrame(frame);
    }

    function start() {
      if (!accum) sizeCanvas();
      accum.fill(0);
      samples = 0;
      running = true;
      requestAnimationFrame(frame);
    }

    // Re-render only when the frame's shape actually changes — a plain scroll
    // on mobile fires resize constantly and must not restart anything.
    var resizeTimer = null;
    window.addEventListener("resize", function () {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        var box = frameEl.getBoundingClientRect();
        if (!box.width || !box.height) return;
        var ar = box.width / box.height;
        if (Math.abs(ar - lastAspect) / lastAspect > 0.08) {
          sizeCanvas();
          start();
        }
      }, 280);
    });

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible && !running && samples < MAX_SPP) {
          running = true;
          requestAnimationFrame(frame);
        }
      }, { rootMargin: "150px" }).observe(canvas);
    }

    if (button) {
      button.addEventListener("click", function () { if (!running) start(); });
    }

    start();
  }

  /* ==========================================================================
     2. The index: filters, expanding rows, sticky viewer.
     ====================================================================== */
  function index() {
    var list = document.getElementById("rows");
    if (!list) return;

    var rows = Array.prototype.slice.call(list.querySelectorAll(".row"));
    var plate = document.getElementById("viewerPlate");
    var caption = document.getElementById("viewerCaption");
    var metrics = document.getElementById("viewerMetrics");

    function show(row) {
      if (!plate || !row) return;
      plate.setAttribute("data-plate", row.getAttribute("data-plate") || "");
      caption.textContent = row.getAttribute("data-caption") || "";
      metrics.textContent = row.getAttribute("data-metrics") || "";
    }

    rows.forEach(function (row) {
      var head = row.querySelector(".row-head");
      var detail = row.querySelector(".detail");

      head.addEventListener("click", function () {
        var open = head.getAttribute("aria-expanded") === "true";
        head.setAttribute("aria-expanded", String(!open));
        row.classList.toggle("is-open", !open);
        if (open) {
          detail.setAttribute("hidden", "");
        } else {
          detail.removeAttribute("hidden");
          show(row);
        }
      });

      head.addEventListener("mouseenter", function () { show(row); });
      head.addEventListener("focus", function () { show(row); });
    });

    if (rows.length) show(rows[0]);

    var buttons = Array.prototype.slice.call(document.querySelectorAll(".filter"));
    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var want = btn.getAttribute("data-filter");
        buttons.forEach(function (b) {
          var on = b === btn;
          b.classList.toggle("is-on", on);
          b.setAttribute("aria-pressed", String(on));
        });
        var firstShown = null;
        rows.forEach(function (row) {
          var match = want === "all" || row.getAttribute("data-kind") === want;
          if (match) {
            row.removeAttribute("hidden");
            if (!firstShown) firstShown = row;
          } else {
            row.setAttribute("hidden", "");
          }
        });
        if (firstShown) show(firstShown);
      });
    });
  }

  /* ==========================================================================
     3. Mark the section you're currently reading in the top bar.
     ====================================================================== */
  function navState() {
    var links = Array.prototype.slice.call(document.querySelectorAll(".topbar-nav a"));
    if (!links.length || !("IntersectionObserver" in window)) return;

    var map = {};
    links.forEach(function (a) {
      var el = document.querySelector(a.getAttribute("href"));
      if (el) map[el.id] = a;
    });

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        links.forEach(function (a) { a.classList.remove("is-here"); });
        var a = map[entry.target.id];
        if (a) a.classList.add("is-here");
      });
    }, { rootMargin: "-45% 0px -50% 0px" });

    Object.keys(map).forEach(function (id) {
      io.observe(document.getElementById(id));
    });
  }

  /* ==========================================================================
     4. Odds and ends.
     ====================================================================== */
  function misc() {
    var year = document.getElementById("year");
    if (year) year.textContent = String(new Date().getFullYear());
  }

  pathTracer();
  index();
  navState();
  misc();
})();
