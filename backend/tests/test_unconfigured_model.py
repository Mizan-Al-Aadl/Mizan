import importlib.util
import sys
from pathlib import Path


server_path = Path(__file__).resolve().parents[1] / "server.py"
spec = importlib.util.spec_from_file_location("backend_server", server_path)
module = importlib.util.module_from_spec(spec)
sys.modules["backend_server"] = module
spec.loader.exec_module(module)


def test_unconfigured_model_message_is_helpful():
    message = module._get_unconfigured_response_text()
    assert "GEMINI_API_KEY" in message or "local" in message.lower()
    assert "configure" in message.lower() or "set" in message.lower()
