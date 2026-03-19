#!/usr/bin/env python3

from __future__ import annotations

import csv
import hashlib
import json
from pathlib import Path

SEED = "euclid-public-demo-2026-03-19"
WORKSPACE_ROOT = Path(__file__).resolve().parents[2]
PRIVATE_REPO = WORKSPACE_ROOT / "euclid_qso_repo"
PUBLIC_REPO = Path(__file__).resolve().parents[1]

PRIVATE_SAMPLE_JSON = PRIVATE_REPO / "data" / "euclid-published-sample.json"
PRIVATE_COMPARISON_JSON = PRIVATE_REPO / "data" / "other-quasar-sample.json"
PRIVATE_SKY_MAP_JSON = PRIVATE_REPO / "data" / "sky-map-overlays.json"
PRIVATE_SITE_DATA_JS = PRIVATE_REPO / "assets" / "site-data.js"

PUBLIC_SAMPLE_JSON = PUBLIC_REPO / "data" / "euclid-published-sample.json"
PUBLIC_COMPARISON_JSON = PUBLIC_REPO / "data" / "other-quasar-sample.json"
PUBLIC_SKY_MAP_JSON = PUBLIC_REPO / "data" / "sky-map-overlays.json"
PUBLIC_SAMPLE_JS = PUBLIC_REPO / "assets" / "published-sample.js"
PUBLIC_SKY_MAP_JS = PUBLIC_REPO / "assets" / "sky-map-overlays.js"
PUBLIC_SITE_DATA_JS = PUBLIC_REPO / "assets" / "site-data.js"
PUBLIC_CSV = PUBLIC_REPO / "downloads" / "euclid-published-sample.csv"
PUBLIC_SPECTRUM_PLACEHOLDER = "assets/placeholders/spectrum-placeholder.svg"
PUBLIC_CUTOUT_PLACEHOLDER = "assets/placeholders/cutout-placeholder.svg"


def load_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def deterministic_offset(identifier: str, field: str, amplitude: float) -> float:
    digest = hashlib.sha256(f"{SEED}:{identifier}:{field}".encode("utf-8")).digest()
    value = int.from_bytes(digest[:8], "big") / 2**64
    return ((value * 2.0) - 1.0) * amplitude


def deterministic_signed_range(
    identifier: str,
    field: str,
    minimum: float,
    maximum: float,
) -> float:
    sign_digest = hashlib.sha256(f"{SEED}:{identifier}:{field}:sign".encode("utf-8")).digest()
    magnitude_digest = hashlib.sha256(
        f"{SEED}:{identifier}:{field}:magnitude".encode("utf-8")
    ).digest()
    sign = -1.0 if sign_digest[0] % 2 else 1.0
    value = int.from_bytes(magnitude_digest[:8], "big") / 2**64
    magnitude = minimum + value * (maximum - minimum)
    return sign * magnitude


def clamp(value: float, minimum: float, maximum: float) -> float:
    return min(maximum, max(minimum, value))


def wrap_ra_degrees(value: float) -> float:
    return value % 360.0


