"""Deterministic catalogue enrichment for supplier products."""
import re

RULES = [
 ("ChatGPT", (r"chat\s*gpt", r"openai", r"\bgpt\s*[- ]?(?:4|4o|5|plus|pro)\b")),
 ("Gemini", (r"\bgemini\b", r"google\s*ai")), ("Grok", (r"\bgrok\b",)),
 ("Codex AI", (r"\bcodex\b",)), ("Claude", (r"\bclaude\b", r"anthropic")),
 ("Kimi", (r"\bkimi\b",)), ("Video AI", (r"\brunway\b", r"\bpika\b", r"\bveo\b", r"\bsora\b", r"video\s*ai")),
 ("ElevenLabs", (r"eleven\s*labs",)), ("Qwen AI", (r"\bqwen\b",)),
 ("DeepSeek", (r"deep\s*seek",)), ("Cursor AI", (r"\bcursor\b",)),
 ("Adobe", (r"\badobe\b", r"photoshop", r"premiere\s*pro", r"acrobat")),
 ("Autodesk", (r"\bautodesk\b", r"autocad", r"\brevit\b", r"maya\s*3d")),
 ("Design", (r"\bcanva\b", r"\bfigma\b", r"\bcapcut\b", r"\bdesign\b")),
 ("Office", (r"microsoft\s*365", r"\boffice\s*365\b", r"\bword\b", r"\bexcel\b", r"\bpowerpoint\b")),
 ("Education", (r"\bduolingo\b", r"\bcoursera\b", r"\bskillshare\b", r"\beducation\b")),
 ("Streaming", (r"\bnetflix\b", r"\bdisney\+?\b", r"\bprime\s*video\b", r"\bcrunchyroll\b")),
 ("Music", (r"\bspotify\b", r"\byoutube\s*music\b", r"\bdeezer\b", r"\bmusic\b")),
 ("VPN", (r"\bvpn\b", r"\bnord\s*vpn\b", r"\bexpress\s*vpn\b", r"\bsurfshark\b")),
 ("Security", (r"\bantivirus\b", r"\bsecurity\b", r"\bmalwarebytes\b", r"\bbitdefender\b")),
 ("Games", (r"\bgame\b", r"\bgaming\b", r"\bsteam\b", r"\bplaystation\b", r"\bxbox\b", r"\broblox\b")),
 ("Discord", (r"\bdiscord\b",)),
 ("Social", (r"\binstagram\b", r"\btiktok\b", r"\bfacebook\b", r"\blinkedin\b", r"\bsocial\b")),
 ("AI Tools", (r"\bartificial intelligence\b", r"\bai tools?\b", r"\bai bundle\b")),
]
ICON_SLUGS = {
 "ChatGPT":"openai", "Gemini":"googlegemini", "Grok":"x", "Claude":"claude",
 "Cursor AI":"cursor", "Adobe":"adobe", "Autodesk":"autodesk", "Design":"figma",
 "Office":"microsoftoffice", "Streaming":"netflix", "Music":"spotify",
 "VPN":"protonvpn", "Security":"1password", "Games":"steam", "Social":"instagram",
 "Discord":"discord", "ElevenLabs":"elevenlabs", "DeepSeek":"deepseek",
 "Qwen AI":"alibabacloud",
}

def classify_product(name, description=""):
    """Classify a supplier product by its name and description."""
    text = re.sub(r"[_/|]+", " ", f"{name or ''} {description or ''}").lower()
    for category, patterns in RULES:
        if any(re.search(pattern, text, re.IGNORECASE) for pattern in patterns):
            return category
    return "AI Tools" if re.search(r"\b(ai|artificial intelligence|llm)\b", text) else "Subscriptions"

def image_for_product(name, category):
    """Return a stable Simple Icons URL for recognized brands, else None."""
    text = f"{name or ''} {category or ''}".lower()
    for label, slug in ICON_SLUGS.items():
        if label.lower() in text or (label == "Design" and re.search(r"\b(canva|figma|capcut)\b", text)):
            return f"https://cdn.simpleicons.org/{slug}"
    return None
