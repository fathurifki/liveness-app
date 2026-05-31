#!/usr/bin/env python3
"""
Export official Silent-Face-Anti-Spoofing MiniFASNet V2 (.pth) to ONNX for onnxruntime-web.

Why this script exists
----------------------
Newer PyTorch defaults to dynamo-based ONNX export, which targets a high opset and then
onnxscript may try to down-convert to opset 11 and fail (e.g. Identity adapter errors).

This script uses the legacy exporter (dynamo=False) and opset 17 so conversion stays clean.

Usage (from repo root after cloning Silent-Face-Anti-Spoofing next to this project, or set REPO):
  pip install torch onnx
  python scripts/export_minifasnet_v2_onnx.py \\
    --repo Silent-Face-Anti-Spoofing \\
    --pth Silent-Face-Anti-Spoofing/resources/anti_spoof_models/2.7_80x80_MiniFASNetV2.pth \\
    --out MiniFASNetV2_web.onnx
"""

from __future__ import annotations

import argparse
import os
import sys


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--repo",
        default="Silent-Face-Anti-Spoofing",
        help="Path to cloned minivision-ai/Silent-Face-Anti-Spoofing",
    )
    parser.add_argument(
        "--pth",
        default="",
        help="Path to 2.7_80x80_MiniFASNetV2.pth (default: <repo>/resources/anti_spoof_models/2.7_80x80_MiniFASNetV2.pth)",
    )
    parser.add_argument("--out", default="MiniFASNetV2_web.onnx", help="Output ONNX path")
    args = parser.parse_args()

    repo = os.path.abspath(args.repo)
    src = os.path.join(repo, "src")
    if not os.path.isdir(src):
        raise SystemExit(f"Missing src under repo: {src}")

    sys.path.insert(0, src)

    from model_lib.MiniFASNet import MiniFASNetV2  # noqa: E402

    pth = args.pth or os.path.join(
        repo, "resources", "anti_spoof_models", "2.7_80x80_MiniFASNetV2.pth"
    )
    if not os.path.isfile(pth):
        raise SystemExit(f"Checkpoint not found: {pth}")

    import torch  # noqa: E402

    model = MiniFASNetV2(conv6_kernel=(5, 5))
    state = torch.load(pth, map_location="cpu")

    # DataParallel checkpoints use "module." prefix
    if len(state) and next(iter(state)).startswith("module."):
        state = {k.replace("module.", "", 1): v for k, v in state.items()}

    model.load_state_dict(state, strict=True)
    model.eval()

    dummy = torch.randn(1, 3, 80, 80)

    kwargs = dict(
        export_params=True,
        opset_version=17,
        do_constant_folding=True,
        input_names=["input"],
        output_names=["output"],
        dynamic_axes={"input": {0: "batch"}, "output": {0: "batch"}},
    )

    # Legacy exporter: avoids dynamo + onnxscript down-conversion to low opset
    try:
        torch.onnx.export(model, dummy, args.out, **kwargs, dynamo=False)
    except TypeError:
        torch.onnx.export(model, dummy, args.out, **kwargs)

    import onnx  # noqa: E402

    onnx.checker.check_model(onnx.load(args.out))
    size_kb = os.path.getsize(args.out) / 1000.0
    print(f"OK → {os.path.abspath(args.out)} ({size_kb:.1f} KB)")


if __name__ == "__main__":
    main()
