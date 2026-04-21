"""Deterministic sample data generator matching aerospike/seed-data.sh."""

from __future__ import annotations

import json
from typing import Any

# Data pools matching seed-data.sh (0-indexed arrays)
CATEGORIES = ["electronics", "books", "clothing", "food", "sports", "music", "toys", "health", "automotive", "garden"]
STATUSES = ["active", "inactive", "pending", "archived", "draft"]
CITIES = ["Seoul", "Tokyo", "NewYork", "London", "Paris", "Berlin", "Sydney", "Toronto", "Mumbai", "Beijing"]
COLORS = ["red", "blue", "green", "yellow", "purple", "orange", "black", "white", "pink", "gray"]
FIRST_NAMES = ["Alice", "Bob", "Charlie", "Diana", "Eve", "Frank", "Grace", "Henry", "Ivy", "Jack"]
LAST_NAMES = ["Kim", "Lee", "Park", "Choi", "Jung", "Kang", "Cho", "Yoon", "Jang", "Lim"]

# Index definitions matching seed-data.sh
SAMPLE_INDEXES: list[tuple[str, str, str]] = [
    ("idx_bin_int", "bin_int", "numeric"),
    ("idx_bin_str", "bin_str", "string"),
    ("idx_bin_double", "bin_double", "numeric"),
    ("idx_bin_bool", "bin_bool", "numeric"),
    ("idx_bin_geojson", "bin_geojson", "geo2dsphere"),
]


def generate_record_bins(i: int) -> dict[str, Any]:
    """Generate bins for record number *i* (1-indexed, matching seed-data.sh).

    Returns a dict of ``bin_name -> value`` ready for ``client.put()``.
    """
    # Index calculations matching bash script
    ci = (i - 1) % 10
    si = (i - 1) % 5
    li = (i + 2) % 10
    oi = (i + 4) % 10
    ni = (i + 6) % 10
    lni = (i + 8) % 10

    category = CATEGORIES[ci]
    status = STATUSES[si]
    city = CITIES[li]
    color = COLORS[oi]
    fname = FIRST_NAMES[ni]
    lname = LAST_NAMES[lni]

    # bin_int: Integer
    int_val = i * 13 + 42

    # bin_str: String
    str_val = f"{fname} {lname}"

    # bin_double: Double — replicate bash string concatenation for decimal
    dbl_int_part = (i * 37 + 5) % 10000
    dbl_dec_part = i % 100
    dbl_val = float(f"{dbl_int_part}.{dbl_dec_part}")

    # bin_bool: actual Python bool (Aerospike CE 5.6+ supports native bool bins)
    bool_val = bool(i % 2)

    # bin_list: mixed types [int, string, double, int]
    list_val = [int_val, color, dbl_val, i % 3]

    # bin_map: nested object
    age = (i % 50) + 18
    map_val = {
        "first_name": fname,
        "last_name": lname,
        "category": category,
        "status": status,
        "city": city,
        "age": age,
        "score": int_val,
        "tags": [color, category],
    }

    # bin_geojson: GeoJSON Point — store as JSON string for Aerospike GeoJSON type
    lon_int = (i * 47 % 361) - 180
    lon_dec = (i * 131) % 10000
    lat_int = (i * 31 % 181) - 90
    lat_dec = (i * 173) % 10000
    lon = float(f"{lon_int}.{lon_dec}")
    lat = float(f"{lat_int}.{lat_dec}")
    # Clamp latitude to valid GeoJSON range [-90, 90]
    lat = max(-90.0, min(90.0, lat))

    geo_val = json.dumps({"type": "Point", "coordinates": [lon, lat]})

    return {
        "bin_int": int_val,
        "bin_str": str_val,
        "bin_double": dbl_val,
        "bin_bool": bool_val,
        "bin_list": list_val,
        "bin_map": map_val,
        "bin_geojson": geo_val,
    }
