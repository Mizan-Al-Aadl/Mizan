import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

import chatbot.shortCircuit as shortCircuit


def test_greeting_replies_alternate_between_variants():
    shortCircuit.reset_short_circuit_state()

    first_reply = shortCircuit.get_short_circuit_response("مرحبا")
    second_reply = shortCircuit.get_short_circuit_response("مرحبا")

    assert first_reply in shortCircuit.GREETING_RESPONSES
    assert second_reply in shortCircuit.GREETING_RESPONSES
    assert first_reply != second_reply
