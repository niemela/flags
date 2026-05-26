# Flags Repository

A collection of flag SVGs and structured metadata for countries, subdivisions, cities, organizations, and historical entities.

## Repository structure

Each flag is represented by two files with matching basenames in `data/`:

- `data/{id}.svg` — the flag image in SVG format
- `data/{id}.json` — structured metadata about the flag

A `data/flags.json` aggregator file collects all per-flag metadata into a single index for fast querying. It is built from the individual JSON files by tooling; do not edit it by hand.

## Filename conventions

Filenames follow the pattern:

```
<id>[_<variant>][_<status>][_<date>][_<extra>].{svg,json}
```

The `<id>` segment is required. The four optional segments appear in the order shown when present, and are drawn from closed enums (except `<extra>`, which is free-form). **Each optional segment is included only when it distinguishes this file from the canonical default — omit segments that would carry no distinguishing information.** A flag's SVG and JSON files always share the same basename.

Examples:

- `SE.svg` has no optional segments — it's the canonical, current, de-jure flag of Sweden.
- `SE_naval.svg` has only the variant segment — still current and de-jure, but a different official role.
- `US_1960.svg` has only the date segment — a historical version of the US flag (the 49-star design).
- `XX_proposed-pahonia.svg` (hypothetical) uses status and extra — `proposed` distinguishes from current/historical flags, `pahonia` names this specific design among other proposals.

In our current data, the `status` slug rarely appears in filenames: most de-facto, alternative, or proposed flags are the *only* flag for their entity, so the status only lives in the JSON. The slug appears only when needed to distinguish multiple flags for the same entity.

### Identifier (id)

The `<id>` follows ISO standards where they exist, with specific fallback rules:

