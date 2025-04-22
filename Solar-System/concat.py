"""concat.py - Concatenate multiple project files into a single bundled output file.

This script collects the contents of a hard-coded list of project files and writes them to a single output file,
with headers indicating the source file for each section. Files that do not exist are skipped with a warning.
"""

from pathlib import Path, PurePosixPath
import sys

# ----------------------------------------------------------------------
# Hard‑coded list of project files you asked for.  Adjust if needed.
# ----------------------------------------------------------------------
FILES = [
    r"C:\Users\Alif\Documents\GitHub\solar-system\index.html",
    r"C:\Users\Alif\Documents\GitHub\solar-system\js\utils.js",
    r"C:\Users\Alif\Documents\GitHub\solar-system\js\ui.js",
    r"C:\Users\Alif\Documents\GitHub\solar-system\js\starfield.js",
    r"C:\Users\Alif\Documents\GitHub\solar-system\js\sceneSetup.js",
    r"C:\Users\Alif\Documents\GitHub\solar-system\js\main.js",
    r"C:\Users\Alif\Documents\GitHub\solar-system\js\kepler.js",
    r"C:\Users\Alif\Documents\GitHub\solar-system\js\controls.js",
    r"C:\Users\Alif\Documents\GitHub\solar-system\js\celestialBodies.js",
    r"C:\Users\Alif\Documents\GitHub\solar-system\js\constants.js",
    r"C:\Users\Alif\Documents\GitHub\solar-system\js\animation.js",
    r"C:\Users\Alif\Documents\GitHub\solar-system\solarsystem_data.json",
]
FILES = list(dict.fromkeys(FILES))

HEADER = "# ===== {path} =====\n"
OUTPUT = "solar_system_bundle.txt"  # change if you like


def bundle(files=None, output=OUTPUT, *, encoding="utf-8"):
    """
    Bundles the contents of multiple files into a single output file.

    Each file in `files` is written to `output`, separated by a header indicating the file path.
    Files that do not exist are skipped with a warning.

    Args:
        files (list): List of file paths to include in the bundle.
        output (str): Path to the output file.
        encoding (str, optional): Encoding to use when reading and writing files. Defaults to "utf-8".

    Returns:
        Path: The path to the output file.
    """
    if files is None:
        files = FILES
    out_path = Path(output)
    count_ok, count_skipped = 0, 0

    with out_path.open("w", encoding=encoding) as out_fp:
        for f in files:
            p = Path(f)
            if not p.exists():
                print(f"⚠  {f} not found – skipped.")
                count_skipped += 1
                continue

            out_fp.write(HEADER.format(path=PurePosixPath(p)))  # POSIX‑style path
            out_fp.write(p.read_text(encoding=encoding))
            out_fp.write("\n\n")
            count_ok += 1

    print(
        f"✅  wrote {count_ok} section(s) → {out_path} "
        + (f"(skipped {count_skipped})" if count_skipped else "")
    )
    return out_path


# Execute immediately when run as a notebook cell
if __name__ == "__main__" or "ipykernel" in sys.modules:
    bundle()