def j2000_name_from_coords(ra_deg: float, dec_deg: float) -> str:
    ra_hours = wrap_ra_degrees(ra_deg) / 15.0
    ra_total_minutes = int(ra_hours * 60.0)
    ra_hour = (ra_total_minutes // 60) % 24
    ra_minute = ra_total_minutes % 60

    dec_sign = "+" if dec_deg >= 0 else "-"
    dec_abs = abs(dec_deg)
    dec_total_minutes = int(dec_abs * 60.0)
    dec_degree = dec_total_minutes // 60
    dec_minute = dec_total_minutes % 60

    return f"J{ra_hour:02d}{ra_minute:02d}{dec_sign}{dec_degree:02d}{dec_minute:02d}"


def sanitize_sample(
    private_sample: list[dict[str, object]],
) -> tuple[list[dict[str, object]], dict[str, str]]:
    public_sample: list[dict[str, object]] = []
    name_map: dict[str, str] = {}
    used_names: set[str] = set()

    for row in private_sample:
        identifier = str(row["id"])
        fake_ra = wrap_ra_degrees(
            float(row["ra"]) + deterministic_signed_range(identifier, "ra", 0.9, 4.2)
        )
        fake_dec = clamp(
            float(row["dec"]) + deterministic_signed_range(identifier, "dec", 0.7, 2.8),
            -89.5,
            89.5,
        )
        fake_redshift = clamp(
            float(row["redshift"]) + deterministic_signed_range(identifier, "redshift", 0.08, 0.32),
            5.9,
            8.8,
        )
        fake_muv = clamp(
            float(row["muv"]) + deterministic_signed_range(identifier, "muv", 0.3, 0.95),
            -29.5,
            -20.5,
        )
        fake_jmag = clamp(
            float(row["jmag"]) + deterministic_signed_range(identifier, "jmag", 0.2, 0.75),
            20.0,
            24.8,
        )
        fake_name = j2000_name_from_coords(fake_ra, fake_dec)

        if fake_name == identifier or fake_name in used_names:
            fake_ra = wrap_ra_degrees(fake_ra + 0.55)
            fake_dec = clamp(fake_dec + (0.35 if fake_dec < 89.15 else -0.35), -89.5, 89.5)
            fake_name = j2000_name_from_coords(fake_ra, fake_dec)

        used_names.add(fake_name)
        name_map[identifier] = fake_name

        public_sample.append(
            {
                "id": fake_name,
                "name": fake_name,
                "ra": f"{fake_ra:.6f}",
                "dec": f"{fake_dec:+.6f}",
                "redshift": round(fake_redshift, 4),
                "muv": round(fake_muv, 6),
                "jmag": round(fake_jmag, 2),
                "group": row.get("group", "Published"),
                "instrument": row.get("instrument", "Unknown"),
                "publication": "Illustrative public sample",
                "summary": (
                    "Illustrative public sample with intentionally perturbed coordinates, "
                    "redshifts, and magnitudes. Spectrum and cutout previews are placeholders."
                ),
                "paperIds": row.get("paperIds", []),
                "cutoutPreview": PUBLIC_CUTOUT_PLACEHOLDER,
                "spectrumPreview": PUBLIC_SPECTRUM_PLACEHOLDER,
                "cutoutPath": "",
                "spectrumPath": "",
            }
        )

    public_sample.sort(
        key=lambda item: (float(item["redshift"]), str(item["name"]))
    )
    return public_sample, name_map


def sanitize_sky_map(private_sky_map: dict[str, object]) -> dict[str, object]:
    payload = dict(private_sky_map)
    payload["footprintSource"] = "Sanitized public demo"
    return payload


def sanitize_site_data(name_map: dict[str, str]) -> None:
    site_data_text = PRIVATE_SITE_DATA_JS.read_text(encoding="utf-8")

    for original_name, fake_name in name_map.items():
        site_data_text = site_data_text.replace(f'"{original_name}"', f'"{fake_name}"')

    PUBLIC_SITE_DATA_JS.write_text(site_data_text, encoding="utf-8")


def write_public_sample_bundle(
    sample: list[dict[str, object]],
    comparison_sample: list[dict[str, object]],
) -> None:
    PUBLIC_SAMPLE_JS.write_text(
        "window.EuclidPublishedSample = "
        + json.dumps(sample, indent=2)
        + ";\nwindow.EuclidComparisonSample = "
        + json.dumps(comparison_sample, indent=2)
        + ";\n",
        encoding="utf-8",
    )


def write_public_sky_map_bundle(sky_map_payload: dict[str, object]) -> None:
    PUBLIC_SKY_MAP_JS.write_text(
        "window.EuclidSkyMapOverlays = "
        + json.dumps(sky_map_payload, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )


def write_public_csv(sample: list[dict[str, object]]) -> None:
    PUBLIC_CSV.parent.mkdir(parents=True, exist_ok=True)
    with PUBLIC_CSV.open("w", newline="", encoding="utf-8") as handle:
        fieldnames = ["name", "ra", "dec", "redshift", "muv", "jmag", "instrument", "publication"]
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()

        for row in sample:
            writer.writerow({field: row[field] for field in fieldnames})


def write_placeholders() -> None:
    spectrum_svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 420" role="img" aria-label="Spectrum placeholder">
  <rect width="1200" height="420" fill="#000000"/>
</svg>
"""
    cutout_svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 420" role="img" aria-label="Cutout placeholder">
  <rect width="1200" height="420" fill="#000000"/>
</svg>
"""
    (PUBLIC_REPO / PUBLIC_SPECTRUM_PLACEHOLDER).write_text(spectrum_svg, encoding="utf-8")
    (PUBLIC_REPO / PUBLIC_CUTOUT_PLACEHOLDER).write_text(cutout_svg, encoding="utf-8")


def main() -> None:
    private_sample = load_json(PRIVATE_SAMPLE_JSON)
    comparison_sample = load_json(PRIVATE_COMPARISON_JSON)
    private_sky_map = load_json(PRIVATE_SKY_MAP_JSON)

    if not isinstance(private_sample, list):
        raise ValueError("Expected private sample JSON to contain a list.")
    if not isinstance(comparison_sample, list):
        raise ValueError("Expected private comparison JSON to contain a list.")
    if not isinstance(private_sky_map, dict):
        raise ValueError("Expected private sky map JSON to contain an object.")

    public_sample, name_map = sanitize_sample(private_sample)
    public_sky_map = sanitize_sky_map(private_sky_map)

    save_json(PUBLIC_SAMPLE_JSON, public_sample)
    save_json(PUBLIC_COMPARISON_JSON, comparison_sample)
    save_json(PUBLIC_SKY_MAP_JSON, public_sky_map)
    write_public_sample_bundle(public_sample, comparison_sample)
    write_public_sky_map_bundle(public_sky_map)
    sanitize_site_data(name_map)
    write_public_csv(public_sample)
    write_placeholders()

    print(f"Wrote {len(public_sample)} fake public quasars.")
    print(f"Wrote {len(comparison_sample)} comparison quasars.")
    print("Wrote scrubbed sky-map overlays and placeholder preview images.")


if __name__ == "__main__":
    main()
