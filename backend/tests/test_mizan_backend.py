"""
Mizan backend integration tests.
Covers: health, chats CRUD, messages, model responses (Arabic), memory.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://mizan-legal-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def http():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="session")
def created_chat_ids():
    ids = []
    yield ids
    # Cleanup test chats
    for cid in ids:
        try:
            requests.delete(f"{API}/chats/{cid}", timeout=10)
        except Exception:
            pass


# ---------- Health ----------
class TestHealth:
    def test_health_ok(self, http):
        r = http.get(f"{API}/health", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data["status"] == "ok"
        assert "llm" in data
        assert "rag" in data


# ---------- Chats CRUD ----------
class TestChats:
    def test_create_chat_returns_fields(self, http, created_chat_ids):
        r = http.post(f"{API}/chats", json={}, timeout=15)
        assert r.status_code == 200, r.text
        c = r.json()
        for k in ("id", "title", "created_at", "updated_at"):
            assert k in c
        assert c["title"] == "محادثة جديدة"
        created_chat_ids.append(c["id"])

    def test_list_chats_sorted_desc(self, http, created_chat_ids):
        # Create two with small gap
        r1 = http.post(f"{API}/chats", json={}, timeout=15)
        time.sleep(1.1)
        r2 = http.post(f"{API}/chats", json={}, timeout=15)
        id1, id2 = r1.json()["id"], r2.json()["id"]
        created_chat_ids.extend([id1, id2])

        r = http.get(f"{API}/chats", timeout=15)
        assert r.status_code == 200
        chats = r.json()
        assert isinstance(chats, list) and len(chats) >= 2
        # Ensure no _id leakage
        for c in chats:
            assert "_id" not in c
        # Newest first
        idx2 = next(i for i, c in enumerate(chats) if c["id"] == id2)
        idx1 = next(i for i, c in enumerate(chats) if c["id"] == id1)
        assert idx2 < idx1

    def test_delete_chat_removes_it(self, http):
        r = http.post(f"{API}/chats", json={}, timeout=15)
        cid = r.json()["id"]
        d = http.delete(f"{API}/chats/{cid}", timeout=15)
        assert d.status_code == 200
        # Verify gone
        g = http.get(f"{API}/chats/{cid}", timeout=15)
        assert g.status_code == 404

    def test_delete_unknown_chat_404(self, http):
        d = http.delete(f"{API}/chats/non-existent-id-xyz", timeout=15)
        assert d.status_code == 404


# ---------- Chat / model ----------
class TestChatLLM:
    @pytest.fixture(scope="class")
    def chat_id(self, created_chat_ids):
        r = requests.post(f"{API}/chats", json={}, timeout=15)
        cid = r.json()["id"]
        created_chat_ids.append(cid)
        return cid

    def test_send_arabic_message_returns_assistant(self, http, chat_id):
        body = {"chat_id": chat_id, "content": "ما هي عقوبة السرقة في القانون اللبناني؟"}
        r = http.post(f"{API}/chat", json=body, timeout=120)
        assert r.status_code == 200, r.text
        msg = r.json()
        assert msg["role"] == "assistant"
        assert msg["chat_id"] == chat_id
        assert len(msg["content"]) > 20
        # Has Arabic chars
        assert any("\u0600" <= ch <= "\u06FF" for ch in msg["content"])
        assert "_id" not in msg

    def test_messages_persisted_chronologically(self, http, chat_id):
        r = http.get(f"{API}/chats/{chat_id}/messages", timeout=15)
        assert r.status_code == 200
        msgs = r.json()
        assert len(msgs) >= 2
        assert msgs[0]["role"] == "user"
        assert msgs[1]["role"] == "assistant"
        for m in msgs:
            assert "_id" not in m

    def test_title_auto_updated(self, http, chat_id):
        r = http.get(f"{API}/chats/{chat_id}", timeout=15)
        assert r.status_code == 200
        chat = r.json()
        assert chat["title"] != "محادثة جديدة"
        assert len(chat["title"]) > 0

    def test_conversation_memory(self, http, chat_id):
        # Follow-up that references context: "And what is the punishment?"
        body = {"chat_id": chat_id, "content": "وما هي العقوبة في حال تكرار الجريمة؟"}
        r = http.post(f"{API}/chat", json=body, timeout=120)
        assert r.status_code == 200, r.text
        reply = r.json()["content"]
        # Should mention سرقة or العقوبة contextually
        assert len(reply) > 20
        assert any("\u0600" <= ch <= "\u06FF" for ch in reply)

    def test_empty_message_rejected(self, http, chat_id):
        r = http.post(f"{API}/chat", json={"chat_id": chat_id, "content": "   "}, timeout=15)
        assert r.status_code == 400

    def test_unknown_chat_id_404(self, http):
        r = http.post(f"{API}/chat", json={"chat_id": "no-such-chat", "content": "مرحبا"}, timeout=15)
        assert r.status_code == 404
