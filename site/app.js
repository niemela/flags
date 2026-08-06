/* Flag Browser — static single-page app over the niemela/flags dataset.
   No build step, no dependencies. Routes are clean paths resolved against the
   directory this script is served from, so it works at a project-pages base
   like /flags/ or at a domain root unchanged. */
(function () {
  "use strict";

  // Resolve the app's root path from this script's own URL (e.g. "/flags/").
  // Read currentScript synchronously at top-level, before any rewrite below.
  var APP_ROOT = new URL(".", document.currentScript.src).pathname;
  var DATA = APP_ROOT + "data/";

  // SPA redirect decode: if we arrived here via the 404.html bounce
  // (URL like /flags/?/colors/blue), restore the real path. This must run
  // from app.js — not the HTML head — so that relative resources (this very
  // script, the stylesheet, the favicon) resolve against the app root rather
  // than the deep route the rewrite produces.
  (function () {
    var l = window.location;
    if (l.search[1] === "/") {
      var decoded = l.search.slice(1).split("&").map(function (s) {
        return s.replace(/~and~/g, "&");
      }).join("?");
      history.replaceState(null, "", l.pathname.replace(/\/$/, "") + decoded + l.hash);
    }
  })();

  var COLOR_HEX = {
    white: "#f7f7f7", red: "#d62828", yellow: "#ffd100", blue: "#0040a8",
    green: "#0a8a3e", black: "#1a1a1a", "light-blue": "#5bb6e6", brown: "#7b4a2b",
    gold: "#d4af37", navy: "#0a1f44", orange: "#f47b20", purple: "#6b2d8b",
    grey: "#9aa0a6", maroon: "#7b1e2b", pink: "#f48fb1"
  };

  var FACET_KEYS = ["colors", "features", "regions", "types", "variants", "proportion"];
  var KEY_ALIASES = {
    color: "colors", colors: "colors",
    feature: "features", features: "features",
    region: "regions", regions: "regions",
    type: "types", types: "types",
    variant: "variants", variants: "variants",
    proportion: "proportion", proportions: "proportion", ratio: "proportion", ratios: "proportion",
    date: "date", year: "date", "as-of": "date", asof: "date", when: "date"
  };
  // facet key -> the field on each flag entry (proportion is single-valued)
  var FACET_FIELD = {
    colors: "colors", features: "features", regions: "region", types: "type",
    variants: "variant", proportion: "aspect_ratio"
  };

  var app = document.getElementById("app");
  var searchInput = document.getElementById("search");

  var INDEX = null;     // { count, facets, flags }
  var BY_ID = {};       // id -> entry
  var EMBEDDED_BY = {}; // id -> [ids that embed it]
  var PRECEDED_BY = {};  // id -> [ids listing it as a successor]
  var SUCCEEDED_BY = {}; // id -> [ids listing it as a predecessor]
  var renderLimit = 240;
  // "+ N more" disclosure, per facet group. Session-only by design: it is a
  // reading aid, not part of the query, so it never reaches the URL or storage.
  var expandedGroups = {};
  var BROWSE_STATE = null;    // state the delegated browse listeners act on
  var pendingPillFocus = null; // index of the pill being removed, restored after rebuild
  var NOW_YEAR = new Date().getFullYear();
  var SLIDER_FLOOR = 1700; // slider's left edge; older years still reachable by typed input/URL

  /* ----------------------------- data load ----------------------------- */
  // Always revalidate the index: it carries the per-flag `rev` hashes that
  // cache-bust the (otherwise long-cached) SVG URLs, so it must stay fresh.
  fetch(DATA + "flags.json", { cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(function (data) {
      INDEX = data;
      data.flags.forEach(function (f) {
        BY_ID[f.id] = f;
        (f.embeds || []).forEach(function (ref) {
          (EMBEDDED_BY[ref] = EMBEDDED_BY[ref] || []).push(f.id);
        });
        // Succession is authored one-way in the data; index the reverse so a
        // page can show both "preceded by" and "succeeded by" regardless of
        // which side the fact was recorded on.
        (f.succ || []).forEach(function (ref) {
          (PRECEDED_BY[ref] = PRECEDED_BY[ref] || []).push(f.id);
        });
        (f.pred || []).forEach(function (ref) {
          (SUCCEEDED_BY[ref] = SUCCEEDED_BY[ref] || []).push(f.id);
        });
      });
      render();
    })
    .catch(function (err) {
      app.innerHTML = '<p class="error">Could not load flag data (' +
        esc(err.message) + '). If running locally, serve over HTTP rather than file://.</p>';
    });

  /* ------------------------------ routing ------------------------------ */
  function parseRoute() {
    var path = decodeURIComponent(location.pathname);
    var rel = path.indexOf(APP_ROOT) === 0 ? path.slice(APP_ROOT.length) : path.replace(/^\/+/, "");
    rel = rel.replace(/^\/+|\/+$/g, "");
    var segs = rel ? rel.split("/") : [];
    var params = new URLSearchParams(location.search);

    if (segs.length === 0) return { view: "browse", state: emptyState(params) };
    if (segs[0] === "random") return { view: "random" };
    if (segs[0] === "about") return { view: "about" };
    if (KEY_ALIASES[segs[0]]) return { view: "browse", state: parseFacetState(segs, params) };
    return { view: "detail", id: segs[0] };
  }

  // Each facet holds an include list and an exclude list. In the URL, values
  // within a facet are joined with "+", and an excluded value is marked with a
  // leading "!" (e.g. /colors/blue+grey+!red). We only ever split on "+", so
  // hyphenated names like greek-cross / light-blue are never mis-parsed.
  function emptyState(params) {
    return {
      colors: { inc: [], exc: [], only: false }, features: { inc: [], exc: [], only: false },
      regions: { inc: [], exc: [], only: false }, types: { inc: [], exc: [], only: false },
      variants: { inc: [], exc: [], only: false }, proportion: { inc: [], exc: [], only: false },
      date: null,
      q: (params.get("q") || "").trim()
    };
  }

  function parseFacetState(segs, params) {
    var st = emptyState(params);
    for (var i = 0; i < segs.length; i += 2) {
      var key = KEY_ALIASES[segs[i]];
      var val = segs[i + 1];
      if (!key || !val) continue;
      if (key === "date") { var dv = normalizeDateValue(val); if (dv) st.date = dv; continue; }
      val.split("+").filter(Boolean).forEach(function (tok) {
        if (tok === "only") { st[key].only = true; return; }
        if (tok.charAt(0) === "!") {
          var v = tok.slice(1);
          if (v && st[key].exc.indexOf(v) < 0) st[key].exc.push(v);
        } else if (st[key].inc.indexOf(tok) < 0) {
          st[key].inc.push(tok);
        }
      });
    }
    return st;
  }

  function browseURL(st) {
    var parts = [];
    FACET_KEYS.forEach(function (k) {
      var f = st[k];
      var toks = f.inc.slice().sort()
        .concat(f.exc.slice().sort().map(function (v) { return "!" + v; }));
      if (k !== "proportion" && f.only && f.inc.length) toks.push("only");
      if (toks.length) parts.push(k, toks.join("+"));
    });
    if (st.date) parts.push("date", st.date);
    var url = APP_ROOT + parts.join("/");
    if (st.q) url += "?q=" + encodeURIComponent(st.q);
    return url;
  }

  function detailURL(id) { return APP_ROOT + encodeURIComponent(id); }

  /* --------------------------- date facet ------------------------------ */
  // The `date` facet is single-valued (one time query) and predicate-based, so
  // it lives outside the include/exclude machinery. A value is one of:
  //   current | <year> | <year>-<mm>[-<dd>] | <a>..<b> | <a>.. | ..<b>
  // and `YYYY-YYYY` is accepted as a friendly alias for the `YYYY..YYYY` range.
  // Matching is year-granular against each flag's resolved `t` spans.
  function yearOf(s) {
    if (s == null || s === "") return null;
    var m = String(s).match(/^(\d{1,4})/);
    return m ? parseInt(m[1], 10) : null;
  }
  function datePart(s) {
    s = (s || "").trim().replace(/[~?]$/, "");
    if (!s) return null;
    return /^\d{1,4}(-\d{2}(-\d{2})?)?$/.test(s) ? s : null;
  }
  function normalizeDateValue(v) {
    if (!v) return null;
    v = String(v).trim().toLowerCase();
    if (v === "current") return "current";
    if (v.indexOf("..") >= 0) {
      var p = v.split(".."), a = datePart(p[0]), b = datePart(p[1]);
      if (a === null && b === null) return null;
      return (a || "") + ".." + (b || "");
    }
    var parts = v.split("-");
    if (parts.length === 2 && /^\d{4}$/.test(parts[0]) && /^\d{4}$/.test(parts[1])) {
      return parts[0] + ".." + parts[1]; // YYYY-YYYY range alias -> canonical ..
    }
    var d = datePart(v);
    return d; // single point, or null if unparseable
  }
  function timeMode(dv) {
    if (!dv) return "all";
    if (dv === "current") return "current";
    if (dv.indexOf("..") >= 0) return "range";
    return "point";
  }
  function matchesDate(f, dv) {
    var spans = f.t; // array of [lo,hi] (hi null = ongoing), or undefined = always-on
    if (dv === "current") {
      if ((f.type || []).indexOf("historical") >= 0) return false;
      if (!spans) return true;
      return spans.some(function (s) { return s[1] === null; });
    }
    if (!spans) return true; // no temporal data -> matches any year/range
    if (dv.indexOf("..") >= 0) {
      var p = dv.split(".."), a = yearOf(p[0]), b = yearOf(p[1]);
      return spans.some(function (s) {
        return (a === null || s[1] === null || s[1] >= a) &&
               (b === null || s[0] === null || s[0] <= b);
      });
    }
    var y = yearOf(dv);
    if (y === null) return true;
    return spans.some(function (s) {
      return (s[0] === null || s[0] <= y) && (s[1] === null || s[1] >= y);
    });
  }

  // Going somewhere: a new place in history, and the top of it.
  function goTo(href) {
    history.pushState({}, "", href);
    render();
    window.scrollTo(0, 0);
  }

  // Refining the browse view already on screen. The URL still updates on every
  // toggle — shareability and reload-reproducibility are unchanged — but it
  // replaces rather than pushes, so Back leaves the browse view instead of
  // walking back through every chip click, and nothing scrolls.
  function applyBrowseState(st) {
    history.replaceState({}, "", browseURL(st));
    renderBrowse(st);
  }

  // No scrollTo here: history.scrollRestoration is left at its default so the
  // browser restores the previous scroll position itself.
  window.addEventListener("popstate", render);

  // Intercept internal link clicks for SPA navigation.
  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest("a[data-nav]");
    if (!a) return;
    var href = a.getAttribute("href");
    if (!href) return;
    e.preventDefault();
    goTo(href);
  });

  document.querySelector(".brand").addEventListener("click", function (e) {
    e.preventDefault(); goTo(APP_ROOT);
  });
  document.getElementById("random-btn").addEventListener("click", function () {
    goTo(APP_ROOT + "random");
  });

  var searchTimer = null;
  searchInput.addEventListener("input", function () {
    clearTimeout(searchTimer);
    var val = searchInput.value;
    searchTimer = setTimeout(function () {
      var st = currentBrowseState();
      st.q = val.trim();
      renderLimit = 240;
      applyBrowseState(st);
    }, 180);
  });

  function currentBrowseState() {
    var r = parseRoute();
    return r.view === "browse" ? r.state : emptyState(new URLSearchParams(""));
  }

  /* ------------------------------ render ------------------------------- */
  function render() {
    if (!INDEX) return;
    var r = parseRoute();
    if (r.view === "random") {
      // /random is a place we already pushed; swap the URL for the flag it
      // picked rather than stacking a second entry.
      var f = INDEX.flags[Math.floor(Math.random() * INDEX.flags.length)];
      history.replaceState({}, "", detailURL(f.id));
      renderDetail(f.id);
      window.scrollTo(0, 0);
      return;
    }
    if (r.view === "detail") { renderDetail(r.id); return; }
    if (r.view === "about") { renderAbout(); return; }
    renderBrowse(r.state);
  }

  /* ------------------------------ browse ------------------------------- */
  function hasAny(list, vals) { return vals.some(function (v) { return list.indexOf(v) >= 0; }); }
  function hasAll(list, vals) { return vals.every(function (v) { return list.indexOf(v) >= 0; }); }
  // "only" upper bound: the flag's values for a facet must not stray outside the
  // included set. Inert without includes. Combined with the include lower bound
  // it yields exact-set on the AND-facets (colours/features) and subset on the
  // OR-facets (regions/types/variants).
  function withinOnly(vals, facet) {
    if (!facet.only || !facet.inc.length) return true;
    return vals.every(function (v) { return facet.inc.indexOf(v) >= 0; });
  }

  function matches(f, st) {
    // Colours & features: include = must have ALL selected; exclude = must have none.
    var fc = f.colors || [];
    if (!hasAll(fc, st.colors.inc)) return false;
    if (hasAny(fc, st.colors.exc)) return false;
    if (!withinOnly(fc, st.colors)) return false;

    var ff = f.features || [];
    if (!hasAll(ff, st.features.inc)) return false;
    if (hasAny(ff, st.features.exc)) return false;
    if (!withinOnly(ff, st.features)) return false;

    // Region / type / variant: include = must match at least one (these are
    // lists where a flag legitimately carries several); exclude = match none.
    var fr = f.region || [];
    if (st.regions.inc.length && !hasAny(fr, st.regions.inc)) return false;
    if (hasAny(fr, st.regions.exc)) return false;
    if (!withinOnly(fr, st.regions)) return false;

    var ft = f.type || [];
    if (st.types.inc.length && !hasAny(ft, st.types.inc)) return false;
    if (hasAny(ft, st.types.exc)) return false;
    if (!withinOnly(ft, st.types)) return false;

    var fv = f.variant || [];
    if (st.variants.inc.length && !hasAny(fv, st.variants.inc)) return false;
    if (hasAny(fv, st.variants.exc)) return false;
    if (!withinOnly(fv, st.variants)) return false;

    // Proportion is a single value per flag; multiple selected values mean OR.
    var fp = f.aspect_ratio ? [f.aspect_ratio] : [];
    if (st.proportion.inc.length && !hasAny(fp, st.proportion.inc)) return false;
    if (hasAny(fp, st.proportion.exc)) return false;

    if (st.date && !matchesDate(f, st.date)) return false;

    if (st.q) {
      var q = st.q.toLowerCase();
      if ((f.name || "").toLowerCase().indexOf(q) < 0 && (f.id || "").toLowerCase().indexOf(q) < 0) return false;
    }
    return true;
  }

  // Scroll position, keyboard focus and the "+ N more" disclosure all live in
  // DOM nodes, so a refinement preserves them by not destroying those nodes:
  // the sidebar is built once on entry and updated in place afterwards. Only
  // the results column is rebuilt, and only a view transition replaces #app.
  function renderBrowse(st) {
    document.title = "Flag Browser";
    if (searchInput.value !== st.q) searchInput.value = st.q;
    BROWSE_STATE = st;

    var results = INDEX.flags.filter(function (f) { return matches(f, st); });
    var browse = app.querySelector(".browse");
    var entering = !browse;

    if (entering) {
      app.innerHTML = '<div class="browse">' + renderFilters(st) +
        '<div class="results"></div>' +
        '<p class="sr-live" aria-live="polite"></p></div>';
      browse = app.querySelector(".browse");
      wireBrowse(browse);
    } else {
      updateFilters(st);
    }
    renderResults(browse.querySelector(".results"), st, results, !entering);
  }

  function renderResults(box, st, results, announceCount) {
    var h = renderResultsBar(st, results.length);
    if (results.length === 0) {
      h += '<p class="empty">No flags match these filters.</p>';
    } else {
      h += '<div class="grid">' + results.slice(0, renderLimit).map(card).join("") + "</div>";
      if (results.length > renderLimit) {
        h += '<button class="load-more" id="load-more">Show more (' +
          (results.length - renderLimit) + " remaining)</button>";
      }
    }
    box.innerHTML = h;

    // The pills are rebuilt, so focus has to be handed on deliberately: to the
    // pill that took the removed one's place, else to the last one, else to the
    // results count.
    if (pendingPillFocus !== null) {
      var buttons = box.querySelectorAll(".active-facets .facet-pill button");
      var target = buttons[pendingPillFocus] || buttons[buttons.length - 1];
      if (!target) {
        target = box.querySelector(".results-count");
        if (target) target.tabIndex = -1;
      }
      if (target) target.focus();
      pendingPillFocus = null;
    }
    if (announceCount) {
      announce(results.length + " flag" + (results.length === 1 ? "" : "s"));
    }
  }

  // One persistent live region, never replaced, so announcements are reliable.
  function announce(text) {
    var live = app.querySelector(".sr-live");
    if (live) live.textContent = text;
  }

  function card(f) {
    return '<a class="card" data-nav href="' + detailURL(f.id) + '">' +
      '<div class="thumb"><img loading="lazy" alt="' + esc(f.name) + ' flag" src="' +
      svgURL(f.id) + '"></div>' +
      '<div class="meta"><div class="name">' + esc(f.name) + '</div>' +
      '<div class="code">' + esc(f.id) + "</div></div></a>";
  }

  function renderFilters(st) {
    var f = INDEX.facets;
    var h = '<aside class="filters">';
    h += timeFilter(st);
    h += filterGroup("Colour", "colors", f.colors, st.colors, true, "");
    h += filterGroup("Feature", "features", f.features, st.features, false, "", 16);
    h += filterGroup("Region", "regions", f.regions, st.regions, false, "", 12);
    h += filterGroup("Type", "types", f.types, st.types, false, "");
    h += filterGroup("Variant", "variants", f.variants, st.variants, false, "");
    h += filterGroup("Proportion", "proportion", f.proportion, st.proportion, false, "", 12);
    h += "</aside>";
    return h;
  }

  function filterGroup(title, key, facet, active, swatches, extra, limit) {
    limit = expandedGroups[key] ? facet.length : (limit || facet.length);
    var h = '<div class="filter-group" data-group="' + key + '"><h3>' + title + "</h3>";
    h += extra || "";
    if (key !== "proportion" && active.inc.length) {
      h += '<button type="button" class="only-toggle' + (active.only ? " on" : "") +
        '" data-only="' + key + '" aria-pressed="' + (active.only ? "true" : "false") +
        '" title="Only these — match flags with nothing outside this set">' +
        (active.only ? "✓ " : "") + "only these</button>";
    }
    h += '<div class="chips">';
    facet.forEach(function (pair, i) {
      var val = pair[0], count = pair[1];
      var inc = active.inc.indexOf(val) >= 0;
      var exc = active.exc.indexOf(val) >= 0;
      var hidden = i >= limit && !inc && !exc;
      var cls = "chip" + (inc ? " on" : "") + (exc ? " ex" : "");
      var aria = exc ? "excluded" : (inc ? "included" : "not selected");
      h += '<button type="button" class="' + cls + '" data-facet="' + key +
        '" data-val="' + esc(val) + '" aria-label="' + esc(prettify(val)) + ", " + aria + '"' +
        (hidden ? ' data-extra="1" style="display:none"' : "") + ">" +
        (swatches ? '<span class="swatch" style="background:' + (COLOR_HEX[val] || "#888") + '"></span>' : "") +
        '<span class="chip-label">' + esc(prettify(val)) + '</span> <span class="count">' + count + "</span></button>";
    });
    h += "</div>";
    if (facet.length > limit) {
      var extraCount = facet.length - limit;
      h += '<button type="button" class="more-toggle" data-more="' + key + '">+ ' + extraCount + " more</button>";
    }
    h += "</div>";
    return h;
  }

  // The time filter renders as a segmented mode switch (All / Current / As of /
  // Range) with a year slider + number box for a point, or from/to boxes for a
  // range — continuous inputs, not chips, since time is a continuum.
  function timeFilter(st) {
    var mode = timeMode(st.date);
    var h = '<div class="filter-group time-filter" data-group="date" data-mode="' + mode + '"><h3>Time</h3>';
    h += '<div class="seg">';
    [["all", "All"], ["current", "Current"], ["point", "As of"], ["range", "Range"]].forEach(function (m) {
      h += '<button type="button" class="seg-btn' + (mode === m[0] ? " on" : "") +
        '" data-mode="' + m[0] + '">' + m[1] + "</button>";
    });
    h += '</div><div class="time-body">' + timeBody(st, mode) + "</div></div>";
    return h;
  }

  // The body is split out because its *structure* changes with the mode, so a
  // mode switch re-renders just this subtree while a year change writes into
  // the existing inputs.
  function timeBody(st, mode) {
    var h = "";
    if (mode === "point") {
      var y = yearOf(st.date) || NOW_YEAR;
      var smin = Math.min(SLIDER_FLOOR, y);
      h += '<div class="time-row">' +
        '<input type="range" class="time-slider" min="' + smin + '" max="' + NOW_YEAR + '" value="' + y + '">' +
        '<input type="number" class="time-year" min="0" max="' + NOW_YEAR + '" value="' + y + '"></div>';
    } else if (mode === "range") {
      var p = st.date.split(".."), a = yearOf(p[0]), b = yearOf(p[1]);
      h += '<div class="time-row time-range">' +
        '<input type="number" class="time-from" placeholder="from" value="' + (a != null ? a : "") + '">' +
        '<span class="time-dash">…</span>' +
        '<input type="number" class="time-to" placeholder="to" value="' + (b != null ? b : "") + '"></div>';
    } else if (mode === "current") {
      h += '<p class="time-hint">Flags in use today.</p>';
    } else {
      h += '<p class="time-hint">All flags, any era.</p>';
    }
    return h;
  }

  function dateLabel(dv) {
    if (dv === "current") return "current";
    if (dv.indexOf("..") >= 0) {
      var p = dv.split("..");
      return (p[0] || "…") + "–" + (p[1] || "…");
    }
    return "as of " + dv;
  }
  function dateFacetPill(dv) {
    return '<span class="facet-pill time-pill">' + esc(dateLabel(dv)) +
      '<button type="button" data-removedate="1" title="Remove">&times;</button></span>';
  }

  function facetPill(k, v, neg) {
    return '<span class="facet-pill' + (neg ? " neg" : "") + '">' + (neg ? "not " : "") + esc(prettify(v)) +
      '<button type="button" data-remove="' + k + '" data-val="' + esc(v) + '" title="Remove">&times;</button></span>';
  }
  function onlyPill(k) {
    return '<span class="facet-pill only-pill" title="Only these — nothing outside this set">only' +
      '<button type="button" data-removeonly="' + k + '" title="Remove only">&times;</button></span>';
  }

  function renderResultsBar(st, count) {
    var h = '<div class="results-bar"><span class="results-count">' +
      count + " flag" + (count === 1 ? "" : "s") + "</span>";
    var pills = "";
    FACET_KEYS.forEach(function (k) {
      st[k].inc.forEach(function (v) { pills += facetPill(k, v, false); });
      st[k].exc.forEach(function (v) { pills += facetPill(k, v, true); });
      if (k !== "proportion" && st[k].only && st[k].inc.length) pills += onlyPill(k);
    });
    if (st.date) pills += dateFacetPill(st.date);
    if (st.q) pills += '<span class="facet-pill">“' + esc(st.q) + '”<button type="button" data-clearq="1">&times;</button></span>';
    if (pills) h += '<div class="active-facets">' + pills + "</div>";
    if (pills) h += '<button class="clear-all" id="clear-all">Clear all</button>';
    h += "</div>";
    return h;
  }

  // Refinement path: mutate the existing sidebar. Chips keep their identity, so
  // whichever one was clicked keeps focus, and the sidebar keeps its scroll.
  function updateFilters(st) {
    FACET_KEYS.forEach(function (key) {
      var group = app.querySelector('.filter-group[data-group="' + key + '"]');
      if (!group) return;
      var active = st[key];
      group.querySelectorAll(".chip[data-facet]").forEach(function (chip) {
        var val = chip.dataset.val;
        var inc = active.inc.indexOf(val) >= 0;
        var exc = active.exc.indexOf(val) >= 0;
        chip.classList.toggle("on", inc);
        chip.classList.toggle("ex", exc);
        chip.setAttribute("aria-label", prettify(val) + ", " +
          (exc ? "excluded" : inc ? "included" : "not selected"));
        // A selected chip is never left hidden behind "+ N more".
        if (chip.dataset.extra) {
          chip.style.display = (inc || exc || expandedGroups[key]) ? "" : "none";
        }
      });
      syncOnlyToggle(group, key, active);
    });
    syncTimeFilter(st);
  }

  // "only these" exists only while the group has includes, so it is added and
  // removed rather than re-rendered with the group.
  function syncOnlyToggle(group, key, active) {
    var btn = group.querySelector(".only-toggle");
    if (key === "proportion" || !active.inc.length) {
      if (btn) btn.remove();
      return;
    }
    if (!btn) {
      btn = document.createElement("button");
      btn.type = "button";
      btn.className = "only-toggle";
      btn.dataset.only = key;
      btn.title = "Only these \u2014 match flags with nothing outside this set";
      group.insertBefore(btn, group.querySelector(".chips"));
    }
    btn.classList.toggle("on", !!active.only);
    btn.setAttribute("aria-pressed", active.only ? "true" : "false");
    btn.textContent = (active.only ? "\u2713 " : "") + "only these";
  }

  function syncTimeFilter(st) {
    var group = app.querySelector('.filter-group[data-group="date"]');
    if (!group) return;
    var mode = timeMode(st.date), body = group.querySelector(".time-body");
    group.querySelectorAll(".seg-btn").forEach(function (b) {
      b.classList.toggle("on", b.dataset.mode === mode);
    });
    if (group.dataset.mode !== mode) {
      group.dataset.mode = mode;
      body.innerHTML = timeBody(st, mode);
      return;
    }
    // Same mode: write values into the live inputs, leaving whichever one the
    // user is typing in alone.
    if (mode === "point") {
      var y = String(yearOf(st.date) || NOW_YEAR);
      var slider = body.querySelector(".time-slider"), box = body.querySelector(".time-year");
      if (slider && slider.value !== y) slider.value = y;
      if (box && box.value !== y && document.activeElement !== box) box.value = y;
    } else if (mode === "range") {
      var p = st.date.split(".."), a = yearOf(p[0]), b = yearOf(p[1]);
      var from = body.querySelector(".time-from"), to = body.querySelector(".time-to");
      if (from && document.activeElement !== from) from.value = (a != null ? a : "");
      if (to && document.activeElement !== to) to.value = (b != null ? b : "");
    }
  }

  function expandGroup(key) {
    expandedGroups[key] = true;
    var group = app.querySelector('.filter-group[data-group="' + key + '"]');
    if (!group) return;
    group.querySelectorAll(".chip[data-extra]").forEach(function (c) { c.style.display = ""; });
    var btn = group.querySelector("[data-more]");
    if (btn) btn.remove();
  }

  // One delegated listener per column rather than one per control: that is what
  // makes updating the sidebar in place cheap, since there is no listener
  // bookkeeping when nodes change state.
  function wireBrowse(browse) {
    var sidebar = browse.querySelector(".filters");
    var results = browse.querySelector(".results");

    sidebar.addEventListener("click", function (e) {
      var st = BROWSE_STATE, t;
      if ((t = e.target.closest(".chip[data-facet]"))) return cycleFacet(st, t.dataset.facet, t.dataset.val);
      if ((t = e.target.closest("[data-only]"))) return setOnly(st, t.dataset.only, !st[t.dataset.only].only);
      if ((t = e.target.closest("[data-more]"))) return expandGroup(t.dataset.more);
      if ((t = e.target.closest(".seg-btn"))) return setTimeMode(st, t.dataset.mode);
    });

    // Dragging the slider updates the number box live; the commit waits for
    // `change` (pointer release), as before.
    sidebar.addEventListener("input", function (e) {
      if (e.target.classList && e.target.classList.contains("time-slider")) {
        var box = sidebar.querySelector(".time-year");
        if (box) box.value = e.target.value;
      }
    });

    sidebar.addEventListener("change", function (e) {
      var st = BROWSE_STATE, el = e.target, cl = el.classList;
      if (!cl) return;
      if (cl.contains("time-slider")) return setDate(st, String(el.value));
      if (cl.contains("time-year")) {
        var v = parseInt(el.value, 10);
        if (!isNaN(v)) setDate(st, String(v));
        return;
      }
      if (cl.contains("time-from") || cl.contains("time-to")) {
        var from = sidebar.querySelector(".time-from"), to = sidebar.querySelector(".time-to");
        var a = from ? from.value.trim() : "", b = to ? to.value.trim() : "";
        if (a || b) setDate(st, a + ".." + b);
      }
    });

    results.addEventListener("click", function (e) {
      var st = BROWSE_STATE, t;
      if (e.target.closest(".active-facets")) notePillFocus(e.target);
      if ((t = e.target.closest("[data-remove]"))) return removeFacet(st, t.dataset.remove, t.dataset.val);
      if ((t = e.target.closest("[data-removeonly]"))) return setOnly(st, t.dataset.removeonly, false);
      if (e.target.closest("[data-removedate]")) return setDate(st, null);
      if (e.target.closest("[data-clearq]")) {
        var ns = cloneState(st); ns.q = "";
        renderLimit = 240;
        return applyBrowseState(ns);
      }
      if (e.target.closest("#clear-all")) {
        renderLimit = 240;
        return applyBrowseState(emptyState(new URLSearchParams("")));
      }
      if (e.target.closest("#load-more")) { renderLimit += 240; return renderBrowse(st); }
    });
  }

  function notePillFocus(target) {
    var pill = target.closest(".facet-pill");
    if (!pill) return;
    var pills = Array.prototype.slice.call(app.querySelectorAll(".active-facets .facet-pill"));
    pendingPillFocus = pills.indexOf(pill);
  }

  function setTimeMode(st, m) {
    if (m === "all") return setDate(st, null);
    if (m === "current") return setDate(st, "current");
    if (m === "point") return setDate(st, String(yearOf(st.date) || NOW_YEAR));
    if (m === "range") {
      var p = (st.date || "").split("..");
      var a = yearOf(p[0]) || (NOW_YEAR - 50), b = yearOf(p[1]) || NOW_YEAR;
      return setDate(st, a + ".." + b);
    }
  }

  function setDate(st, dv) {
    var ns = cloneState(st);
    ns.date = dv;
    renderLimit = 240;
    applyBrowseState(ns);
  }

  // Cycle a value through the three states: none -> include -> exclude -> none.
  // While "only" is active, exclude is meaningless (the set is already closed),
  // so the chip runs two-state (none <-> include); emptying the set drops "only".
  function cycleFacet(st, key, val) {
    var ns = cloneState(st), f = ns[key];
    var i = f.inc.indexOf(val), j = f.exc.indexOf(val);
    if (f.only) {
      if (j >= 0) f.exc.splice(j, 1);
      if (i >= 0) { f.inc.splice(i, 1); if (!f.inc.length) f.only = false; }
      else f.inc.push(val);
    } else if (i < 0 && j < 0) f.inc.push(val);                // none -> include
    else if (i >= 0) { f.inc.splice(i, 1); f.exc.push(val); }  // include -> exclude
    else f.exc.splice(j, 1);                                   // exclude -> none
    renderLimit = 240;
    applyBrowseState(ns);
  }

  // Remove a value entirely (used by the result-bar pills).
  function removeFacet(st, key, val) {
    var ns = cloneState(st), f = ns[key];
    var i = f.inc.indexOf(val); if (i >= 0) f.inc.splice(i, 1);
    var j = f.exc.indexOf(val); if (j >= 0) f.exc.splice(j, 1);
    if (!f.inc.length) f.only = false;
    renderLimit = 240;
    applyBrowseState(ns);
  }

  // Toggle a facet's "only" modifier. Turning it on clears that facet's
  // excludes — they're subsumed, since nothing outside the set survives anyway.
  function setOnly(st, key, on) {
    var ns = cloneState(st), f = ns[key];
    f.only = on;
    if (on) f.exc = [];
    renderLimit = 240;
    applyBrowseState(ns);
  }

  function cloneState(st) {
    function c(f) { return { inc: f.inc.slice(), exc: f.exc.slice(), only: !!f.only }; }
    return {
      colors: c(st.colors), features: c(st.features),
      regions: c(st.regions), types: c(st.types),
      variants: c(st.variants), proportion: c(st.proportion),
      date: st.date,
      q: st.q
    };
  }

  /* ------------------------------ detail ------------------------------- */
  function renderDetail(id) {
    if (!BY_ID[id]) {
      app.innerHTML = '<a class="detail-back" data-nav href="' + APP_ROOT + '">&larr; Back</a>' +
        '<p class="error">No flag with id “' + esc(id) + '”.</p>';
      return;
    }
    app.innerHTML = '<a class="detail-back" data-nav href="' + APP_ROOT + '">&larr; All flags</a>' +
      '<p class="loading">Loading…</p>';

    fetch(DATA + encodeURIComponent(id) + ".json")
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (flag) { renderDetailBody(id, flag); })
      .catch(function () { renderDetailBody(id, BY_ID[id]); }); // fall back to index entry
  }

  function renderDetailBody(id, flag) {
    document.title = (flag.name || id) + " — Flag Browser";
    var h = '<a class="detail-back" data-nav href="' + APP_ROOT + '">&larr; All flags</a>';
    h += '<div class="detail"><div class="detail-figure">' +
      '<img alt="' + esc(flag.name || id) + ' flag" src="' + svgURL(id) + '">' +
      (flag.aspect_ratio ? '<div class="ratio">Proportion <a data-nav href="' +
        browseURL(stateWith("proportion", flag.aspect_ratio)) + '">' + esc(flag.aspect_ratio) + "</a></div>" : "") +
      "</div><div class='detail-info'>";

    h += "<h1>" + esc(flag.name || id) + "</h1>";
    h += '<div class="codes-line">' + codesLine(id, flag) + "</div>";

    // type + region tags (clickable to browse)
    h += '<div class="tags">';
    (flag.type || []).forEach(function (t) {
      h += tag(prettify(t), browseURL(stateWith("types", t)));
    });
    (flag.region || []).forEach(function (rgn) {
      h += tag(rgn, browseURL(stateWith("regions", rgn)));
    });
    (flag.variant || []).forEach(function (v) {
      h += tag(prettify(v), browseURL(stateWith("variants", v)));
    });
    if (flag.status && flag.status !== "de-jure") h += '<span class="tag" style="cursor:default">' + esc(flag.status) + "</span>";
    h += "</div>";

    if (flag.description) h += section("Description", "<p>" + esc(flag.description) + "</p>");

    if (flag.colors && flag.colors.length) {
      var c = flag.colors.map(function (col) {
        var name = typeof col === "string" ? col : col.color;
        var sym = (col && col.symbolism) ? '<div class="c-sym">' + esc(col.symbolism) + "</div>" : "";
        return '<div class="color-row"><span class="swatch" style="background:' + (COLOR_HEX[name] || "#888") +
          '"></span><div><span class="c-name">' + esc(prettify(name)) + "</span>" + sym + "</div></div>";
      }).join("");
      h += section("Colours", c);
    }

    if (flag.features && flag.features.length) {
      var feats = flag.features.map(featureItem).join("");
      h += section("Features", feats);
    }

    if (flag.symbolism) h += section("Overall symbolism", "<p>" + esc(flag.symbolism) + "</p>");
    if (flag.history) h += section("History", "<p>" + esc(flag.history) + "</p>");

    if (flag.periods && flag.periods.length) {
      var ps = '<ul class="periods">' + flag.periods.map(function (p) {
        return "<li>" + esc(p.start || "?") + (p.end ? " – " + esc(p.end) : " – present") + "</li>";
      }).join("") + "</ul>";
      h += section("In use", ps);
    }

    if (flag.sources && flag.sources.length) {
      var src = '<div class="sources">' + flag.sources.map(function (s) {
        return '<a href="' + esc(s) + '" target="_blank" rel="noopener">' + esc(s) + "</a>";
      }).join("") + "</div>";
      h += section("Sources", src);
    }

    h += section("Related flags", relatedHTML(id));

    h += "</div></div>";
    app.innerHTML = h;
    wireRelated();
  }

  function codesLine(id, flag) {
    var bits = ["<strong>" + esc(id) + "</strong>"];
    var codes = flag.codes || {};
    if (codes.iso_3166_1_alpha3) bits.push(esc(codes.iso_3166_1_alpha3));
    if (codes.wikidata) bits.push('<a href="https://www.wikidata.org/wiki/' + esc(codes.wikidata) +
      '" target="_blank" rel="noopener">' + esc(codes.wikidata) + "</a>");
    return bits.join(" · ");
  }

  function featureItem(feat) {
    if (typeof feat === "string") return '<div class="feature-item"><span class="f-type">' + esc(prettify(feat)) + "</span></div>";
    var attrs = [];
    ["field", "cross", "saltire", "pall", "pile", "triangle", "chevron", "bend", "color", "count", "points", "rays", "position", "arrangement", "size", "direction"].forEach(function (k) {
      if (feat[k] !== undefined && feat[k] !== null) attrs.push(k + ": " + prettify(String(feat[k])));
    });
    if (feat.stripes) attrs.push(feat.stripes.map(prettify).join(", "));
    if (feat.fimbriation) {
      var fim = Array.isArray(feat.fimbriation) ? feat.fimbriation : [feat.fimbriation];
      var fcols = fim.map(function (x) { return x && x.color ? prettify(String(x.color)) : null; })
                     .filter(function (x) { return x; });
      if (fcols.length) attrs.push("fimbriation: " + fcols.join(", "));
    }
    var role = feat.role ? " (" + esc(feat.role) + ")" : "";
    return '<div class="feature-item"><span class="f-type">' + esc(prettify(feat.type || "?")) + "</span>" + role +
      (attrs.length ? '<div class="f-attrs">' + esc(attrs.join(" · ")) + "</div>" : "") +
      (feat.symbolism ? '<div class="f-sym">' + esc(feat.symbolism) + "</div>" : "") + "</div>";
  }

  /* --------------------------- related flags --------------------------- */
  // Relationships come from the data, not from the shape of the id. The one
  // thing the id still tells us is which entries describe the same entity:
  // everything before the first "_" is that entity key.
  function baseId(id) { return id.split("_")[0]; }

  var DATE_SEG = /^\d{4}(-\d{2})?(-\d{2})?$/;

  // A date-suffixed id carries one segment that is a bare ISO date: US_1959,
  // HU_1956-10, IS_state_1991 (which is variant-slugged too — the date wins,
  // so it lands under "Through time" rather than "Other roles").
  function isDated(id) {
    var segs = id.split("_");
    for (var i = 1; i < segs.length; i++) if (DATE_SEG.test(segs[i])) return true;
    return false;
  }

  var ALT_STATUS = { alternative: 1, proposed: 1, "de-facto": 1, reconstructed: 1 };

  // "In use today", reusing the time filter's own predicate so the detail page
  // and the /date/current gallery can never disagree.
  function isCurrent(f) { return matchesDate(f, "current"); }

  // "1844–1905" · "1906–" · "1918, 1991–1995"
  function yearRange(f) {
    if (!f.t || !f.t.length) return "";
    return f.t.map(function (s) {
      if (s[0] != null && s[0] === s[1]) return String(s[0]);
      return (s[0] == null ? "…" : s[0]) + "–" + (s[1] == null ? "" : s[1]);
    }).join(", ");
  }

  // Sort key for "Through time": earliest start. Undated entries sort last,
  // which is where the current flag belongs anyway.
  function firstYear(f) {
    if (!f.t || !f.t.length) return Infinity;
    return f.t.reduce(function (lo, s) {
      var y = s[0] == null ? -Infinity : s[0];
      return y < lo ? y : lo;
    }, Infinity);
  }

  // The FIAV role(s) this file fills, falling back to the filename's own
  // variant slugs when the entry makes no `variant` claim.
  function roleLabel(f) {
    if (f.variant && f.variant.length) return f.variant.map(prettify).join(", ");
    return f.id.split("_").slice(1)
      .filter(function (s) { return !DATE_SEG.test(s); })
      .map(prettify).join(", ");
  }

  function relatedCard(rid, label, hidden) {
    var f = BY_ID[rid];
    if (!f) return "";
    return '<a class="related-card" data-nav' +
      (hidden ? ' data-extra="1" style="display:none"' : "") +
      ' href="' + detailURL(rid) + '">' +
      '<div class="thumb"><img loading="lazy" alt="" src="' + svgURL(rid) + '"></div>' +
      '<div class="rl"><div class="rl-name">' + esc(f.name) + '</div>' +
      '<div class="rl-rel">' + esc(label || rid) + "</div></div></a>";
  }

  // A grid of cards, capped at `limit` with the rest rendered hidden behind an
  // in-place "show all". Returns "" for an empty list so callers can just drop
  // the block.
  function relCards(ids, labelFn, limit) {
    if (!ids.length) return "";
    var h = '<div class="related-grid">';
    ids.forEach(function (rid, i) {
      h += relatedCard(rid, labelFn ? labelFn(BY_ID[rid]) : "", i >= limit);
    });
    h += "</div>";
    if (ids.length > limit) {
      h += '<button type="button" class="rel-more">Show all ' + ids.length + "</button>";
    }
    return h;
  }

  // Containment lists lead with what still exists and tuck the defunct entries
  // behind a collapsed group — a Dutch province has far more former
  // municipalities than current ones.
  function relCardsSplit(ids, labelFn, limit) {
    var cur = [], former = [];
    ids.forEach(function (rid) { (isCurrent(BY_ID[rid]) ? cur : former).push(rid); });
    var h = relCards(cur, labelFn, limit);
    if (former.length) {
      h += '<button type="button" class="rel-toggle" data-count="' + former.length +
        '">Former (' + former.length + ")</button>" +
        '<div class="rel-former" hidden>' + relCards(former, labelFn, limit) + "</div>";
    }
    return h;
  }

  // Inverse-frequency weights for the similarity ranking, built once from the
  // index facets. A value half the corpus carries says almost nothing about
  // resemblance; `nordic-cross` or `hammer-and-sickle` says a great deal. The
  // old heuristic weighted every feature equally and then sorted by name, so a
  // flag whose dominant feature was `solid` got twelve alphabetical strangers.
  var WEIGHTS = null;
  function weightOf(kind, v) {
    if (!WEIGHTS) {
      WEIGHTS = { features: {}, colors: {} };
      ["features", "colors"].forEach(function (k) {
        (INDEX.facets[k] || []).forEach(function (pair) {
          WEIGHTS[k][pair[0]] = 1 / Math.log(2 + pair[1]);
        });
      });
    }
    var w = WEIGHTS[kind][v];
    return w === undefined ? 1 / Math.log(2) : w;
  }

  // Weighted Jaccard: shared weight over total weight, so a flag is not
  // "similar" merely by carrying many features.
  function weightedOverlap(kind, av, bv) {
    var mark = {}, inter = 0, union = 0, v;
    for (var i = 0; i < av.length; i++) mark[av[i]] = 1;
    for (var j = 0; j < bv.length; j++) mark[bv[j]] = mark[bv[j]] ? 2 : 3;
    for (v in mark) {
      var w = weightOf(kind, v);
      union += w;
      if (mark[v] === 2) inter += w;
    }
    return union ? inter / union : 0;
  }

  var SIMILARITY_FLOOR = 0.22;

  function rankBySimilarity(entry, used) {
    var af = entry.features || [], ac = entry.colors || [];
    if (!af.length) return [];
    var scored = [];
    INDEX.flags.forEach(function (f) {
      if (used[f.id]) return;
      var bf = f.features || [];
      var shares = bf.some(function (v) { return af.indexOf(v) >= 0; });
      if (!shares) return;
      var score = 0.7 * weightedOverlap("features", af, bf) +
                  0.3 * weightedOverlap("colors", ac, f.colors || []);
      if (entry.aspect_ratio && f.aspect_ratio === entry.aspect_ratio) score += 0.05;
      if (score < SIMILARITY_FLOOR) return;
      scored.push([score, f.id]);
    });
    scored.sort(function (a, b) { return b[0] - a[0] || (a[1] < b[1] ? -1 : 1); });
    return scored.map(function (x) { return x[1]; });
  }

  function relatedHTML(id) {
    var entry = BY_ID[id] || {};
    var base = baseId(id);
    var baseEntry = BY_ID[base] || {};
    var used = {}; used[id] = true;

    // Claim ids for a block: drops unknown ids and anything an earlier block
    // already showed, so every flag appears at most once on the page.
    function take(ids) {
      var out = [];
      (ids || []).forEach(function (x) {
        if (!BY_ID[x] || used[x]) return;
        used[x] = true;
        out.push(x);
      });
      return out;
    }
    function pick(pred) {
      return INDEX.flags.filter(pred).map(function (f) { return f.id; });
    }

    var blocks = [];
    function block(title, html) { if (html) blocks.push([title, html]); }

    // 1. Through time — this entity's flags across its history, oldest first.
    //    Only a real timeline: on a status-slugged page like GB-WLS_alternative
    //    the bare base entry is the *official* flag, not an earlier one, so it
    //    is left for Alternatives unless a dated entry is involved.
    var era = pick(function (f) {
      return baseId(f.id) === base && (isDated(f.id) || f.id === base);
    }).sort(function (a, b) { return firstYear(BY_ID[a]) - firstYear(BY_ID[b]); });
    if (isDated(id) || era.some(isDated)) {
      block("Through time", relCards(take(era), yearRange, 18));
    }

    // 2. Other roles — current flags of the same entity in a different official
    //    role (naval ensign, royal standard, …). Status-slugged files such as
    //    GB-WLS_alternative share the base id but are not a *role*, so they fall
    //    through to Alternatives below.
    var roles = take(pick(function (f) {
      return baseId(f.id) === base && f.id !== base && !isDated(f.id) &&
        isCurrent(f) && !ALT_STATUS[f.status];
    }));
    block("Other roles", relCards(roles, roleLabel, 18));

    // 3. Alternatives — parallel flags for the same subject. Matched on the
    //    shared Wikidata item as well as the id, since an alternative often
    //    lives under a slug of its own (GB-WLS-st-david ↔ GB-WLS, both Q25).
    var pageIsAlt = !!ALT_STATUS[entry.status];
    var alts = take(pick(function (f) {
      if (!((entry.wd && f.wd === entry.wd) || baseId(f.id) === base)) return false;
      return ALT_STATUS[f.status] ? true : (pageIsAlt && !f.status);
    }));
    block("Alternatives", relCards(alts, function (f) { return f.status || "official"; }, 18));

    // 4. Part of — the containment chain, read off `parent` rather than guessed
    //    from the id's hyphens.
    var chain = [], seenUp = {}, up = entry.parent || baseEntry.parent;
    while (up && BY_ID[up] && !seenUp[up]) {
      seenUp[up] = 1; chain.push(up); up = BY_ID[up].parent;
    }
    if (chain.length) {
      block("Part of", '<div class="rel-crumbs">' + chain.map(function (pid, i) {
        return (i ? '<span class="rel-sep">›</span>' : "") +
          '<a data-nav href="' + detailURL(pid) + '">' + esc(BY_ID[pid].name) + "</a>";
      }).join("") + "</div>");
    }

    // Succession is claimed here, ahead of the containment blocks below, even
    // though it renders after them: a merged municipality's successor is also
    // one of its ~150 siblings, and "succeeded by Dongen" is the fact worth
    // surfacing. Only one direction is authored in the data; the reverse maps
    // supply the other.
    var keys = id === base ? [base] : [id, base];
    function succession(field, reverse) {
      var out = [];
      keys.forEach(function (k) {
        ((BY_ID[k] || {})[field] || []).forEach(function (x) { out.push(x); });
        (reverse[k] || []).forEach(function (x) { out.push(x); });
      });
      return take(out);
    }
    var precededBy = succession("pred", PRECEDED_BY);
    var succeededBy = succession("succ", SUCCEEDED_BY);

    // 5. Contains — everything that names this entity as its parent.
    var kids = take(pick(function (f) { return f.parent === base && f.id !== id; }));
    block("Contains", relCardsSplit(kids, null, 18));

    // 6. Siblings — everything sharing this entity's parent.
    var myParent = entry.parent || baseEntry.parent;
    var sibs = myParent ? take(pick(function (f) {
      return f.parent === myParent && baseId(f.id) !== base;
    })) : [];
    block("Siblings", relCardsSplit(sibs, null, 12));

    block("Preceded by", relCards(precededBy, null, 18));
    block("Succeeded by", relCards(succeededBy, null, 18));

    // 8. Embedding, both directions.
    var appearsIn = (EMBEDDED_BY[id] || []).concat(id === base ? [] : (EMBEDDED_BY[base] || []));
    block("Appears in", relCards(take(appearsIn), null, 18));
    block("Contains the flag of", relCards(take(entry.embeds || []), null, 18));

    // 9. Same design — byte-identical SVGs, computed in the index. Unlike the
    //    blocks above this one does not skip what is already on the page: that
    //    Brcko District is a subdivision of Bosnia and that it flies a
    //    byte-identical flag are two different facts, and the second is the
    //    surprising one.
    var same = (entry.same || []).filter(function (x) { return BY_ID[x]; });
    same.forEach(function (x) { used[x] = true; });
    if (same.length) {
      block("Same design", '<p class="rel-note">This exact design also serves as:</p>' +
        relCards(same, null, 18));
    }

    // 10. Similar style — visual neighbours, over whatever nothing above claimed.
    var sim = take(rankBySimilarity(entry, used).slice(0, 12));
    block("Similar style", relCards(sim, null, 12));

    if (!blocks.length) return "<p>No related flags found.</p>";

    return blocks.map(function (b) {
      return '<div class="rel-block"><h3>' + esc(b[0]) + "</h3>" + b[1] + "</div>";
    }).join("");
  }

  function wireRelated() {
    app.querySelectorAll(".rel-more").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var grid = btn.previousElementSibling;
        if (grid) grid.querySelectorAll("[data-extra]").forEach(function (c) { c.style.display = ""; });
        btn.remove();
      });
    });
    app.querySelectorAll(".rel-toggle").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var box = btn.nextElementSibling;
        if (!box) return;
        box.hidden = !box.hidden;
        btn.textContent = (box.hidden ? "Former (" : "Hide former (") + btn.dataset.count + ")";
      });
    });
  }

  /* ------------------------------- about ------------------------------- */
  function renderAbout() {
    document.title = "About — Flag Browser";
    var f = INDEX.facets;
    var stats = [
      [INDEX.count, "flags"],
      [f.regions.length, "regions"],
      [f.types.length, "types"],
      [f.features.length, "features"],
      [f.colors.length, "colours"],
      [f.variants.length, "variants"],
      [f.proportion.length, "proportions"],
    ];
    var statsHTML = stats.map(function (s) {
      return '<div><dt>' + s[0].toLocaleString() + '</dt><dd>' + esc(s[1]) + '</dd></div>';
    }).join("");

    var REPO = "https://github.com/niemela/flags";
    var license = INDEX.license_md
      ? mdToHtml(INDEX.license_md)
      : '<p>See <a href="' + REPO + '/blob/master/LICENSE" target="_blank" rel="noopener">LICENSE</a> in the repository.</p>';

    var html = '<a class="detail-back" data-nav href="' + APP_ROOT + '">&larr; All flags</a>' +
      '<div class="about">' +
      '<h1>About</h1>' +
      '<p>Flag Browser is a curated dataset and viewer for flags of countries, ' +
      'subdivisions, cities, intergovernmental organizations, ethnic groups, and ' +
      'historical entities. Every entry carries structured metadata — colours, ' +
      'features, regions, variants, proportions, sources — so the dataset is ' +
      'browsable, filterable, and reusable.</p>' +
      '<h2>By the numbers</h2>' +
      '<dl class="about-stats">' + statsHTML + '</dl>' +
      '<h2>License</h2>' + license +
      '<h2>Contributing</h2>' +
      '<p>Found an error? Open an ' +
      '<a href="' + REPO + '/issues" target="_blank" rel="noopener">issue</a>' +
      ' or — even better — a ' +
      '<a href="' + REPO + '/pulls" target="_blank" rel="noopener">pull request</a>.</p>' +
      '</div>';
    app.innerHTML = html;
  }

  // Tiny Markdown renderer covering only the subset used in the synced
  // License section: paragraphs, unordered lists, **bold**, `code`, and
  // [text](url) links. External links open in a new tab.
  function mdToHtml(md) {
    function inline(s) {
      s = String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
      s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (_, text, url) {
        var ext = /^https?:/.test(url);
        var attrs = ext ? ' target="_blank" rel="noopener"' : "";
        return '<a href="' + url + '"' + attrs + '>' + text + '</a>';
      });
      return s;
    }
    return md.trim().split(/\n\s*\n/).map(function (block) {
      var lines = block.split("\n");
      if (lines.every(function (l) { return /^- /.test(l); })) {
        return "<ul>" + lines.map(function (l) {
          return "<li>" + inline(l.slice(2)) + "</li>";
        }).join("") + "</ul>";
      }
      return "<p>" + inline(block.replace(/\n/g, " ")) + "</p>";
    }).join("");
  }

  /* ------------------------------ helpers ------------------------------ */
  // Fingerprinted SVG URL: append the content hash from the index so the
  // browser can cache the file indefinitely yet refetch when it changes.
  function svgURL(id) {
    var e = BY_ID[id];
    var v = e && e.rev ? "?v=" + e.rev : "";
    return DATA + encodeURIComponent(id) + ".svg" + v;
  }

  function section(title, body) {
    return '<div class="section"><h2>' + esc(title) + "</h2>" + body + "</div>";
  }
  function tag(label, href) {
    return '<a class="tag" data-nav href="' + href + '">' + esc(label) + "</a>";
  }
  function stateWith(key, val) {
    var st = emptyState(new URLSearchParams(""));
    st[key].inc = [val];
    return st;
  }
  function prettify(s) {
    return String(s).replace(/[-_]/g, " ").replace(/\b\w/g, function (m) { return m; });
  }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
})();
