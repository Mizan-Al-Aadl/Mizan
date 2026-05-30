# Local Chatbot (Optional)

This folder contains scripts for running Mizan's fine-tuned model locally on CPU. This is **optional** — the app works fine using the Azure endpoint without any of this.

The workflow is:

1. Merge the LoRA adapter into the base model.
2. Convert the merged model to GGUF.
3. Serve the GGUF file through a small FastAPI server.

## Folder layout

```text
chatbot/
|-- README.md
|-- quantize.py
`-- results/
    `-- baseline_lora/
```

Place your training output in `chatbot/results/baseline_lora/`.
It should contain the adapter weights, config, and tokenizer files.

## 1. Create a virtual environment

```powershell
cd chatbot
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -U pip
pip install -r requirements.txt
```

## 2. Install llama.cpp

```bash
git clone https://github.com/ggerganov/llama.cpp.git
cd llama.cpp
make -j
cd ..
```

## 3. Log in to Hugging Face

`meta-llama/Meta-Llama-3-8B-Instruct` is gated, so you need to accept the license and authenticate first.

```bash
huggingface-cli login
```

## 4. Merge and quantize

```bash
python quantize.py --adapter ./results/baseline_lora --base meta-llama/Meta-Llama-3-8B-Instruct --out ./mizan-merged --gguf ./mizan-q4_k_m.gguf --llamacpp ./llama.cpp --quant Q4_K_M
```

## 5. Run the local server

Start the backend's built-in local model support by setting in `backend/.env`:

```env
USE_FINETUNED=true
FINETUNED_MODEL_PATH=./chatbot/mizan-q4_k_m.gguf
```

## Quantization notes

- `Q4_K_M` is the smallest common option and is best for lower-RAM machines.
- `Q5_K_M` gives better quality if you have enough memory.
- `Q8_0` uses more RAM but keeps more quality.