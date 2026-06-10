from __future__ import annotations

from typing import Any


FORMULA_PREFIXES = ("=", "+", "-", "@")


def escape_csv_formula(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    stripped = value.lstrip()
    if stripped and stripped[0] in FORMULA_PREFIXES:
        return "'" + value
    return value
