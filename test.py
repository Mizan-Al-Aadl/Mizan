import argparse
import os

from llama_cpp import Llama


def load_model() -> Llama:
    """Load local GGUF if present, otherwise pull from Hugging Face."""
    local_model = "mizan.gguf"
    if os.path.exists(local_model):
        return Llama(
            model_path=local_model,
            n_ctx=4096,
            n_threads=max(1, (os.cpu_count() or 4) - 1),
            verbose=False,
        )

    hf_token = os.getenv("HF_TOKEN")
    if not hf_token:
        raise RuntimeError(
            "HF_TOKEN is not set. Run: set HF_TOKEN=your_token (Windows CMD) "
            "or $env:HF_TOKEN='your_token' (PowerShell)."
        )

    return Llama.from_pretrained(
        repo_id="olaasm/mizan",
        filename="llama-3-8b-instruct.Q4_K_M.gguf",
        token=hf_token,
        n_ctx=4096,
        n_threads=max(1, (os.cpu_count() or 4) - 1),
        verbose=False,
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--prompt",
        default="اشرح بإيجاز حق العامل في التعويض عند الصرف التعسفي وفق القانون اللبناني.",
        help="Prompt text to send to the model",
    )
    parser.add_argument("--max_tokens", type=int, default=256)
    args = parser.parse_args()

    llm = load_model()
    response = llm.create_chat_completion(
        messages=[
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": args.prompt},
        ],
        max_tokens=args.max_tokens,
        temperature=0.2,
    )

    text = response["choices"][0]["message"]["content"]
    print("\n=== Model reply ===\n")
    print(text)


if __name__ == "__main__":
    main()