1. **[ISO 3166-1](https://en.wikipedia.org/wiki/ISO_3166-1) alpha-2** (uppercase) for countries and exceptional reservations.
2. **[ISO 3166-2](https://en.wikipedia.org/wiki/ISO_3166-2)** (uppercase) for country subdivisions.
3. **[ISO 3166-3](https://en.wikipedia.org/wiki/ISO_3166-3)** (uppercase) for formerly assigned country codes.
4. Slug-based names (see below) when no ISO code applies.

Examples:

- `SE` — Sweden (ISO 3166-1)
- `EU` — European Union (ISO 3166-1 exceptional reservation)
- `US-TX` — Texas (ISO 3166-2)
- `SUHH` — Soviet Union (ISO 3166-3)
- `sapmi` - Sápmi (no ISO code applies)

#### When no ISO code applies to the entity itself

Two patterns are valid, in order of preference:

- **`<ancestor-iso>-<slug>`** — the most specific ISO-coded ancestor + a slug. The ancestor is typically a subdivision (`US-IL-springfield`, `BR-RJ-rio-de-janeiro`, `JP-27-osaka`).
- **`<slug>`** — when no ISO-coded ancestor applies at all (transnational organizations, pan-ethnic flags).

Examples:

- `US-IL-springfield` — Springfield, Illinois (parent: US-IL)
- `BR-RJ-rio-de-janeiro` — Rio de Janeiro (parent: BR-RJ)
- `JP-27-osaka` — the city of Osaka (parent: JP-27, Osaka Prefecture)
- `US-TX-dallas-county` — Dallas County (a county; tagged `type: ["subdivision"]`)
- `NG-lagos` — Lagos (parent: NG; the subdivision NG-LA exists but is not in the data set)
- `nato`  — NATO (organization, no ISO-coded ancestor)
- `sapmi` — Sápmi people (ethnic, no ISO-coded ancestor)

When the entity itself has its own ISO code, use that code directly with no slug. Reykjavík is the municipality `IS-RKV`; Mexico City is the federal entity `MX-CMX`. No slug needed — the entity *is* the ISO-coded thing.

Pick the most natural composite key. If two entities collide under the simpler form, fall back to a more specific ancestor for both. The composition in the filename is for uniqueness only; the authoritative parent relationship lives in the JSON's `parent` field. If an entity's parent changes administratively, rename the file accordingly.

The same pattern applies to counties and other sub-subdivisions, tagged in JSON as `type: ["subdivision"]` with their parent in `parent`.

#### Slug rules

When constructing a slug from a name:

- **Diacritics:** strip to ASCII (`sao-paulo`, not `são-paulo`).
- **Multi-word names:** hyphenate (`rio-de-janeiro`, `los-angeles`).
- **Apostrophes / punctuation:** drop (`san-jose`, not `san-josé`).
- **Abbreviated honorifics:** expand (`saint-paul`, not `st-paul`; `mount-vernon`, not `mt-vernon`).
- **Non-Latin scripts:** use the most common Latin transliteration (`tokyo`, not `東京`).

### Variant

When an entity has multiple flags filling different official roles, each non-default file gets a variant slug:

```
state           state flag (when distinct from civil)
war             war flag (armed-forces use on land)
civil-ensign    civil / merchant marine ensign
state-ensign    state ship ensign (non-military government)
naval           naval ensign / war ensign (warships)
jack            naval jack (bow flag of a warship)
royal           royal / monarch's standard
presidential    presidential standard
government      generic government / service flag (when no narrower slug fits)
```

Examples:

- `SE.svg` — the flag of Sweden (fills `civil`, `state`, `civil-ensign`, `state-ensign`)
- `SE_naval.svg` — the swallow-tailed *tretungad* (fills `war`, `naval-ensign`)
- `GB.svg` — the flag of the United Kingdom (Union Jack)
- `GB_civil-ensign.svg` — Red Ensign
- `GB_state-ensign.svg` — Blue Ensign
- `GB_naval.svg` — White Ensign

When a flag covers multiple FIAV roles (Sweden's *tretungad* fills both `war` and `naval-ensign`; UK's White Ensign fills `naval-ensign` and historically `war`), use the slug that vexillological sources most commonly apply to the flag. For the tretungad that's `naval` — Wikimedia's filename is `Naval_Ensign_of_Sweden.svg` and FOTW indexes it under "naval ensign." When in doubt, prefer the more specific maritime slug (`naval`, `civil-ensign`, `state-ensign`, `jack`) over the generic land-use slugs (`state`, `war`). The JSON's `variant` array carries the precise multi-value [FIAV grid](https://en.wikipedia.org/wiki/Vexillological_symbol) claim — the slug is just a human-readable handle.

### Status

When a flag is not officially adopted (de jure), append a status slug:

```
proposed        designed but never officially adopted
de-facto        used in practice but not officially recognized
alternative     widely-used parallel flag (officially tolerated)
reconstructed   inferred from incomplete historical records
```

Inclusion bar: include `proposed` flags only when notable (a Wikipedia article exists, was a serious finalist in a redesign process, etc.). Don't admit ad-hoc designs.

### Date

When an entity has multiple historical flags differing only by time period, append a date suffix matching the **end** of the flag's most recent period of use, in [ISO 8601](https://en.wikipedia.org/wiki/ISO_8601) with the **minimum precision needed** to make the filename unique within the entity. The current flag has **no** date suffix.

```
US.svg              current 50-star flag (1960–present)
US_1960.svg         49-star flag (1959–1960)
US_1959.svg         48-star flag (1912–1959)
US_1912.svg         46-star flag (1908–1912)
```

Year alone is sufficient when no two flags ended in the same year. Expand precision only as needed:

- One flag ending in 1995 → `XX_1995.svg`
- Two flags ending in different months of 1995 → `XX_1995-11.svg`, `XX_1995-12.svg`
- Two flags ending in the same month → `XX_1995-11-11.svg`, `XX_1995-11-25.svg`

#### Discontiguous periods

When the same flag design was used over multiple non-contiguous periods (e.g., Belarus 1918, then again 1991–1995), use the **most recent** end date in the filename. All periods are documented in the JSON's `periods` array.

#### Fuzzy historical dates

The JSON's `periods` field accepts full EDTF ([ISO 8601-2:2019](https://en.wikipedia.org/wiki/ISO_8601#Extensions)) for approximate or uncertain dates (`1840~`, `184X`, `..`). EDTF markers do **not** appear in filenames — pick a representative year for the filename and put the precise EDTF in the metadata.

### Extra

Free-form lowercase-with-hyphens trailing slug, used **only** when no other axis (variant, status, date) produces uniqueness. Use sparingly.

### Two-sided flags

When a flag's reverse side differs from the obverse (Paraguay is the canonical case), treat each side as a separate file:

- `PY.svg` — obverse (default)
- `PY_reverse.svg` — reverse

The naming convention itself encodes the relationship — given `XX`, the reverse is at `XX_reverse`. Both JSONs set `"twosided": true` to indicate that the flag has distinct sides. The vexillological symbol for this property is the [two-sided indicator](https://en.wikipedia.org/wiki/File:FIAV_twosided.svg).

## JSON schema

Each flag JSON contains the fields below. All optional fields may be omitted when their default applies.

### Full example

```json
{
  "id": "SE",
  "name": "Sweden",
  "type": ["country"],
  "parent": null,

  "codes": {
    "iso_3166_1_alpha2": "SE",
    "iso_3166_1_alpha3": "SWE",
    "fifa": "SWE",
    "ioc": "SWE",
    "wikidata": "Q34"
  },

  "region": ["Europe", "Northern Europe", "Nordics", "Scandinavia", "European Union"],

  "shape": "rectangular",
  "aspect_ratio": "5:8",

  "features": [
    {
      "type": "nordic-cross",
      "field": "blue",
      "cross": "yellow",
      "symbolism": "Christian heritage; affinity with the other Nordic nations"
    }
  ],

  "colors": [
    { "color": "blue",   "symbolism": "loyalty, truth, and justice" },
    { "color": "yellow", "symbolism": "generosity and strength" }
  ],

  "symbolism": null,

  "description": "Blue field with a yellow Nordic cross; the vertical arm is shifted toward the hoist.",

  "history": "Adopted in its current proportions in 1906; the blue-and-yellow scheme is documented from at least 1275, derived from the royal coat of arms.",

  "variant": ["civil", "state", "civil-ensign", "state-ensign"],

  "periods": [{ "start": "1906" }],

  "sources": ["https://en.wikipedia.org/wiki/Flag_of_Sweden"]
}
```

### Field reference

#### `id` *(string, required)*

Unique identifier matching the filename basename. Authoritative key for cross-references from `parent` and `embedded_flag_id`.

#### `name` *(string, required)*

Human-readable display name. The format is the entity's common name, optionally followed by a parenthesized qualifier when needed for context or disambiguation:

- `"Sweden"` (country — no qualifier needed)
- `"Texas (United States)"` (subdivision — country in parens)
- `"Stockholm (Sweden)"` (city — country in parens)
- `"Springfield (Illinois, United States)"` (city — state added because the city name is non-unique)
- `"Argentina (1829–1835)"` (historical — period in parens)
- `"Belarus (1918, 1991–1995)"` (historical with discontiguous periods)
- `"NATO"` (organization — no qualifier needed)

What goes inside the parentheses, in priority order:

- **Parent** — the country (or higher-level container) when the entity is part of one.
- **Period** — the years/dates when the flag is not the current one.
- **Status** — when not de-jure (e.g., `(de facto)`, `(proposed)`).
- **Variant** — only if needed to distinguish from other variants.
- **Anything else** — only when needed to make the name unique.

Combine multiple qualifiers with commas inside a single parens (`(Illinois, United States)`).

#### `type` *(array of strings, required)*

One or more of:

```
country             sovereign nations
subdivision         states, provinces, regions, counties
city                municipal flags
intergovernmental   organizations with sovereign-state members (UN, EU, NATO)
organization        other organizations (Olympic Committee, etc.)
ethnic              flags representing ethnic groups or peoples
historical          defunct entities (e.g. SUHH for the USSR)
```

Order: most-specific first (`["historical", "country"]`, not `["country", "historical"]`).

`historical` in `type` means the *entity itself* is defunct. A historical *flag* of a current entity (e.g., Sweden's 1844–1905 flag) is captured by the `periods` field and the filename's date suffix, not by `type`.

#### `parent` *(string or null, default `null`)*

The `id` of the parent entity, or `null` for top-level entities. The relationship is strict administrative containment — `parent` answers "what is this entity *part of*?" Examples:

- Texas: `"parent": "US"`
- Stockholm: `"parent": "SE-AB"`
- Dallas County: `"parent": "US-TX"`

Memberships in intergovernmental organizations (Sweden's membership in the UN, NATO, EU) are *not* parent relationships — Sweden is not administratively part of NATO. Such memberships, when relevant, are captured via the `region` array (e.g., the `European Union` tag).

#### `codes` *(object, default `{}`)*

Map of code-system → code value. The complete enumeration of recognized keys is below. No entity will have all of them (some pairs are mutually exclusive — ISO 3166-1 vs. 3166-2 vs. 3166-3 — and most non-state entities have only `wikidata`). Populate every key that applies; omit the rest.

```
iso_3166_1_alpha2   ISO 3166-1 alpha-2     "SE"
iso_3166_1_alpha3   ISO 3166-1 alpha-3     "SWE"
iso_3166_2          ISO 3166-2             "US-TX"
iso_3166_3          ISO 3166-3             "SUHH"
fifa                FIFA country code      "SWE"
ioc                 IOC country code       "SWE"
wikidata            Wikidata Q-identifier  "Q34"
```

#### `region` *(array of strings, default `[]`)*

Tags drawn from a closed taxonomy of geographic and cultural / political regions. Apply all that fit. See [Controlled vocabularies → Region](#region-1) below.

#### `shape` *(string, default `"rectangular"`)*

The overall shape of the flag:

```
rectangular     default; covers both oblong rectangles and squares
swallowtail     Ohio, several naval ensigns
double-pennant  Nepal (only national flag)
pennant         single-tailed
burgee          yacht-club / sports-team style
```

Square flags (Switzerland, Vatican) use `shape: "rectangular"` with `aspect_ratio: "1:1"` rather than a separate `square` value.

#### `aspect_ratio` *(string, optional)*

Aspect ratio in the vexillological convention `height:width` (also called "proportion"). Common values: `"1:2"` (UK), `"2:3"` (most flags), `"3:5"` (Germany), `"5:8"` (Sweden), `"10:19"` (US), `"1:1"` (Switzerland, Vatican). Omit if unknown.

Values are normally integer:integer. The two national flags with irrational proportions are written symbolically rather than approximated: Togo's golden ratio is `"1:phi"`, and Nepal — the only flag taller than wide — is `"~1.219:1"` (height ≈ 1.21901033 × width; the leading `~` marks the rounded irrational). Both keep the `height:width` order, so Nepal's larger number comes first.

#### `features` *(array of objects, required, non-empty)*

The visual elements that compose the flag — both layout and devices. See [Features](#features-1) below for the full attribute reference and type enum.

#### `colors` *(array of objects, required)*

The flag's color palette as an ordered array, by visual prominence. Each entry:

```json
{ "color": "blue", "symbolism": "loyalty, truth, and justice" }
```

The `symbolism` field is optional. The `color` value must come from the closed [color enum](#colors-1).

Consistency requirement: every color used in any `features` entry (as `color`, `field`, `cross`, etc.) must appear in this list. `tools/validate.py` enforces this (see [Tooling](#tooling)). The converse is *not* required — a pictorial device such as a coat of arms, seal, or animal charge legitimately carries colors that are catalogued here without being broken out feature by feature, so a declared color need not be referenced by any feature.

#### `symbolism` *(string or null, default `null`)*

Top-level overall symbolism — used when the meaning of the flag is genuinely combinatorial and cannot be decomposed into per-element meanings. Most flags have `null` here; meaning is captured inline on individual `features` and on `colors`.

The South African flag is the canonical case for non-null `symbolism`: the official meaning is the convergence implied by the pall, with no symbolism attached to individual colors.

#### `description` *(string, required)*

One or two sentences of plain visual description.

#### `history` *(string, optional)*

Narrative facts about the flag's adoption, evolution, designer, predecessor flags, and legal status. Distinct from `symbolism` — *history* is when and how, *symbolism* is what it means.

#### `variant` *(array of strings, optional)*

The flag's [FIAV](https://en.wikipedia.org/wiki/Vexillological_symbol) role(s). Closed enum:

```
civil               civilian use on land
state               government use on land
war                 armed-forces use on land
civil-ensign        merchant ship ensign
state-ensign        government ship ensign
naval-ensign        warship ensign
royal-standard      monarch's personal flag
presidential-standard
jack                bow flag of a warship
government          ministerial / departmental flag
```

Omitting the field means "no FIAV claim made." Populate when known. Multiple values are common — Sweden's unsuffixed `SE.svg` is `["civil", "state", "civil-ensign", "state-ensign"]` (FIAV 110110).

The most common pattern for a national civil flag is `["civil", "state", "civil-ensign", "state-ensign"]`; fewer than 20% of national flags also serve as their own war/naval ensign (most countries have a separate flag for those roles).

#### `status` *(string, default `"de-jure"`)*

```
de-jure         officially adopted (default)
de-facto        used in practice without official adoption
proposed        designed but never officially adopted
alternative     parallel flag in widespread use
reconstructed   inferred from incomplete historical records
```

#### `periods` *(array of objects, optional)*

When the flag was or is in use. Each entry:

```json
{ "start": "1906" }
```

`start` and `end` are EDTF strings ([ISO 8601-2:2019](https://en.wikipedia.org/wiki/ISO_8601#Extensions)). Omit `end` entirely for "ongoing/current."

EDTF examples:

```
"1906"          exact year
"1906-06"       June 1906
"1906-06-22"    22 June 1906
"1840~"         circa 1840
"1840?"         uncertain (possibly 1840)
"184X"          some year in 1840–1849
"18XX"          some year in 1800–1899
".."            entirely unknown
```

For flags used in multiple discontiguous periods (the same design adopted, dropped, then re-adopted), list each as a separate entry:

```json
"periods": [
  { "start": "1918", "end": "1918" },
  { "start": "1991", "end": "1995" }
]
```

#### `sources` *(array of strings, optional)*

URLs documenting this flag — Wikipedia articles, government decrees, vexillological references.

#### `twosided` *(boolean, default `false`)*

Set to `true` on both files of a two-sided flag (where the obverse and reverse differ — Paraguay is the canonical case). The companion file is found via the naming convention: given `XX`, the reverse is `XX_reverse`. See [Two-sided flags](#two-sided-flags) under filename conventions.

## Features

The `features` array describes the visual elements of the flag — both the underlying field layout and any devices placed on it. There is no fundamental distinction between "structure" and "charge" in this schema: a cross can fill the entire field or sit as a small device on it; a saltire can be the whole flag or a tiny charge in a stripe; a pile can span the flag or be a placed wedge. The `type` plus its sizing and positioning attributes determine the role.

### Composition rules

- **`features` is required and non-empty.** Even a plain solid-color flag has one feature (the solid field).
- **Order is significant: earlier features are below later ones in z-order.** A flag with stripes plus a centered coat-of-arms lists the stripes first, the arms second.
- **The first feature is conventionally the dominant / underlying field element** — used for queries that need to identify a primary structure. Most flags' first feature is one of `solid`, `horizontal-stripes`, `vertical-stripes`, a cross, a saltire, etc.
- **Composition order matches visual stacking.** Per-bend two-color split + central charge → list the per-bend feature first, the charge second.

### Per-feature attributes

```
type           required        from the closed feature-type enum (below)
color          optional        from the color enum (single color for solid features, charges, etc.)
field          optional        background color for split-field types (cross, pall, saltire, triangle, pile)
count          default 1       number of instances (stars, wreath leaves, charges in a group)
points         optional        for stars and similar (5, 6, 7, 8, 12, …)
rays           optional        for suns and similar radiating charges (8, 16, 32, 40, …)
size           optional        large | medium | small (only when the flag distinguishes)
position       default center  placement region (see below)
proportion     optional        relative size, e.g., "1/4" for cantons, "1/3" for sides
direction      optional        "hoist" / "fly" / "chief" / "base" for piles; "bend" / "bend-sinister" for diagonal-stripes
arrangement    optional        for charge groups (see below)
rows           optional        for grid arrangements; per-row counts
rotation       default 0       degrees of rotation
mirrored       default false   horizontally flipped
role           optional        human-readable subname ("Commonwealth Star", "Lone Star")
symbolism      optional        meaning of this specific feature
fimbriation    optional        narrow contrasting edge — object or array of objects (see below)
features       optional        nested features (only for composite types: canton, embedded-flag)
embedded_flag_id  optional     reference to another flag's id (canton, embedded-flag types)
```

### Position values

```
center, upper-hoist, upper-fly, lower-hoist, lower-fly,
hoist, fly, top, bottom,
center-hoist, center-fly
```

### Arrangement values

```
single, row, grid, circle, arc,
southern-cross, big-dipper, scattered,
cross-pattern, saltire-pattern, constellation-other
```

For grid arrangements, `rows` lists per-row counts. The US flag's 50 stars are `arrangement: "grid", rows: [6, 5, 6, 5, 6, 5, 6, 5, 6]`.

### Feature type enum

The enum is the union of layout types and charge types. Many types work in both modes — as a full-field structural pattern when first/dominant, as a placed device when smaller or positioned.

#### Layout / division types (typically dominant)

```
solid                       single color field
horizontal-stripes          stripes parallel to the long axis
vertical-stripes            stripes perpendicular to the long axis
diagonal-stripes            stripes along a diagonal (with `direction`)
per-bend                    diagonal split into two solid halves
per-saltire                 X-divided into four triangles
quartered                   four equal fields
bordure                     solid border around a different field
complex                     does not decompose; describe in `description`
```

#### Cross / saltire / wedge types (work as both layout and charge)

```
nordic-cross                off-center cross (Scandinavian style)
latin-cross                 cross with longer lower limb
greek-cross                 equal-arm centered cross
saltire                     X-shape (St Andrew, St Patrick, Jamaica, etc.)
pile                        wedge crossing the flag (apex meets opposite edge — Cuba, Czech, Bahamas, Eritrea)
triangle                    triangular fragment, typically hoist-positioned, that does NOT span the flag
arrowhead                   pile-on-pile (Guyana)
chevron                     V-shape stripe
pall                        Y-shape (South Africa)
canton                      upper-hoist sub-region with its own field and content
side                        full-height vertical band on the hoist side (Pakistan, UAE)
side-sinister               full-height vertical band on the fly side
lozenge                     diamond shape (rhombus); use for placed diamond-shaped devices
```

#### Astronomical charges

```
star, sun, crescent, moon
```

#### Heraldic charges

```
coat-of-arms, shield, seal, crest, crown, wreath
```

#### Fauna

```
eagle, bird, lion, dragon, horse, serpent, animal-other, mythical-creature
```

#### Flora

```
tree, palm, cedar, maple-leaf, flower, olive-branch, wheat, leaf, cactus
```

#### Tools / weapons

```
hammer-and-sickle, sword, spear, axe, anchor, key, tool, firearm, cogwheel, chain
```

#### Symbolic / cultural

```
star-of-david, wheel, chakra, khanda, taegeuk, yin-yang,
fleur-de-lis, phrygian-cap, torch, jewel, drum, book
```

#### Geometric (placed shapes)

```
circle, disc, square, border
```

#### Geographic / built

```
map, mountain, wave, building, temple, pyramid, ship, hand, human-figure
```

#### Composite (recursive)

```
canton          upper-hoist sub-region with its own field + features (or embedded flag)
embedded-flag   another flag placed as a charge somewhere on the field
```

#### Text and abstract symbolic marks

```
glyph           any single graphic mark — Arabic shahada, Latin mottos, motto scrolls,
                non-text symbolic marks (Korean trigrams, Mongolian Soyombo, abstract
                kanji-derived prefecture emblems). Specify the actual content in `role`
                or `symbolism` when meaningful.
```

### Type-specific fields

Different feature types take different attribute fields. Examples:

```
solid               color
horizontal-stripes  stripes (color array), count, widths (optional)
vertical-stripes    stripes, count, widths
diagonal-stripes    stripes, count, direction
per-bend            field (top), bend (bottom), direction
per-saltire         hoist, top, fly, bottom (four triangle colors)
quartered           quarters (array of 4 colors, hoist-top first, clockwise)
bordure             field, border
nordic-cross        field, cross
latin-cross         field, cross
greek-cross         field, cross
saltire             field, saltire
pall                field, pall
pile                field, pile, direction
triangle            field, triangle
arrowhead           field, outer, inner
chevron             field, chevron, direction
canton              color, proportion, features, OR embedded_flag_id
side                color, proportion
side-sinister       color, proportion
lozenge             color
star                count, points, color, arrangement, rows, role
sun                 rays, color
charge types        color, count, position, role
```

### Stripe encoding

The `stripes` array lists the **unique repeating pattern**, not every individual stripe:

```json
{
  "type": "horizontal-stripes",
  "stripes": ["red", "white"],
  "count": 13
}
```

Cycling rule: when `count > stripes.length`, the pattern cycles — above produces red, white, red, white, …, red. For non-cyclic patterns (palindromes, irregular orders), `count` must equal `stripes.length` and all colors are listed:

```json
{
  "stripes": ["red", "white", "blue", "white", "red"],
  "count": 5
}
```

Equal-width stripes (the common case) omit `widths`. For non-equal stripes:

```json
{
  "type": "horizontal-stripes",
  "stripes": ["red", "yellow"],
  "count": 3,
  "widths": [1, 2, 1]
}
```

### Stripe ordering

- Horizontal stripes: top to bottom.
- Vertical stripes: hoist to fly.
- Diagonal stripes: along the direction of the bend, from the originating corner.

### Fimbriation

Optional narrow color edge between two other colors. Specify on any feature where it applies — structural divisions or individual charges:

```json
{
  "type": "pall",
  "field": "blue",
  "pall": "green",
  "fimbriation": { "color": "white", "around": "pall" }
}
```

`fimbriation` accepts either a single object or an array of objects when multiple fimbriations exist. The South African flag has both white fimbriation around the pall and yellow fimbriation around the hoist triangle:

```json
{
  "type": "pall",
  "field": "...",
  "pall": "green",
  "fimbriation": [
    { "color": "white", "around": "pall" },
    { "color": "yellow", "around": "triangle" }
  ]
}
```

`around` values: `pall, cross, saltire, stripes, triangle, charge, all-edges`.

Per-charge fimbriation: a star with a contrasting outline (e.g., New Zealand's Southern Cross — red stars fimbriated white against the navy field):

```json
{ "type": "star", "color": "red", "points": 5, "fimbriation": { "color": "white" } }
```

### Symbolism

Each feature can carry an optional inline `symbolism` field (string) explaining its meaning. Color-level symbolism lives in the top-level `colors` array. Combined / overall symbolism that cannot be decomposed lives in the top-level `symbolism` field.

### Composite features

#### `canton`

A canton is an upper-hoist sub-region with its own design (always upper-hoist by convention; no `position` field is needed). Either describe it directly with its own colors and nested features:

```json
{
  "type": "canton",
  "color": "navy",
  "proportion": "1/4",
  "features": [
    {
      "type": "star",
      "count": 50,
      "points": 5,
      "color": "white",
      "arrangement": "grid",
      "rows": [6, 5, 6, 5, 6, 5, 6, 5, 6]
    }
  ],
  "symbolism": "the union of the states"
}
```

…or reference an embedded flag:

```json
{
  "type": "canton",
  "embedded_flag_id": "GB",
  "proportion": "1/4",
  "symbolism": "ties to the United Kingdom"
}
```

Cantons may recursively contain other cantons. Liberian county flags use the Liberian national flag — itself canton-bearing — as their canton, producing canton-in-canton.

#### `embedded-flag`

A flag placed as a charge somewhere on the field, distinct from canton:

```json
{
  "type": "embedded-flag",
  "embedded_flag_id": "GB",
  "position": "center-hoist",
  "mirrored": true,
  "symbolism": "ties to the British Empire"
}
```

Used when an entire flag appears as a symbolic device — e.g., the three small flags charged onto the central white stripe of the 1928–1994 South African flag.

`embedded_flag_id` is the `id` of another flag in this database. The reference may point to a flag that does not yet exist; dangling references are allowed (`tools/validate.py` treats them as warnings, not errors) so flags can be added incrementally.

### Feature type notes and conventions

#### `pile` vs `triangle`

- **`pile`** — a wedge whose apex meets the opposite edge of the flag (spans the flag). Examples: Czech Republic, Cuba, Bahamas, Djibouti, Eritrea, São Tomé, Sudan, South Sudan.
- **`triangle`** — a triangular fragment whose apex does NOT span the flag (typically a hoist triangle stopping at or before the flag's center). Less common as a structural pattern.

When in doubt, look at where the apex falls. If it touches the fly edge, it's a pile.

#### Cross types as both structure and charge

`nordic-cross`, `latin-cross`, `greek-cross`, and `saltire` are valid as full-field structural patterns (where the cross/saltire fills the flag) or as smaller placed devices (a Christian cross charge, a saltire device on a stripe). The `position`, `proportion`, and overall layout indicate which usage applies. Most full-field uses are listed as the first feature; smaller placed uses appear later in the array.

For the special case of multiple small saltires arranged on a stripe (like Amsterdam's three saltires), use `saltire` as the feature type with `count: 3` and an appropriate `arrangement`.

#### `glyph` for text and abstract marks

Use `glyph` for any single graphic mark on the flag — both actual writing (Arabic shahada, Latin mottos, words on scrolls) and non-text symbolic marks (Korean trigrams, Mongolian Soyombo, stylized prefecture emblems). Capture the textual content or symbolic meaning in `role` or `symbolism`. Multiple glyphs grouped together (e.g., Korea's four trigrams) take `count: 4` plus an `arrangement` value.

#### Workarounds for rare patterns

A handful of patterns that would each support only 1–2 flags in our corpus are intentionally not given dedicated types. Use the documented workaround:

- **Lozengy / diaper patterns** (Bavarian *Rautenflagge*) → `complex` with description.
- **Compass roses** (NATO) → `circle` with a centered cross-like or star-like charge; describe in prose.
- **Heraldic silver / argent** → use `white` in the colors array. The `silver` term is a heraldic synonym for white in flag rendering; we don't model it separately. `grey` is reserved for actual visible grey.

## Controlled vocabularies

### Region

Flat tag set drawn from a mix of UN M49 geographic regions and cultural / political groupings. Apply all that fit.

**Geographic (UN M49):**
Africa, Northern Africa, Sub-Saharan Africa, Eastern Africa, Middle Africa, Southern Africa, Western Africa, Americas, Northern America, Latin America and the Caribbean, Caribbean, Central America, South America, Asia, Central Asia, Eastern Asia, South-eastern Asia, Southern Asia, Western Asia, Europe, Eastern Europe, Northern Europe, Southern Europe, Western Europe, Oceania, Australia and New Zealand, Melanesia, Micronesia, Polynesia, Antarctica.

**Cultural / political:**
Nordics, Scandinavia, Baltics, Balkans, Iberian Peninsula, British Isles, European Union, Caucasus, Middle East, MENA, Maghreb, Levant, GCC, Horn of Africa, Sahel, Pacific Islands, Anglosphere, Commonwealth, Francophonie, Lusophone, Hispanic, Slavic, Turkic, Post-Soviet, Latin America, Arab World.

**Notes on cultural tags:**
- `Hispanic` ([Hispanidad](https://en.wikipedia.org/wiki/Hispanidad)) is the linguistic-cultural grouping of Spanish-speaking nations: Spain plus the Spanish-speaking Hispanic American countries (Mexico, most of Central and South America except Brazil/Suriname/Guyana, Spanish-speaking Caribbean — Cuba, DR, PR — plus Equatorial Guinea). Symmetric to `Lusophone` and `Francophonie`.
- `Latin America` is the regional/cultural grouping that *includes* Brazil and other non-Hispanic Latin American states. A Brazilian flag carries `Latin America` and `Lusophone` but not `Hispanic`. A Mexican flag carries `Latin America` and `Hispanic`. Spain carries `Hispanic` and `Iberian Peninsula` but not `Latin America`.

**Overlap rules:**

- Where a cultural tag is identical to an M49 sub-region (Caribbean, Polynesia, Central Asia), use only the M49 name; don't double-tag.
- Where a cultural tag is a strict subset of an M49 sub-region (Scandinavia ⊂ Nordics ⊂ Northern Europe; Baltics ⊂ Northern Europe; Maghreb ⊂ Northern Africa), tag both.
- Where a cultural tag crosses M49 boundaries (MENA, Anglosphere, Latin America, Hispanic), tag the cultural tag *and* all relevant M49 sub-regions.

It is fine for some entities — supraregional bodies like the UN, NATO, the Olympic movement — to have an empty `region` array. Don't invent tags to fill them.

### Colors

```
white, black, grey,
red, maroon, pink,
orange, yellow, gold,
green,
light-blue, blue, navy,
purple, brown
```

15 values. The closed enum is intentionally compact; flag colors are usually defined abstractly (each country's "blue" or "red" is a different shade) and the SVG carries the precise hex values when needed.

### Variant, status, shape, feature types

See the field-by-field reference and the feature-type enum above.

## Defaults that allow omission

Most country flag JSON files will omit these fields, relying on defaults:

```
parent              null
shape               "rectangular"
aspect_ratio        omitted
variant             omitted (no FIAV claim made)
status              "de-jure"
symbolism           null
periods             omitted
sources             omitted
history             omitted
twosided            false
```

A minimal country JSON can be ~10–15 lines.

## Tooling

All tooling lives in `tools/` and requires only Python 3 (no third-party dependencies):

- **`tools/build_index.py`** — regenerates `data/flags.json` from the per-flag JSON. Run it after adding, removing, or changing any flag JSON *or* SVG (the index carries a content hash of each SVG, used to cache-bust the image URLs). `--check` exits non-zero if the committed index is stale; CI uses this and rebuilds the index on deploy.

  ```
  python3 tools/build_index.py            # rebuild data/flags.json
  python3 tools/build_index.py --check    # verify it is up to date
  ```

- **`tools/serve.py`** — a local dev server that mimics GitHub Pages (serves the site under `/flags/` and returns `404.html` for clean-URL routes), so deep links behave the same locally as in production.

  ```
  python3 tools/serve.py                  # http://localhost:8000/flags/
  python3 tools/serve.py 8080             # custom port
  ```

- **`tools/validate.py`** — checks each flag against the schema and filename grammar: required fields; `type` / `region` / `shape` / `status` / `variant` / feature-type / color enum membership; the color-consistency rule (every color used in a feature is declared in `colors`); `aspect_ratio` format; ASCII-only filenames; and `id` ↔ filename agreement. Cross-reference issues (`parent` / `embedded_flag_id` pointing at an id not in the set, `codes` disagreeing with the filename) are reported as warnings, since they can be legitimate. Errors exit non-zero; `--strict` also fails on warnings.

  ```
  python3 tools/validate.py                 # validate the whole corpus
  python3 tools/validate.py data/SE.json    # validate specific files
  ```

## Aggregator

`data/flags.json` is a single file containing all per-flag metadata, built from individual JSON files by `tools/build_index.py` (see [Tooling](#tooling)). It is the recommended consumer entry point for clients that need to scan or query the whole corpus. Do not edit it by hand; it is rebuilt by CI.

## Contributing

When adding a new flag:

1. Choose the right `<id>` per the naming conventions above.
2. Save the SVG as `data/<id>.svg`.
3. Create `data/<id>.json` with at minimum `id`, `name`, `type`, `description`, `features`, `colors`. Populate other fields as data is available.
4. Validate it: `python3 tools/validate.py data/<id>.json`, then rebuild and check the index: `python3 tools/build_index.py --check` (see [Tooling](#tooling)).
5. The aggregator `flags.json` is rebuilt by CI.

### Inclusion bar

- Always include officially recognized variant flags (civil, state, war, naval, royal standard, etc.).
- Include `proposed` flags only when notable (Wikipedia article exists, was a serious finalist in a redesign process, widely discussed in media).
- Include `de-facto` flags when an entity has no official flag but a flag is in widespread use.
- Include `alternative` flags when widely recognized as such.

Reject ad-hoc designs without independent documentation.

### Filename consistency

- ASCII hyphens only — never en-dashes (`–`) or em-dashes (`—`).
- Lowercase slugs; uppercase ISO codes.
- Date suffixes use ASCII hyphens to separate year-month-day components.

## License

This repository is licensed in three layers (see [LICENSE](LICENSE) for the full text):

- **Metadata and the database as a whole** (`data/*.json`, `data/flags.json`, the schema and curation) — [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).
- **Code and tooling** (`tools/`, `app.js`, and the rest of the site source) — [MIT](https://opensource.org/license/mit).
- **Flag images** (`data/*.svg`) — these are mostly third-party works (Wikimedia Commons and similar) and retain their original licenses; see each flag's `sources`. Some emblems are additionally trademark-protected.
