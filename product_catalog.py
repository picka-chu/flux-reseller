"""Deterministic catalogue enrichment for supplier products."""
import re
from urllib.parse import quote

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

# Public image endpoints for real brand marks, keyed by explicit product name.
# ClearLogo serves logo images from the brand's domain; no Simple Icons assets.
BRAND_DOMAINS = [
 (r"\b(chat\s*gpt|openai|gpt[- ]?(?:4|4o|5|plus|pro)|\bsora\b|\bcodex\b)", "openai.com"),
 (r"\bgemini\b|\bveo\b", "google.com"),
 (r"\bgrok\b", "x.ai"),
 (r"\bclaude\b|\banthropic\b", "anthropic.com"),
 (r"\bkimi\b", "kimi.com"),
 (r"\bdeep\s*seek\b", "deepseek.com"),
 (r"\bqwen\b", "qwen.ai"),
 (r"\bcursor\b", "cursor.com"),
 (r"\brunway\b", "runwayml.com"),
 (r"\bpika\b", "pika.art"),
 (r"eleven\s*labs", "elevenlabs.io"),
 (r"\bsuno\b", "suno.com"),
 (r"\badobe\b|\bphotoshop\b|\bpremiere\s*pro\b|\bacrobat\b", "adobe.com"),
 (r"\bautodesk\b|\bautocad\b|\brevit\b", "autodesk.com"),
 (r"\bfigma\b", "figma.com"),
 (r"\bcanva\b", "canva.com"),
 (r"\bcapcut\b", "capcut.com"),
 (r"\bnetflix\b", "netflix.com"),
 (r"\bspotify\b", "spotify.com"),
 (r"\bdiscord\b", "discord.com"),
 (r"\btelegram\b", "telegram.org"),
 (r"\bduolingo\b", "duolingo.com"),
 (r"\bcoursera\b", "coursera.org"),
 (r"\bskillshare\b", "skillshare.com"),
 (r"\binstagram\b", "instagram.com"),
 (r"\btiktok\b", "tiktok.com"),
 (r"\byoutube\b", "youtube.com"),
 (r"\blinkedin\b", "linkedin.com"),
 (r"\bfacebook\b", "facebook.com"),
 (r"\bproton\s*vpn\b", "protonvpn.com"),
 (r"\bnord\s*vpn\b", "nordvpn.com"),
 (r"\bexpress\s*vpn\b", "expressvpn.com"),
 (r"\bsurfshark\b", "surfshark.com"),
 (r"\bsteam\b", "steampowered.com"),
 (r"\bplaystation\b", "playstation.com"),
 (r"\bxbox\b", "xbox.com"),
 (r"\broblox\b", "roblox.com"),
]

def classify_product(name, description=""):
    """Classify a supplier product by its name and description."""
    text = re.sub(r"[_/|]+", " ", f"{name or ''} {description or ''}").lower()
    for category, patterns in RULES:
        if any(re.search(pattern, text, re.IGNORECASE) for pattern in patterns):
            return category
    return "AI Tools" if re.search(r"\b(ai|artificial intelligence|llm)\b", text) else "Subscriptions"

def image_for_product(name, category=""):
    """Return a public logo image URL for an explicitly recognized brand."""
    text = re.sub(r"[_/|]+", " ", f"{name or ''}").lower()
    for pattern, domain in BRAND_DOMAINS:
        if re.search(pattern, text, re.IGNORECASE):
            return f"https://api.clearlogo.dev/logo/{quote(domain, safe='')}?size=512"
    return None
