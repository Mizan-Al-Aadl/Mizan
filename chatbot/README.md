# Mizan Local Chatbot (Quantized CPU Inference)

This folder lets you run your fine-tuned LoRA adapter (in `results/baseline_lora/`) on
**CPU** by merging the adapter with the base model, converting it to **GGUF Q4_K_M**
with `llama.cpp`, and serving it via a small FastAPI server that the Mizan website can
call.

## Folder layout

```
chatbot/
├── README.md
├── requirements.txt
├── quantize.py        # merge LoRA + export HF model + convert to GGUF Q4_K_M
├── server.py          # FastAPI server (llama-cpp-python) exposing /chat
└── results/           # put your "results" folder from training here
    └── baseline_lora/ # adapter_config.json + adapter_model.safetensors + tokenizer.*
```

Place the `results/` folder you trained on (it should contain
`results/baseline_lora/adapter_config.json` and the safetensors weights) here.

The base model used during fine-tuning was
`unsloth/llama-3-8b-Instruct-bnb-4bit`. For CPU quantization we cannot use the
4-bit `bnb` weights directly — we instead pull the **fp16** version of the base
model (`meta-llama/Meta-Llama-3-8B-Instruct`) and merge your LoRA adapter on
top, then quantize to GGUF Q4_K_M (~4.5 GB, runs on CPU with 8–16 GB RAM).

## 1. Install Python dependencies

```bash
cd chatbot
python3 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install -r requirements.txt
```

## 2. Clone llama.cpp (for the GGUF converter and the quantize binary)

```bash
git clone https://github.com/ggerganov/llama.cpp.git
cd llama.cpp
make -j        # builds ./llama-quantize
cd ..
```

## 3. Login to Hugging Face (Llama-3 is gated)

```bash
huggingface-cli login
# Then go to https://huggingface.co/meta-llama/Meta-Llama-3-8B-Instruct
# and accept the license once.
```

## 4. Merge LoRA + quantize

```bash
python quantize.py \
  --adapter ./results/baseline_lora \
  --base meta-llama/Meta-Llama-3-8B-Instruct \
  --out ./mizan-merged \
  --gguf ./mizan-q4_k_m.gguf \
  --llamacpp ./llama.cpp \
  --quant Q4_K_M
```

This produces `./mizan-q4_k_m.gguf` (~4.5 GB).

## 5. Run the local inference server

```bash
python server.py --model ./mizan-q4_k_m.gguf --host 0.0.0.0 --port 8009
```

Test:

```bash
curl -X POST http://localhost:8009/chat \
  -H 'Content-Type: application/json' \
  -d '{"system":"أنت ميزان...","messages":[{"role":"user","content":"مرحبا"}]}'
```

## 6. Point the website at your local model (optional)

In `backend/.env` add:

```
CHATBOT_LOCAL_URL=http://host.docker.internal:8009   # or your machine LAN IP
```

Then call `/api/chat` with `use_local=true`. If it fails, the backend
automatically falls back to Claude Sonnet 4.5.

---

### Memory & CPU tips

| Quant   | File size | RAM needed | Speed (M-class CPU) |
|---------|-----------|------------|---------------------|
| Q4_K_M  | ~4.5 GB   | 6–8 GB     | ~6–10 tok/s         |
| Q5_K_M  | ~5.3 GB   | 8–10 GB    | ~5–8 tok/s          |
| Q8_0    | ~8.5 GB   | 12 GB      | ~3–5 tok/s          |

For best quality on legal Arabic text, prefer `Q5_K_M` if you have RAM.
