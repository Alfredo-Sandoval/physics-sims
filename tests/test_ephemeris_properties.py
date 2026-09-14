"""Exercise the real JavaScript ephemeris parser with generated JSON inputs.

Run from the repository root: python3.12 tests/test_ephemeris_properties.py
Requires Hypothesis; Node is the same runtime used by Solar-System/npm test.
"""

import json
from pathlib import Path
import subprocess

from hypothesis import given, settings, strategies as st

ROOT = Path(__file__).resolve().parents[1]
NODE_PARSE = """
const { getInterpolatedEphemerisPositionAU } = await import(
  './Solar-System/src/simulation/orbitalRuntime.js'
);
const { config, days } = JSON.parse(process.argv[1]);
console.log(JSON.stringify(getInterpolatedEphemerisPositionAU(config, days)));
"""


def parse_position(config: dict[str, object], days: int) -> dict[str, float] | None:
    result = subprocess.run(
        ["node", "--input-type=module", "-e", NODE_PARSE,
         json.dumps({"config": config, "days": days})],
        cwd=ROOT, capture_output=True, text=True, check=True, timeout=5,
    )
    return json.loads(result.stdout)


@settings(max_examples=40, derandomize=True, database=None, deadline=None)
@given(epoch=st.integers(2400000, 2500000),
       coordinates=st.lists(st.integers(-20, 20), min_size=3, max_size=3))
def test_recorded_positions_round_trip(epoch: int, coordinates: list[int]) -> None:
    """JSON sample -> normalized ephemeris -> position retains each endpoint."""
    x, y, z = coordinates
    samples = [
        {"jd": epoch - 10, "x": x, "y": y, "z": z},
        {"jd": epoch + 10, "x": x + 2, "y": y - 3, "z": z + 1},
    ]
    config: dict[str, object] = {"kepler": {"epochJD": epoch}, "ephemeris": {"samples": samples}}
    for sample in samples:
        assert parse_position(config, sample["jd"] - epoch) == {
            key: sample[key] for key in ("x", "y", "z")
        }


@settings(max_examples=40, derandomize=True, database=None, deadline=None)
@given(missing=st.sampled_from([None, "", " ", "\t", False, True, [], {}]),
       coordinate=st.sampled_from(["x", "y"]), epoch=st.integers(2400000, 2500000))
def test_missing_coordinates_are_not_zero(missing: object, coordinate: str, epoch: int) -> None:
    """Malformed numeric fields cannot produce a fabricated zero coordinate."""
    samples = [
        {"jd": epoch, "x": 1, "y": 2, "z": 3, coordinate: missing},
        {"jd": epoch + 1, "x": 2, "y": 3, "z": 4, coordinate: missing},
    ]
    config: dict[str, object] = {"kepler": {"epochJD": epoch}, "ephemeris": {"samples": samples}}
    assert parse_position(config, 0) is None


if __name__ == "__main__":
    test_recorded_positions_round_trip()
    test_missing_coordinates_are_not_zero()
    print("Ephemeris parser properties passed (80 generated examples)")
