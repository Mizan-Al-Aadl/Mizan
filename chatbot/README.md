# Local Chatbot

This folder contains the scripts for running Mizan's fine-tuned model locally on CPU.

The workflow is:

1. Merge the LoRA adapter into the base model.
2. Convert the merged model to GGUF.
3. Serve the GGUF file through a small FastAPI server.

## Folder layout

```text
chatbot/
|-- README.md
|-- quantize.py
|-- server.py
|-- requirements.txt
`-- results/
    `-- baseline_lora/
```

Place your training output in `chatbot/results/baseline_lora/`.
It should contain the adapter weights, config, and tokenizer files.

The adapter was trained against `unsloth/llama-3-8b-Instruct-bnb-4bit`, but for CPU inference we merge it into the fp16 base model `meta-llama/Meta-Llama-3-8B-Instruct` and then quantize the result to GGUF.

## 1. Create a virtual environment

```powershell
cd chatbot
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -U pip
pip install -r requirements.txt
```

If you are on macOS or Linux, use:

```bash
source .venv/bin/activate
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

```bash
python server.py --model ./mizan-q4_k_m.gguf --host 0.0.0.0 --port 8009
```

Test it with:

```bash
curl -X POST http://localhost:8009/chat -H "Content-Type: application/json" -d "{\"system\":\"You are Mizan...\",\"messages\":[{\"role\":\"user\",\"content\":\"Hello\"}]}"
```

## 6. Connect it to the backend

Set this in `backend/.env`:

```env
CHATBOT_LOCAL_URL=http://localhost:8009
```

Then the FastAPI backend can call the local model when local mode is enabled.

## Quantization notes

- `Q4_K_M` is the smallest common option and is best for lower-RAM machines.
- `Q5_K_M` gives better quality if you have enough memory.
- `Q8_0` uses more RAM but keeps more quality.

If you do not plan to run the local model, you do not need anything in this folder except the source scripts.
