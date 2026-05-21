"""
Merge a LoRA adapter onto the Llama-3-8B-Instruct base model and quantize the
result to GGUF (Q4_K_M by default) for CPU inference with llama.cpp /
llama-cpp-python.

Usage:
    python quantize.py \
        --adapter ./results/baseline_lora \
        --base meta-llama/Meta-Llama-3-8B-Instruct \
        --out ./mizan-merged \
        --gguf ./mizan-q4_k_m.gguf \
        --llamacpp ./llama.cpp \
        --quant Q4_K_M
"""
import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path


def merge_lora(adapter: str, base: str, out_dir: str) -> None:
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
    from peft import PeftModel

    print(f"[1/3] Loading base model: {base}")
    base_model = AutoModelForCausalLM.from_pretrained(
        base,
        torch_dtype=torch.float16,
        low_cpu_mem_usage=True,
    )

    print(f"[1/3] Loading LoRA adapter: {adapter}")
    model = PeftModel.from_pretrained(base_model, adapter)

    print("[1/3] Merging LoRA into base weights …")
    model = model.merge_and_unload()

    print(f"[1/3] Saving merged model to: {out_dir}")
    os.makedirs(out_dir, exist_ok=True)
    model.save_pretrained(out_dir, safe_serialization=True)

    # Copy tokenizer from adapter (it was saved during fine-tuning)
    tok = AutoTokenizer.from_pretrained(adapter)
    tok.save_pretrained(out_dir)
    print("[1/3] Merge done.")


def convert_to_gguf(merged_dir: str, gguf_path: str, llamacpp_dir: str) -> str:
    """Use llama.cpp's convert_hf_to_gguf.py to produce an fp16 GGUF first."""
    converter = Path(llamacpp_dir) / "convert_hf_to_gguf.py"
    if not converter.exists():
        # newer llama.cpp moved it
        converter = Path(llamacpp_dir) / "convert-hf-to-gguf.py"
    if not converter.exists():
        sys.exit(f"Could not find convert_hf_to_gguf.py inside {llamacpp_dir}")

    fp16_path = gguf_path.replace(".gguf", "-f16.gguf")
    print(f"[2/3] Converting HF -> GGUF fp16: {fp16_path}")
    subprocess.check_call(
        [
            sys.executable,
            str(converter),
            merged_dir,
            "--outfile",
            fp16_path,
            "--outtype",
            "f16",
        ]
    )
    return fp16_path


def quantize_gguf(
    fp16_gguf: str, out_gguf: str, llamacpp_dir: str, quant: str
) -> None:
    quantize_bin = Path(llamacpp_dir) / "llama-quantize"
    if not quantize_bin.exists():
        quantize_bin = Path(llamacpp_dir) / "quantize"  # older name
    if not quantize_bin.exists():
        sys.exit(
            f"llama-quantize binary not found in {llamacpp_dir}. "
            "Did you run `make -j` inside llama.cpp?"
        )

    print(f"[3/3] Quantizing -> {quant}: {out_gguf}")
    subprocess.check_call([str(quantize_bin), fp16_gguf, out_gguf, quant])
    print(f"[3/3] Done. Final model: {out_gguf}")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--adapter", required=True, help="Path to LoRA adapter dir")
    p.add_argument(
        "--base",
        default="meta-llama/Meta-Llama-3-8B-Instruct",
        help="Base HF model (fp16, NOT the bnb-4bit version)",
    )
    p.add_argument("--out", default="./mizan-merged", help="Merged HF dir")
    p.add_argument(
        "--gguf",
        default="./mizan-q4_k_m.gguf",
        help="Final quantized GGUF output path",
    )
    p.add_argument(
        "--llamacpp",
        required=True,
        help="Path to a cloned + built llama.cpp checkout",
    )
    p.add_argument(
        "--quant",
        default="Q4_K_M",
        help="Quantization type (Q4_K_M, Q5_K_M, Q8_0, …)",
    )
    p.add_argument(
        "--skip-merge",
        action="store_true",
        help="Skip merge step (assume --out already populated)",
    )
    args = p.parse_args()

    if not args.skip_merge:
        merge_lora(args.adapter, args.base, args.out)

    fp16 = convert_to_gguf(args.out, args.gguf, args.llamacpp)
    quantize_gguf(fp16, args.gguf, args.llamacpp, args.quant)

    # Clean up fp16 intermediate to save disk
    try:
        os.remove(fp16)
    except OSError:
        pass

    print("\n✅ All done. Run the server with:")
    print(f"    python server.py --model {args.gguf}")


if __name__ == "__main__":
    main()
