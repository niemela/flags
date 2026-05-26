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
    proportion: "proportion", proportions: "proportion", ratio: "proportion", ratios: "proportion"
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
  var renderLimit = 240;

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
    if (KEY_ALIASES[segs[0]]) return { view: "browse", state: parseFacetState(segs, params) };
    return { view: "detail", id: segs[0] };
  }

  // Each facet holds an include list and an exclude list. In the URL, values
  // within a facet are joined with "+", and an excluded value is marked with a
  // leading "!" (e.g. /colors/blue+grey+!red). We only ever split on "+", so
  // hyphenated names like greek-cross / light-blue are never mis-parsed.
  function emptyState(params) {
    return {
      colors: { inc: [], exc: [] }, features: { inc: [], exc: [] },
      regions: { inc: [], exc: [] }, types: { inc: [], exc: [] },
      variants: { inc: [], exc: [] }, proportion: { inc: [], exc: [] },
      q: (params.get("q") || "").trim()
    };
  }

  function parseFacetState(segs, params) {
    var st = emptyState(params);
    for (var i = 0; i < segs.length; i += 2) {
      var key = KEY_ALIASES[segs[i]];
      var val = segs[i + 1];
      if (!key || !val) continue;
      val.split("+").filter(Boolean).forEach(function (tok) {
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
      if (toks.length) parts.push(k, toks.join("+"));
    });
    var url = APP_ROOT + parts.join("/");
    if (st.q) url += "?q=" + encodeURIComponent(st.q);
    return url;
  }

  function detailURL(id) { return APP_ROOT + encodeURIComponent(id); }

  function navigate(href, replace) {
    if (replace) history.replaceState({}, "", href);
    else history.pushState({}, "", href);
    render();
    window.scrollTo(0, 0);
  }

  window.addEventListener("popstate", render);

  // Intercept internal link clicks for SPA navigation.
  document.addEventListener("click", function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest("a[data-nav]");
    if (!a) return;
    var href = a.getAttribute("href");
    if (!href) return;
    e.preventDefault();
    navigate(href);
  });

  document.querySelector(".brand").addEventListener("click", function (e) {
    e.preventDefault(); navigate(APP_ROOT);
  });
  document.getElementById("random-btn").addEventListener("click", function () {
    navigate(APP_ROOT + "random");
  });

  var searchTimer = null;
  searchInput.addEventListener("input", function () {
    clearTimeout(searchTimer);
    var val = searchInput.value;
    searchTimer = setTimeout(function () {
      var st = currentBrowseState();
      st.q = val.trim();
      navigate(browseURL(st), true);
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
      var f = INDEX.flags[Math.floor(Math.random() * INDEX.flags.length)];
      navigate(detailURL(f.id), true);
      return;
    }
    if (r.view === "detail") { renderDetail(r.id); return; }
    renderBrowse(r.state);
  }

  /* ------------------------------ browse ------------------------------- */
  function hasAny(list, vals) { return vals.some(function (v) { return list.indexOf(v) >= 0; }); }
  function hasAll(list, vals) { return vals.every(function (v) { return list.indexOf(v) >= 0; }); }

  function matches(f, st) {
    // Colours & features: include = must have ALL selected; exclude = must have none.
    var fc = f.colors || [];
    if (!hasAll(fc, st.colors.inc)) return false;
    if (hasAny(fc, st.colors.exc)) return false;

    var ff = f.features || [];
    if (!hasAll(ff, st.features.inc)) return false;
    if (hasAny(ff, st.features.exc)) return false;

    // Region / type / variant: include = must match at least one (these are
    // lists where a flag legitimately carries several); exclude = match none.
    var fr = f.region || [];
    if (st.regions.inc.length && !hasAny(fr, st.regions.inc)) return false;
    if (hasAny(fr, st.regions.exc)) return false;

    var ft = f.type || [];
    if (st.types.inc.length && !hasAny(ft, st.types.inc)) return false;
    if (hasAny(ft, st.types.exc)) return false;

    var fv = f.variant || [];
    if (st.variants.inc.length && !hasAny(fv, st.variants.inc)) return false;
    if (hasAny(fv, st.variants.exc)) return false;

    // Proportion is a single value per flag; multiple selected values mean OR.
    var fp = f.aspect_ratio ? [f.aspect_ratio] : [];
    if (st.proportion.inc.length && !hasAny(fp, st.proportion.inc)) return false;
    if (hasAny(fp, st.proportion.exc)) return false;

    if (st.q) {
      var q = st.q.toLowerCase();
      if ((f.name || "").toLowerCase().indexOf(q) < 0 && (f.id || "").toLowerCase().indexOf(q) < 0) return false;
    }
    return true;
  }

  function renderBrowse(st) {
    document.title = "Flag Browser";
    if (searchInput.value !== st.q) searchInput.value = st.q;

    var results = INDEX.flags.filter(function (f) { return matches(f, st); });

    var html = '<div class="browse">';
    html += renderFilters(st);
    html += '<div class="results">';
    html += renderResultsBar(st, results.length);
    if (results.length === 0) {
      html += '<p class="empty">No flags match these filters.</p>';
    } else {
      var shown = results.slice(0, renderLimit);
      html += '<div class="grid">' + shown.map(card).join("") + "</div>";
      if (results.length > renderLimit) {
        html += '<button class="load-more" id="load-more">Show more (' +
          (results.length - renderLimit) + " remaining)</button>";
      }
    }
    html += "</div></div>";
    app.innerHTML = html;

    wireFilters(st);
    var lm = document.getElementById("load-more");
    if (lm) lm.addEventListener("click", function () { renderLimit += 240; renderBrowse(st); });
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
    limit = limit || facet.length;
    var h = '<div class="filter-group" data-group="' + key + '"><h3>' + title + "</h3>";
    h += extra || "";
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

  function facetPill(k, v, neg) {
    return '<span class="facet-pill' + (neg ? " neg" : "") + '">' + (neg ? "not " : "") + esc(prettify(v)) +
      '<button type="button" data-remove="' + k + '" data-val="' + esc(v) + '" title="Remove">&times;</button></span>';
  }

  function renderResultsBar(st, count) {
    var h = '<div class="results-bar"><span class="results-count">' +
      count + " flag" + (count === 1 ? "" : "s") + "</span>";
    var pills = "";
    FACET_KEYS.forEach(function (k) {
      st[k].inc.forEach(function (v) { pills += facetPill(k, v, false); });
      st[k].exc.forEach(function (v) { pills += facetPill(k, v, true); });
    });
    if (st.q) pills += '<span class="facet-pill">“' + esc(st.q) + '”<button type="button" data-clearq="1">&times;</button></span>';
    if (pills) h += '<div class="active-facets">' + pills + "</div>";
    if (pills) h += '<button class="clear-all" id="clear-all">Clear all</button>';
    h += "</div>";
    return h;
  }

  function wireFilters(st) {
    app.querySelectorAll(".chip[data-facet]").forEach(function (chip) {
      chip.addEventListener("click", function () {
        cycleFacet(st, chip.dataset.facet, chip.dataset.val);
      });
    });
    app.querySelectorAll("[data-more]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var key = btn.dataset.more;
        app.querySelectorAll('.filter-group[data-group="' + key + '"] .chip[data-extra]')
          .forEach(function (c) { c.style.display = ""; });
        btn.remove();
      });
    });
    app.querySelectorAll("[data-remove]").forEach(function (btn) {
      btn.addEventListener("click", function () { removeFacet(st, btn.dataset.remove, btn.dataset.val); });
    });
    var clearAll = document.getElementById("clear-all");
    if (clearAll) clearAll.addEventListener("click", function () { navigate(APP_ROOT); });
    var clearQ = app.querySelector("[data-clearq]");
    if (clearQ) clearQ.addEventListener("click", function () {
      var ns = cloneState(st); ns.q = ""; navigate(browseURL(ns));
    });
  }

  // Cycle a value through the three states: none -> include -> exclude -> none.
  function cycleFacet(st, key, val) {
    var ns = cloneState(st), f = ns[key];
    var i = f.inc.indexOf(val), j = f.exc.indexOf(val);
    if (i < 0 && j < 0) f.inc.push(val);                       // none -> include
    else if (i >= 0) { f.inc.splice(i, 1); f.exc.push(val); }  // include -> exclude
    else f.exc.splice(j, 1);                                   // exclude -> none
    renderLimit = 240;
    navigate(browseURL(ns));
  }

  // Remove a value entirely (used by the result-bar pills).
  function removeFacet(st, key, val) {
    var ns = cloneState(st), f = ns[key];
    var i = f.inc.indexOf(val); if (i >= 0) f.inc.splice(i, 1);
    var j = f.exc.indexOf(val); if (j >= 0) f.exc.splice(j, 1);
    renderLimit = 240;
    navigate(browseURL(ns));
  }

  function cloneState(st) {
    function c(f) { return { inc: f.inc.slice(), exc: f.exc.slice() }; }
    return {
      colors: c(st.colors), features: c(st.features),
      regions: c(st.regions), types: c(st.types),
      variants: c(st.variants), proportion: c(st.proportion),
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
    ["field", "cross", "color", "count", "points", "rays", "position", "arrangement", "size", "direction"].forEach(function (k) {
      if (feat[k] !== undefined && feat[k] !== null) attrs.push(k + ": " + prettify(String(feat[k])));
    });
    if (feat.stripes) attrs.push(feat.stripes.map(prettify).join(", "));
    var role = feat.role ? " (" + esc(feat.role) + ")" : "";
    return '<div class="feature-item"><span class="f-type">' + esc(prettify(feat.type || "?")) + "</span>" + role +
      (attrs.length ? '<div class="f-attrs">' + esc(attrs.join(" · ")) + "</div>" : "") +
      (feat.symbolism ? '<div class="f-sym">' + esc(feat.symbolism) + "</div>" : "") + "</div>";
  }

  /* --------------------------- related flags --------------------------- */
  function baseId(id) { return id.split("_")[0]; }
  function hierParts(id) { return baseId(id).split("-"); }

  function relatedHTML(id) {
    var entry = BY_ID[id] || {};
    var blocks = [];
    var used = {}; used[id] = true;

    function take(list) {
      return list.filter(function (x) { return BY_ID[x] && !used[x]; })
        .map(function (x) { used[x] = true; return x; });
    }

    // Variants of the same base id (e.g. SE, SE_1905, SE_naval)
    var variants = take(INDEX.flags.filter(function (f) {
      return baseId(f.id) === baseId(id) && f.id !== id;
    }).map(function (f) { return f.id; }));
    if (variants.length) blocks.push(["Variants", variants]);

    // Parent
    var parts = hierParts(id);
    if (parts.length > 1) {
      var parent = take([parts.slice(0, -1).join("-")]);
      if (parent.length) blocks.push(["Part of", parent]);
    }

    // Children (one level down, base ids only)
    var kids = take(INDEX.flags.filter(function (f) {
      var p = hierParts(f.id);
      return f.id === baseId(f.id) && p.length === parts.length + 1 &&
        p.slice(0, parts.length).join("-") === parts.join("-");
    }).map(function (f) { return f.id; }));
    if (kids.length) blocks.push([parts.length === 1 ? "Subdivisions" : "Sub-flags", kids.slice(0, 18)]);

    // Siblings
    if (parts.length > 1) {
      var parentKey = parts.slice(0, -1).join("-");
      var sibs = take(INDEX.flags.filter(function (f) {
        var p = hierParts(f.id);
        return f.id === baseId(f.id) && p.length === parts.length &&
          p.slice(0, -1).join("-") === parentKey;
      }).map(function (f) { return f.id; }));
      if (sibs.length) blocks.push(["Sibling flags", sibs.slice(0, 12)]);
    }

    // Embedded references both directions
    var embedRel = take((entry.embeds || []).concat(EMBEDDED_BY[id] || []));
    if (embedRel.length) blocks.push(["Linked flags", embedRel.slice(0, 12)]);

    // Similar: same dominant feature + shared colour
    var dom = (entry.features || [])[0];
    if (dom) {
      var sim = take(INDEX.flags.filter(function (f) {
        if ((f.features || [])[0] !== dom) return false;
        return (entry.colors || []).some(function (c) { return (f.colors || []).indexOf(c) >= 0; });
      }).map(function (f) { return f.id; }));
      if (sim.length) blocks.push(["Similar style", sim.slice(0, 12)]);
    }

    if (!blocks.length) return "<p>No related flags found.</p>";

    return blocks.map(function (b) {
      return '<div class="rel-block"><h3>' + esc(b[0]) + '</h3><div class="related-grid">' +
        b[1].map(relatedCard).join("") + "</div></div>";
    }).join("");
  }

  function relatedCard(rid) {
    var f = BY_ID[rid];
    return '<a class="related-card" data-nav href="' + detailURL(rid) + '">' +
      '<div class="thumb"><img loading="lazy" alt="" src="' + svgURL(rid) + '"></div>' +
      '<div class="rl"><div class="rl-name">' + esc(f.name) + '</div><div class="rl-rel">' + esc(rid) + "</div></div></a>";
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
