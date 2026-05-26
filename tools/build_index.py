#!/usr/bin/env python3
"""Build data/flags.json — a single lightweight index aggregating the
per-flag metadata used by the flag browser web app.

The full per-flag JSON files stay authoritative; this index only carries the
fields needed for fast client-side filtering and gallery rendering. The detail
view fetches the individual data/{id}.json on demand for the rich fields
(history, sources, full feature attributes, etc.).

Usage:
    python3 tools/build_index.py            # writes data/flags.json
    python3 tools/build_index.py --check    # verify it is up to date (CI)
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
INDEX_FILE = DATA_DIR / "flags.json"


def svg_rev(svg_path: Path) -> str | None:
    """Short content hash of the sibling SVG, used for cache-busting the
    <img> URLs. Changes only when the SVG bytes change, so fingerprinted
    asset URLs can be cached indefinitely yet update the instant a flag is
    re-rendered or replaced."""
    try:
        data = svg_path.read_bytes()
    except OSError:
        return None
    return hashlib.sha256(data).hexdigest()[:8]


def feature_types(flag: dict) -> list[str]:
    """Distinct feature `type` strings, preserving first-seen order."""
    seen: list[str] = []
    for feat in flag.get("features", []) or []:
        if isinstance(feat, dict):
            t = feat.get("type")
            if t and t not in seen:
                seen.append(t)
    return seen


def color_names(flag: dict) -> list[str]:
    out: list[str] = []
    for c in flag.get("colors", []) or []:
        if isinstance(c, dict):
            name = c.get("color")
            if name and name not in out:
                out.append(name)
    return out


def embedded_refs(flag: dict) -> list[str]:
    """IDs referenced via embedded_flag_id on any (possibly nested) feature."""
    refs: list[str] = []

    def walk(feats):
        for f in feats or []:
            if not isinstance(f, dict):
                continue
            ref = f.get("embedded_flag_id")
            if ref and ref not in refs:
                refs.append(ref)
            walk(f.get("features"))

    walk(flag.get("features"))
    return refs


def build_entry(flag: dict) -> dict:
    entry = {
        "id": flag.get("id"),
        "name": flag.get("name"),
        "type": flag.get("type") or [],
        "region": flag.get("region") or [],
        "colors": color_names(flag),
        "features": feature_types(flag),
        "variant": flag.get("variant") or [],
        "aspect_ratio": flag.get("aspect_ratio"),
    }
    refs = embedded_refs(flag)
    if refs:
        entry["embeds"] = refs
    # drop null/empty optional keys to keep the index compact
    return {k: v for k, v in entry.items() if v not in (None, [], "")}


def build() -> dict:
    flags = []
    facets = {
        "colors": {},
        "features": {},
        "regions": {},
        "types": {},
        "variants": {},
        "proportion": {},
    }
    for path in sorted(DATA_DIR.glob("*.json")):
        if path.name == "flags.json":
            continue
        try:
            flag = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            print(f"  skip {path.name}: {exc}", file=sys.stderr)
            continue
        if not flag.get("id"):
            continue
        entry = build_entry(flag)
        rev = svg_rev(path.with_suffix(".svg"))
        if rev:
            entry["rev"] = rev
        flags.append(entry)
        for c in entry.get("colors", []):
            facets["colors"][c] = facets["colors"].get(c, 0) + 1
        for f in entry.get("features", []):
            facets["features"][f] = facets["features"].get(f, 0) + 1
        for r in entry.get("region", []):
            facets["regions"][r] = facets["regions"].get(r, 0) + 1
        for t in entry.get("type", []):
            facets["types"][t] = facets["types"].get(t, 0) + 1
        for v in entry.get("variant", []):
            facets["variants"][v] = facets["variants"].get(v, 0) + 1
        ar = entry.get("aspect_ratio")
        if ar:
            facets["proportion"][ar] = facets["proportion"].get(ar, 0) + 1

    flags.sort(key=lambda e: (e.get("name") or e.get("id") or "").lower())

    # Sort each facet by descending count then name, store as [value, count].
    def sorted_facet(d: dict) -> list[list]:
        return [[k, v] for k, v in sorted(d.items(), key=lambda kv: (-kv[1], kv[0]))]

    return {
        "version": 1,
        "count": len(flags),
        "facets": {k: sorted_facet(v) for k, v in facets.items()},
        "flags": flags,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true",
                    help="exit non-zero if data/flags.json is stale")
    args = ap.parse_args()

    index = build()
    serialized = json.dumps(index, ensure_ascii=False, separators=(",", ":")) + "\n"

    if args.check:
        if not INDEX_FILE.exists():
            print("flags.json missing", file=sys.stderr)
            return 1
        current = INDEX_FILE.read_text(encoding="utf-8")
        if current != serialized:
            print("flags.json is out of date — run tools/build_index.py", file=sys.stderr)
            return 1
        print(f"flags.json up to date ({index['count']} flags)")
        return 0

    INDEX_FILE.write_text(serialized, encoding="utf-8")
    size_kb = len(serialized.encode("utf-8")) / 1024
    print(f"wrote {INDEX_FILE} — {index['count']} flags, {size_kb:.0f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
