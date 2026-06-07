import re
from typing import List, Optional

GREETINGS = [
    "مرحبا",
    "أهلا",
    "السلام عليكم",
    "مرحبا بك",
    "أهلا وسهلا",
    "يا هلا",
    "يا مرحبا"
]

THANKS = [
    "شكرا",
    "شكرا جزيلا",
    "مشكور",
    "ممتن لك",
    "أشكرك",
    "شكرا لك"

]

FAREWELLS = [
    "مع السلامة",
    "الوداع",
    "إلى اللقاء",
    "أراك لاحقا",
]

def normalize(text: str) -> str :
    text = text.lower().strip()
    text = re.sub(r"[^\w\s]", "", text)
    return text

def get_short_circuit_response(message:str) -> Optional[str] :
    """
    Returns a static response if the message can be
    answered without invoking the LLM.
    Returns None otherwise.
    """
    msg = normalize(message)

    if msg in GREETINGS:
        return "مرحبا ! كيف ممكن ان أساعدك اليوم؟"
    if msg in THANKS:
        return "لا شكر على واجب"
    if msg in FAREWELLS:
        return "الى اللقاء"
    return None 



