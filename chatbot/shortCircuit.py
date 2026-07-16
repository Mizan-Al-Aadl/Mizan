import re
from typing import Optional

GREETINGS = [
    "مرحبا",
    "أهلا",
    "السلام عليكم",
    "مرحبا بك",
    "أهلا وسهلا",
    "يا هلا",
    "يا مرحبا",
]

THANKS = [
    "شكرا",
    "شكرا جزيلا",
    "مشكور",
    "ممتن لك",
    "أشكرك",
    "شكرا لك",
]

FAREWELLS = [
    "مع السلامة",
    "الوداع",
    "إلى اللقاء",
    "أراك لاحقا",
]

GREETING_RESPONSES = [
    "مرحبا! كيف أقدر أساعدك اليوم؟",
    "أهلا وسهلا! ما الذي تحتاجه؟",
    "مرحبا بك! كيف يمكنني المساعدة؟",
    "أهلاً! أنا جاهز لمساعدتك الآن.",
]

THANKING_RESPONSES = [
    "لا شكر على واجب 😊",
    "سعيد لأنني أستطيع المساعدة.",
    "أهلاً بك دائمًا!",
    "من دواعي سروري.",
]

FAREWELL_RESPONSES = [
    "إلى اللقاء! أتمنا لك يومًا رائعًا.",
    "مع السلامة، وسأكون هنا إذا احتجت لي.",
    "أراك لاحقًا!",
    "تفضل بزيارة مرة أخرى.",
]

_CATEGORY_INDEXES = {
    "greetings": 0,
    "thanks": 0,
    "farewells": 0,
}


def normalize(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s]", "", text)
    return text


def reset_short_circuit_state() -> None:
    _CATEGORY_INDEXES.update({"greetings": 0, "thanks": 0, "farewells": 0})


def _get_next_response(category: str, responses: list[str]) -> str:
    index = _CATEGORY_INDEXES[category]
    response = responses[index % len(responses)]
    _CATEGORY_INDEXES[category] = (index + 1) % len(responses)
    return response


def get_short_circuit_response(message: str) -> Optional[str]:
    """
    Returns a static response if the message can be
    answered without invoking the LLM.
    Returns None otherwise.
    """
    msg = normalize(message)

    if msg in GREETINGS:
        return _get_next_response("greetings", GREETING_RESPONSES)
    if msg in THANKS:
        return _get_next_response("thanks", THANKING_RESPONSES)
    if msg in FAREWELLS:
        return _get_next_response("farewells", FAREWELL_RESPONSES)
    return None

