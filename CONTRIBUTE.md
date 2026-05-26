# Contributing

Thanks for adding to the corpus. The [README](README.md) defines the data schema and filename rules; this doc covers the *process* of contributing — sourcing flags, looking up codes, and avoiding the mistakes that keep biting us.

## Filing issues

You don't have to open a pull request to help. Opening an **issue** on the [project's issue tracker](https://github.com/niemela/flags/issues) is a valuable contribution in its own right:

- **Data requests** — a flag that's missing, a flag with the wrong or low-quality SVG, an incorrect code/parent/region, or a historical variant we should add. Include the entity, the expected `<id>`, and a source (Wikimedia Commons link, Wikipedia article, official decree) where you can.
- **Feature requests** — improvements to the schema, the browser app, or the tooling. Describe the use case, not just the solution.
- **Corrections** — anything in the data or docs that looks wrong. A precise pointer (file, field, what's wrong, what it should be) is enough; we can do the edit.

Good issues are specific and sourced. If you've already found the corrected value or a properly-licensed SVG, link it — that often turns a request straight into a quick fix.

## Workflow

- One concern per PR. Renames go in their own commit before any content edits — the diff stays readable and `git log --follow` keeps working.
- Write short imperative commit summaries, matching the existing history (e.g. "Add 247 ISO 3166-2 subdivision flags", "Rename PL-PM to PL-22").
- Before pushing, run `python3 tools/validate.py` (schema, enums, filename, color-consistency) and rebuild/check the index: `python3 tools/build_index.py --check`. The aggregator `data/flags.json` is rebuilt by CI; don't commit it.

## Sourcing SVGs

- Primary source: [Wikimedia Commons](https://commons.wikimedia.org/wiki/Category:National_flags). Verify the license is Public Domain or CC-BY-SA before downloading; record the source in the JSON's `sources` array.
- Prefer files with a sensible `viewBox`, no embedded raster images, and reasonable file size (most national flags fit in <20 KB; coats of arms can reach ~200 KB).
- Run [SVGO](https://github.com/svg/svgo) with default settings on anything over ~10 KB. Don't strip the XML declaration if it has one.

## Looking up identifiers

**ISO 3166-2 codes.** Don't guess. Use the official ISO browsing platform or the per-country Wikipedia tables (`ISO 3166-2:<country>`). Common traps:

- Codes change. The 2020 Norwegian county reform retired NO-02, NO-20, etc. — when an ISO standard changes, the *new* code applies to current files and the old code lives on with a date suffix.
- "Berkshire" is not `GB-WBK` — `GB-WBK` is *West* Berkshire, a different entity. If the filename's intended entity doesn't match the ISO code, omit `iso_3166_2` rather than fake it.
- Don't invent nested codes. `GB-SCT-ABE` is not an ISO code — Aberdeen City is `GB-ABE`, full stop. Three-segment basenames are reserved for the city-slug convention (`GB-SCT-edinburgh`).

**Wikidata Q.** Look up each entity individually — *never copy a Q from a sibling file*. We had 60+ wrong Qs from exactly that pattern. Verify by opening `wikidata.org/wiki/Q<n>` and confirming the entity description matches.

## Naming, when it's not obvious

```
Does the entity have an ISO 3166-1 (country) code?
├─ Yes → use it as <id>; optionally add ISO 3166-2 if dual-coded (AX, VI).
└─ No → Does it have an ISO 3166-2 (subdivision) code?
        ├─ Yes → use it as <id>.
        └─ No → Is there an ISO-coded parent?
                ├─ Yes → <parent-iso>-<lowercase-slug>  (e.g., SE-AB-stockholm)
                └─ No  → <lowercase-slug>                (e.g., nato, sealand)

Multiple flags for the same entity → append _<segment>:
  _<variant>   civil, state, naval, civil-ensign, royal, …
  _<status>    proposed, de-facto, alternative           (only if needed to disambiguate)
  _<date>      end-year of validity (SE_1905, US_1959)
  _<extra>     free-form slug for further disambiguation (US_proposed-pahonia)
```

## Common pitfalls

- ASCII hyphens only in filenames — no en-dashes (`–`) or em-dashes (`—`). The date `1959-1986` is one ASCII hyphen.
- Historical-flag suffix is the *end year* the design stopped being current, not the full lifespan. `SE_1905`, not `SE_1844-1905`.
- The city-style `parent` field is the immediate ISO 3166-2 parent (`IT-FI-florence` → `parent: IT-FI`), not the broader region (`IT-52`).
- `region` values come from the closed enum in the README — `Central Europe` and `Southeastern Europe` are not valid M49 sub-regions.
- `aspect_ratio` is `height:width` and almost always integer:integer. The two irrational national ratios are written symbolically, not approximated: Togo's golden ratio is `1:phi`, and Nepal (the only flag taller than wide) is `~1.219:1` — larger number first, preserving the `height:width` order.

## PR review checklist

Copy this into the PR description:

```
- [ ] JSON and SVG present with matching basenames
- [ ] `id` field equals the filename basename
- [ ] `codes.iso_3166_2` (if present) matches the filename or this entity is dual-coded
- [ ] `parent` (if present) points at an existing or known entity
- [ ] `region` values all appear in the README enum
- [ ] `colors` values all appear in the 15-value enum
- [ ] `aspect_ratio` is integer:integer
- [ ] `sources` cites at least one authoritative URL
- [ ] SVG is licensed PD or CC-BY-SA and the source is recorded
- [ ] Wikidata Q opened and verified to describe this entity
```

## License

See [LICENSE](LICENSE). In short: metadata and the database as a whole are **CC BY-SA 4.0**, code and tooling are **MIT**, and the flag SVGs retain their original (mostly Wikimedia) licenses recorded in each flag's `sources`. By contributing metadata you agree to release it under CC BY-SA 4.0; only contribute SVGs that are Public Domain or CC BY-SA, and record the source.
