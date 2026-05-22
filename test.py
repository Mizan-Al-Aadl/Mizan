from huggingface_hub import hf_hub_download
from llama_cpp import Llama

print("Downloading model... (this may take a few minutes the first time)")
model_path = hf_hub_download(
    repo_id="olaasm/mizan", 
    filename="llama-3-8b-instruct.Q4_K_M.gguf"
)

print("\nLoading model into memory...")
llm = Llama(
    model_path=model_path,
    n_ctx=2048,           # Context window size
    chat_format="llama-3", # Automatically applies the correct Llama-3 prompt structure
    verbose=False
)

prompt = "ما هي شروط فسخ عقد العمل في قانون العمل اللبناني؟"
print(f"\nAsking: {prompt}")

response = llm.create_chat_completion(
    messages=[
        {"role": "user", "content": prompt}
    ],
    max_tokens=256,
    temperature=0.7,
)

print("\n--- Response ---")
print(response["choices"][0]["message"]["content"])