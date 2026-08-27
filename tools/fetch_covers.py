#!/usr/bin/env python3
"""يجلب غلافًا مصورًا لكل مدينة — مرة واحدة، إلى المستودع.

المصدر الأول أغلفة Wikivoyage (صُممت أغطيةً لصفحات وجهات، رخص مشاع)،
والثاني صورة Wikipedia الرئيسة. كل صورة تُقص إلى 600×420 وتُضغط JPEG،
ويُدوَّن مصدرها ومؤلفها ورخصتها في app/covers/credits.json — فالإسناد
شرط الرخصة لا مجاملة. الناتج لا يدخل الموقع إلا بعد مراجعة وكيل التصميم
التي تكتب app/js/covers.js.

    python3 tools/fetch_covers.py            # يجلب الناقص فقط
"""
import io, json, pathlib, sys, time, urllib.parse, urllib.request

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "app/covers"
CREDITS = OUT / "credits.json"
UA = "SouvenirTravelApp/1.0 (https://souvenirtravel.app; support@souvenirtravel.app)"
W, H = 600, 420


def api(host, **params):
    params.update(format="json", action="query")
    url = f"https://{host}/w/api.php?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def first_page(body):
    pages = body.get("query", {}).get("pages", {})
    for pid, page in pages.items():
        if pid != "-1":
            return page
    return None


def commons_file(filename):
    """اسم ملف على كومنز → رابط بعرض مناسب + مؤلفه ورخصته."""
    body = api("commons.wikimedia.org", titles="File:" + filename,
               prop="imageinfo", iiprop="url|extmetadata", iiurlwidth=900)
    page = first_page(body)
    if not page or "imageinfo" not in page:
        return None
    info = page["imageinfo"][0]
    meta = info.get("extmetadata", {})
    strip = lambda k: (meta.get(k, {}).get("value") or "").strip()
    return {"url": info.get("thumburl") or info.get("url"),
            "page": info.get("descriptionshorturl") or info.get("descriptionurl"),
            "artist": strip("Artist"), "license": strip("LicenseShortName")}


def name_variants(name_en):
    """«Bali (Denpasar)» تُطرق بأبوابها الثلاثة: كاملة، وقبل القوس، وداخله."""
    variants = [name_en]
    if "(" in name_en:
        outer = name_en.split("(")[0].strip()
        inner = name_en[name_en.find("(") + 1:name_en.rfind(")")].strip()
        variants += [outer, inner]
    return [v for v in dict.fromkeys(variants) if v]


def lookup(name_en, skip_banner=False):
    """أين صورة هذه المدينة؟ غلاف Wikivoyage أولًا ثم صورة Wikipedia."""
    for variant in name_variants(name_en):
        found = lookup_one(variant, skip_banner)
        if found:
            return found
    return None


def lookup_one(name_en, skip_banner=False):
    try:
        if skip_banner:
            raise Exception("banner skipped")
        body = api("en.wikivoyage.org", titles=name_en, redirects=1,
                   prop="pageprops")
        page = first_page(body)
        banner = (page or {}).get("pageprops", {}).get("wpb_banner")
        if banner and "default" not in banner.lower():
            found = commons_file(banner)
            if found:
                found["source"] = "wikivoyage-banner"
                return found
    except Exception:
        pass
    try:
        body = api("en.wikipedia.org", titles=name_en, redirects=1,
                   prop="pageimages", piprop="original|name")
        page = first_page(body)
        orig = (page or {}).get("original")
        name = (page or {}).get("pageimage", "")
        if orig and not name.lower().endswith(".svg"):
            found = commons_file(name) or {}
            found.setdefault("url", orig["source"])
            found["source"] = "wikipedia-pageimage"
            return found
    except Exception:
        pass
    return None


def save(city_id, url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        raw = r.read()
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    # قصٌ للمركز على نسبة الغلاف ثم تصغير — لا تمديد أبدًا.
    ratio = W / H
    w, h = img.size
    if w / h > ratio:
        nw = int(h * ratio)
        img = img.crop(((w - nw) // 2, 0, (w + nw) // 2, h))
    else:
        nh = int(w / ratio)
        top = max(0, int(h * 0.18) - 0)     # البانورامات: القص من الأعلى قليلًا
        top = min(top, h - nh)
        img = img.crop((0, top, w, top + nh))
    img = img.resize((W, H), Image.LANCZOS)
    img.save(OUT / f"{city_id}.jpg", "JPEG", quality=78, optimize=True)


def main():
    OUT.mkdir(exist_ok=True)
    credits = json.loads(CREDITS.read_text()) if CREDITS.exists() else {}
    cities = json.loads((ROOT / "app/data/bundle.json").read_text())["cities"]
    skip_banner_ids = set()
    blockfile = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else None
    if blockfile and blockfile.exists():
        skip_banner_ids = set(json.loads(blockfile.read_text()))
    got = missed = 0
    for i, city in enumerate(cities):
        cid, name = city["id"], city.get("name_en")
        if not name or (OUT / f"{cid}.jpg").exists():
            continue
        found = lookup(name, skip_banner=cid in skip_banner_ids)
        if not found or not found.get("url"):
            missed += 1
            print(f"  · {name}: لا صورة", flush=True)
            continue
        try:
            save(cid, found["url"])
            credits[cid] = {"name_en": name, "source": found.get("source"),
                            "page": found.get("page"), "artist": found.get("artist"),
                            "license": found.get("license")}
            got += 1
            if got % 25 == 0:
                print(f"[{i+1}/{len(cities)}] fetched={got} missed={missed}", flush=True)
                CREDITS.write_text(json.dumps(credits, ensure_ascii=False, indent=1))
        except Exception as e:
            missed += 1
            print(f"  · {name}: {e}", flush=True)
        time.sleep(0.15)
    CREDITS.write_text(json.dumps(credits, ensure_ascii=False, indent=1))
    print(f"DONE fetched={got} missed={missed} total_on_disk="
          f"{len(list(OUT.glob('*.jpg')))}", flush=True)


if __name__ == "__main__":
    main()
