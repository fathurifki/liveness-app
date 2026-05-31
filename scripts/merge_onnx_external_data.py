#!/usr/bin/env python3
"""
Gabungkan bobot external (.onnx.data) ke dalam satu file .onnx agar bisa di-serve di web.

onnxruntime-web TIDAK mendukung file .onnx.data terpisah (error: MountedFiles is not available).

Usage (butuh .onnx + .onnx.data di folder yang sama):
  python3 scripts/merge_onnx_external_data.py public/models/eye_state.onnx
  mv public/models/eye_state_merged.onnx public/models/eye_state.onnx

Atau jalankan notebook: notebooks/export_onnx_for_web.ipynb di Colab.
"""
from __future__ import annotations

import sys
from pathlib import Path

try:
    import onnx
except ImportError:
    print("Install onnx: pip install onnx")
    sys.exit(1)


def merge(path: Path) -> None:
    data_path = path.with_suffix(path.suffix + ".data")
    if not data_path.is_file():
        print(f"SKIP {path.name}: missing {data_path.name}")
        return

    model = onnx.load(str(path), load_external_data=True)
    out = path.with_name(path.stem + "_merged.onnx")
    onnx.save(model, str(out), save_as_external_data=False)
    size_mb = out.stat().st_size / 1024 / 1024
    print(f"OK  {out.name} ({size_mb:.2f} MB) — copy over {path.name} when ready")


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    for arg in sys.argv[1:]:
        p = Path(arg)
        if p.is_file() and p.suffix == ".onnx":
            merge(p)


if __name__ == "__main__":
    main()
