import importlib.util
from pathlib import Path
import sys
import asyncio

server_path = Path(__file__).resolve().parent / "server.py"
spec = importlib.util.spec_from_file_location("backend_server", server_path)
module = importlib.util.module_from_spec(spec)
sys.modules["backend_server"] = module
spec.loader.exec_module(module)

async def test_register():
    body = module.UserCreate(name="Test User", email=f"test{module.uuid.uuid4().hex[:6]}@example.com", password="testpass123")
    try:
        token = await module.register(body)
        print('REGISTER OK', token)
    except Exception as e:
        print('REGISTER ERROR', type(e).__name__, e)
        raise

asyncio.run(test_register())
