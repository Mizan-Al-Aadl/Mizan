import os
import json
import logging
from llama_cpp import Llama

# Configure clean logging output for Azure container monitoring
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def init():
    """
    Initializes the Llama model by locating the .gguf file dynamically
    and loading it with a safe configuration for 2-core SKUs.
    """
    global llm
    logger.info("=== Starting Mizan Legal Engine (Stable 2-Core Mode) ===")
    
    base_model_dir = os.getenv("AZUREML_MODEL_DIR")
    if not base_model_dir:
        logger.error("Critical: AZUREML_MODEL_DIR environment variable is missing.")
        raise ValueError("AZUREML_MODEL_DIR environment variable not found.")
        
    logger.info(f"Scanning target root directory: {base_model_dir}")
    
    # Dynamically locate the .gguf file in the mounting directory structure
    target_file = None
    for root, dirs, files in os.walk(base_model_dir):
        for file in files:
            if file.endswith(".gguf"):
                target_file = os.path.join(root, file)
                break
        if target_file:
            break
            
    if not target_file:
        logger.error(f"Critical Failure: No .gguf weight file found inside {base_model_dir}")
        raise FileNotFoundError(f"Could not locate a .gguf file in {base_model_dir}")
        
    logger.info(f"Target file successfully located at: {target_file}")
    
    try:
        # Load the model configured to respect your virtual machine boundaries
        llm = Llama(
            model_path=target_file,
            n_ctx=512,             # Low context memory overhead limit
            use_mmap=False,        # False prevents erratic RAM usage spikes during startup
            use_mlock=False,       # Let OS virtual paging handle swaps freely
            n_threads=4,           # STRICTLY match your Standard_D2as_v4 physical cores
            chat_format="llama-3", # Re-enable clean underlying structural template token mapping
            verbose=False          # Suppress excessive native engine print loops
        )
        logger.info("=== Mizan Engine loaded successfully and waiting for inputs ===")
    except Exception as e:
        logger.error(f"Failed to load the Llama model into memory: {str(e)}")
        raise e

def run(raw_data):
    """
    Processes incoming HTTP requests and executes inference safely.
    """
    logger.info("Incoming query request received.")
    try:
        # Parse incoming request string payload safely
        data = json.loads(raw_data)
        messages = data.get("messages", [])
        
        # Use a slightly relaxed temperature + high frequency penalties to break token loops
        temperature = float(data.get("temperature", 0.4)) 
        max_tokens = int(data.get("max_tokens", 128))    # Keep replies punchy on low-tier cores
        
        if not messages:
            return {"error": "Missing 'messages' array parameter in payload structure."}
            
        # Execute chat completion via stable API pipeline
        response = llm.create_chat_completion(
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            frequency_penalty=1.15,  # Discourages repeating identical terms
            presence_penalty=1.0     # Promotes broad token vocabulary usage
        )
        
        logger.info("Response generated successfully.")
        return response
        
    except json.JSONDecodeError:
        logger.error("Failed to decode payload: Input data is not valid JSON.")
        return {"error": "Invalid JSON format in request body."}
    except Exception as e:
        logger.error(f"Runtime error occurred during model inference evaluation: {str(e)}")
        return {"error": f"An error occurred while generating a response: {str(e)}"}