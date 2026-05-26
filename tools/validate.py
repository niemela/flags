#!/usr/bin/env python3
"""Validate the flag corpus against the schema and conventions in README.md.

Checks each data/<id>.json (and its sibling SVG) for:
  - JSON+SVG pairing and id <-> filename agreement
  - required fields and non-empty features/colors
  - enum membership (type, region, shape, status, variant, feature type, color)
  - the color-consistency rule (every color used in a feature is declared in `colors`)
  - aspect_ratio format (integer:integer, or the symbolic irrationals 1:phi / ~1.219:1)
  - ASCII-only filenames (no en/em dashes)
  - cross-references: parent and embedded_flag_id resolve (warnings, not errors)

Errors fail the run (exit 1); warnings do not unless --strict is given.

Usage:
    python3 tools/validate.py                 # validate the whole corpus
    python3 tools/validate.py data/SE.json    # validate specific files
    python3 tools/validate.py --strict        # treat warnings as failures
    python3 tools/validate.py --quiet         # only print the summary
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

# --- Controlled vocabularies (kept in sync with README.md) -------------------

TYPE_ENUM = {
    "country", "subdivision", "city", "intergovernmental",
    "organization", "ethnic", "historical",
}

SHAPE_ENUM = {"rectangular", "swallowtail", "double-pennant", "pennant", "burgee"}

STATUS_ENUM = {"de-jure", "de-facto", "proposed", "alternative", "reconstructed"}

VARIANT_ENUM = {
    "civil", "state", "war", "civil-ensign", "state-ensign", "naval-ensign",
    "royal-standard", "presidential-standard", "vice-presidential-standard",
    "jack", "government",
}

COLOR_ENUM = {
    "white", "black", "grey",
    "red", "maroon", "pink",
    "orange", "yellow", "gold",
    "green",
    "light-blue", "blue", "navy",
    "purple", "brown",
}

REGION_ENUM = {
    # Geographic (UN M49)
    "Africa", "Northern Africa", "Sub-Saharan Africa", "Eastern Africa",
    "Middle Africa", "Southern Africa", "Western Africa", "Americas",
    "Northern America", "Latin America and the Caribbean", "Caribbean",
    "Central America", "South America", "Asia", "Central Asia", "Eastern Asia",
    "South-eastern Asia", "Southern Asia", "Western Asia", "Europe",
    "Eastern Europe", "Northern Europe", "Southern Europe", "Western Europe",
    "Oceania", "Australia and New Zealand", "Melanesia", "Micronesia",
    "Polynesia", "Antarctica",
    # Cultural / political
    "Nordics", "Scandinavia", "Baltics", "Balkans", "Iberian Peninsula",
    "British Isles", "European Union", "Caucasus", "Middle East", "MENA",
    "Maghreb", "Levant", "GCC", "Horn of Africa", "Sahel", "Pacific Islands",
    "Anglosphere", "Commonwealth", "Francophonie", "Lusophone", "Hispanic",
    "Slavic", "Turkic", "Post-Soviet", "Latin America", "Arab World",
}

FEATURE_ENUM = {
    # layout / division
    "solid", "horizontal-stripes", "vertical-stripes", "diagonal-stripes",
    "per-bend", "per-saltire", "quartered", "bordure", "complex",
    # cross / saltire / wedge
    "nordic-cross", "latin-cross", "greek-cross", "saltire", "pile", "triangle",
    "arrowhead", "chevron", "pall", "canton", "side", "side-sinister", "lozenge",
    # astronomical
    "star", "sun", "crescent", "moon",
    # heraldic
    "coat-of-arms", "shield", "seal", "crest", "crown", "wreath",
    # fauna
    "eagle", "bird", "lion", "dragon", "horse", "serpent", "animal-other",
    "mythical-creature",
    # flora
    "tree", "palm", "cedar", "maple-leaf", "flower", "olive-branch", "wheat",
    "leaf", "cactus",
    # tools / weapons
    "hammer-and-sickle", "sword", "spear", "axe", "anchor", "key", "tool",
    "firearm", "cogwheel", "chain",
    # symbolic / cultural
    "star-of-david", "wheel", "chakra", "khanda", "taegeuk", "yin-yang",
    "fleur-de-lis", "phrygian-cap", "torch", "jewel", "drum", "book",
    # geometric
    "circle", "disc", "square", "border",
    # geographic / built
    "map", "mountain", "wave", "building", "temple", "pyramid", "ship", "hand",
    "human-figure",
    # composite
    "embedded-flag",
    # text / abstract
    "glyph",
}

REQUIRED_FIELDS = ("id", "name", "type", "description", "features", "colors")

# Feature keys that carry a single color value, and those that carry a list.
SCALAR_COLOR_KEYS = {
    "color", "field", "cross", "saltire", "pall", "pile", "triangle", "bend",
    "chevron", "border", "outer", "inner", "hoist", "top", "fly", "bottom",
}
ARRAY_COLOR_KEYS = {"stripes", "quarters"}


# --- Helpers -----------------------------------------------------------------

def feature_colors(feat: dict) -> list[str]:
    """All color values referenced by a single feature (not its children)."""
    out: list[str] = []
    for k in SCALAR_COLOR_KEYS:
        v = feat.get(k)
        if isinstance(v, str):
            out.append(v)
    for k in ARRAY_COLOR_KEYS:
        v = feat.get(k)
        if isinstance(v, list):
            out.extend(c for c in v if isinstance(c, str))
    fim = feat.get("fimbriation")
    fims = fim if isinstance(fim, list) else [fim] if isinstance(fim, dict) else []
    for f in fims:
        if isinstance(f, dict) and isinstance(f.get("color"), str):
            out.append(f["color"])
    return out


def walk_features(feats):
    """Yield every feature dict, descending into nested `features` (canton,
    embedded-flag described inline) but NOT following embedded_flag_id."""
    for f in feats or []:
        if not isinstance(f, dict):
            continue
        yield f
        yield from walk_features(f.get("features"))


def embedded_refs(flag: dict) -> list[str]:
    refs: list[str] = []
    for f in walk_features(flag.get("features")):
        ref = f.get("embedded_flag_id")
        if ref and ref not in refs:
            refs.append(ref)
    return refs


def valid_aspect_ratio(s) -> bool:
    if not isinstance(s, str):
        return False
    parts = s.split(":")
    if len(parts) != 2:
        return False

    def ok(tok: str) -> bool:
        tok = tok.strip()
        if tok == "phi":
            return True
        if tok.startswith("~"):
            tok = tok[1:]
        return re.fullmatch(r"\d+(\.\d+)?", tok) is not None

    return ok(parts[0]) and ok(parts[1])


# --- Validation --------------------------------------------------------------

class Report:
    def __init__(self):
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def error(self, fid: str, msg: str):
        self.errors.append(f"{fid}: {msg}")

    def warn(self, fid: str, msg: str):
        self.warnings.append(f"{fid}: {msg}")


def validate_file(path: Path, all_ids: set[str], rep: Report) -> None:
    stem = path.stem
    try:
        flag = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        rep.error(stem, f"invalid JSON: {exc}")
        return
    if not isinstance(flag, dict):
        rep.error(stem, "top-level JSON is not an object")
        return

    fid = flag.get("id") if isinstance(flag.get("id"), str) else stem

    # Filename hygiene + id/filename agreement.
    if not (stem.isascii() and re.fullmatch(r"[A-Za-z0-9_-]+", stem)):
        rep.error(stem, "filename has non-ASCII or illegal characters (use ASCII a-z A-Z 0-9 _ -)")
    if flag.get("id") != stem:
        rep.error(stem, f"`id` ({flag.get('id')!r}) does not match filename basename ({stem!r})")
    if not path.with_suffix(".svg").exists():
        rep.error(stem, "missing companion SVG")

    # Required fields.
    for field in REQUIRED_FIELDS:
        if field not in flag or flag[field] in (None, "", [], {}):
            rep.error(fid, f"missing or empty required field `{field}`")

    # type
    types = flag.get("type")
    if isinstance(types, list):
        for t in types:
            if t not in TYPE_ENUM:
                rep.error(fid, f"`type` value not in enum: {t!r}")
        if "historical" in types and len(types) > 1 and types[0] != "historical":
            rep.warn(fid, "`type` lists `historical` but not first (convention: most-specific first)")
    elif types is not None:
        rep.error(fid, "`type` must be an array")

    # region
    region = flag.get("region")
    if isinstance(region, list):
        for r in region:
            if r not in REGION_ENUM:
                rep.error(fid, f"`region` value not in enum: {r!r}")
    elif region is not None:
        rep.error(fid, "`region` must be an array")

    # shape / status (scalars with enums)
    if "shape" in flag and flag["shape"] not in SHAPE_ENUM:
        rep.error(fid, f"`shape` not in enum: {flag['shape']!r}")
    if "status" in flag and flag["status"] not in STATUS_ENUM:
        rep.error(fid, f"`status` not in enum: {flag['status']!r}")

    # variant
    variant = flag.get("variant")
    if isinstance(variant, list):
        for v in variant:
            if v not in VARIANT_ENUM:
                rep.error(fid, f"`variant` value not in enum: {v!r}")
    elif variant is not None:
        rep.error(fid, "`variant` must be an array")

    # aspect_ratio
    if "aspect_ratio" in flag and not valid_aspect_ratio(flag["aspect_ratio"]):
        rep.error(fid, f"malformed `aspect_ratio`: {flag['aspect_ratio']!r}")

    # features: enum + collect used colors
    used_colors: set[str] = set()
    features = flag.get("features")
    if isinstance(features, list):
        for feat in walk_features(features):
            ft = feat.get("type")
            if ft not in FEATURE_ENUM:
                rep.error(fid, f"feature `type` not in enum: {ft!r}")
            for c in feature_colors(feat):
                used_colors.add(c)
                if c not in COLOR_ENUM:
                    rep.error(fid, f"feature uses color not in enum: {c!r}")

    # declared colors
    declared: list[str] = []
    colors = flag.get("colors")
    if isinstance(colors, list):
        for c in colors:
            if isinstance(c, dict):
                name = c.get("color")
                if name not in COLOR_ENUM:
                    rep.error(fid, f"`colors` entry not in enum: {name!r}")
                if name:
                    declared.append(name)
            else:
                rep.error(fid, "`colors` entries must be objects")

    declared_set = set(declared)
    # Color-consistency: every color painted in a feature must be declared in
    # `colors`. The reverse (every declared color used by some feature) is NOT
    # enforced — pictorial devices like coats of arms, seals, and animal charges
    # legitimately carry colors catalogued in `colors` without a per-feature
    # breakdown, so an "unused" declared color is normal, not an error.
    for c in sorted(used_colors):
        if c in COLOR_ENUM and c not in declared_set:
            rep.error(fid, f"color {c!r} used in features but not declared in `colors`")

    # Cross-references (warnings — refs may be added incrementally).
    parent = flag.get("parent")
    if parent and parent not in all_ids:
        rep.warn(fid, f"`parent` references unknown id: {parent!r}")
    for ref in embedded_refs(flag):
        if ref not in all_ids:
            rep.warn(fid, f"`embedded_flag_id` references unknown id: {ref!r}")

    # codes vs filename (warning — dual-coded entities legitimately differ).
    codes = flag.get("codes") or {}
    base = stem.split("_", 1)[0]
    iso2 = codes.get("iso_3166_2")
    if iso2 and iso2 != base:
        rep.warn(fid, f"`codes.iso_3166_2` ({iso2}) differs from filename base ({base}) — ok only if dual-coded")

    # two-sided companion (warning).
    if flag.get("twosided") and not stem.endswith("_reverse"):
        if not (path.parent / f"{stem}_reverse.json").exists():
            rep.warn(fid, "`twosided` is true but no companion `_reverse` file found")


def main() -> int:
    ap = argparse.ArgumentParser(description="Validate the flag corpus.")
    ap.add_argument("files", nargs="*", type=Path,
                    help="specific JSON files to check (default: all of data/)")
    ap.add_argument("--strict", action="store_true",
                    help="treat warnings as failures")
    ap.add_argument("--quiet", action="store_true",
                    help="print only the summary line")
    args = ap.parse_args()

    # The id set is always the full corpus, so refs resolve even for single-file runs.
    all_ids = {p.stem for p in DATA_DIR.glob("*.json") if p.name != "flags.json"}

    if args.files:
        targets = sorted(args.files)
    else:
        targets = sorted(p for p in DATA_DIR.glob("*.json") if p.name != "flags.json")

    # Corpus-wide pairing check (only on a full run).
    rep = Report()
    if not args.files:
        svg_stems = {p.stem for p in DATA_DIR.glob("*.svg")}
        for stem in sorted(svg_stems - all_ids):
            rep.error(stem, "SVG has no companion JSON")

    for path in targets:
        validate_file(path, all_ids, rep)

    if not args.quiet:
        for line in rep.errors:
            print(f"ERROR  {line}")
        for line in rep.warnings:
            print(f"WARN   {line}")
        if rep.errors or rep.warnings:
            print()

    print(f"Checked {len(targets)} flag(s): "
          f"{len(rep.errors)} error(s), {len(rep.warnings)} warning(s).")

    if rep.errors or (args.strict and rep.warnings):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
