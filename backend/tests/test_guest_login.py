import asyncio
import importlib.util
import types
from pathlib import Path

SERVER_PATH = Path(__file__).resolve().parents[1] / "server.py"
SPEC = importlib.util.spec_from_file_location("backend_server", SERVER_PATH)
server_module = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(server_module)


class FakeUsersCollection:
    def __init__(self):
        self.docs = []

    async def find_one(self, query, projection=None):
        email = query.get("email")
        for doc in self.docs:
            if doc.get("email") == email:
                return doc
        return None

    async def insert_one(self, doc):
        self.docs.append(doc)
        return types.SimpleNamespace(inserted_id="guest")


def test_get_or_create_guest_user_creates_guest_account(monkeypatch):
    fake_db = types.SimpleNamespace(users=FakeUsersCollection())
    monkeypatch.setattr(server_module, "db", fake_db)

    user = asyncio.run(server_module._get_or_create_guest_user())

    assert user.name == "Guest"
    assert user.email == "guest@mizan.local"
    assert len(fake_db.users.docs) == 1
