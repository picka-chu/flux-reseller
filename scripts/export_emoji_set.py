#!/usr/bin/env python3
"""Export a Telegram sticker or custom-emoji set so it can be reviewed.

Usage (run on your own machine, not in the repo):

    export TELEGRAM_BOT_TOKEN=123:abc          # your bot token; never commit it
    python scripts/export_emoji_set.py AppsIconsWB --out ./emoji-export

It writes into --out:
  manifest.json   one entry per icon: number, custom_emoji_id, fallback emoji, file type
  files/          the downloaded icon files (.webp, .webm or .tgs)
  sheet.png       numbered contact sheet (static icons only) so you can label them by number

Icons are not committed to the repo. Use them only after checking the rights (see docs above).
The bot token is read from the environment and is never printed or saved.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import httpx

API = os.getenv("TELEGRAM_API_BASE", "https://api.telegram.org")


def call(client: httpx.Client, token: str, method: str, **params):
    r = client.get(f"{API}/bot{token}/{method}", params=params, timeout=30)
    data = r.json()
    if not data.get("ok"):
        raise SystemExit(f"Telegram refused {method}: {data.get('description', 'unknown error')}")
    return data["result"]


def download(client: httpx.Client, token: str, file_id: str, dest: Path) -> str:
    info = call(client, token, "getFile", file_id=file_id)
    path = info["file_path"]
    r = client.get(f"{API}/file/bot{token}/{path}", timeout=60)
    r.raise_for_status()
    dest.write_bytes(r.content)
    return Path(path).suffix or ".bin"


def contact_sheet(items: list[dict], files_dir: Path, out: Path) -> bool:
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        print("Pillow not installed: skipping sheet.png (pip install pillow to get it).")
        return False
    cell, cols = 128, 8
    rows = (len(items) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell, rows * cell), "white")
    draw = ImageDraw.Draw(sheet)
    for i, item in enumerate(items):
        x, y = (i % cols) * cell, (i // cols) * cell
        draw.text((x + 6, y + 4), f"#{item['number']}", fill="black")
        if item["file"].endswith(".webp") or item["file"].endswith(".png"):
            try:
                img = Image.open(files_dir / item["file"]).convert("RGBA")
                img.thumbnail((cell - 24, cell - 34))
                sheet.paste(img, (x + 12, y + 26), img)
                continue
            except Exception:
                pass
        draw.rectangle([x + 12, y + 26, x + cell - 12, y + cell - 12], outline="grey")
        draw.text((x + 18, y + 55), item["file"].split(".")[-1].upper(), fill="grey")
    sheet.save(out)
    return True


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("set_name", help="set name from the link, e.g. AppsIconsWB")
    ap.add_argument("--out", default="./emoji-export", help="output folder (outside the repo)")
    args = ap.parse_args()

    token = os.getenv("TELEGRAM_BOT_TOKEN", "")
    if not token:
        sys.exit("Set TELEGRAM_BOT_TOKEN first. The token is not printed or saved.")

    out = Path(args.out)
    files_dir = out / "files"
    files_dir.mkdir(parents=True, exist_ok=True)

    with httpx.Client() as client:
        meta = call(client, token, "getStickerSet", name=args.set_name)
        stickers = meta.get("stickers", [])
        print(f"Set '{meta.get('title', args.set_name)}': {len(stickers)} icons ({meta.get('sticker_type', 'unknown type')})")

        items = []
        for number, s in enumerate(stickers, start=1):
            ext = download(client, token, s["file_id"], files_dir / f"{number:03d}.tmp")
            final = f"{number:03d}{ext}"
            (files_dir / f"{number:03d}.tmp").rename(files_dir / final)
            items.append({
                "number": number,
                "file": final,
                "custom_emoji_id": s.get("custom_emoji_id"),
                "fallback_emoji": s.get("emoji"),
                "animated": bool(s.get("is_animated")),
                "video": bool(s.get("is_video")),
                "width": s.get("width"),
                "height": s.get("height"),
            })

    (out / "manifest.json").write_text(json.dumps({"set": args.set_name, "title": meta.get("title"), "icons": items}, indent=2, ensure_ascii=False))
    contact_sheet(items, files_dir, out / "sheet.png")
    print(f"Done. Open {out / 'sheet.png'} (or manifest.json) and tell me which numbers are brand logos.")


if __name__ == "__main__":
    main()
