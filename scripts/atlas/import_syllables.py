"""Import syllable breaks from OALDPEX into the atlas.

OALDPEX is an MDict pair: `oaldpex.mdx` holds the entries, `oaldpex.1-3.mdd`
the 6.8 GB of audio and pictures. The syllable data we want is an attribute on
the headword element, and the dictionary's own `oaldpex.js` does the same thing
this app is about to do:

    const $headword = $(this).children(".headword");
    const syllable = $headword.attr("syllable");
    const headword = $headword.attr("headword");
    // click -> swap the text between `headword` and `syllable`

So an entry looks like

    <h1 class="headword" id="exhibition_h_1" syllable="ex·hib·ition" headword="exhibition">exhibition</h1>

with `·` (U+00B7) between the syllables. Two things are worth knowing before
using it:

  * The attribute only exists on part of the dictionary — 29,285 of 68,927
    headwords. Monosyllables have nothing to split, but plenty of ordinary
    two- and three-syllable words (`hotel`, `river`, `city`) are simply
    missing it. Of the atlas' 7,298 entries, 4,658 are covered.
  * Where it exists it is sometimes sparser than a print dictionary would be:
    `com·puter` rather than `com·put·er`, `ele·phant` rather than
    `el·e·phant`. That is the dictionary's own house style, and this importer
    reproduces it verbatim instead of second-guessing it. A model trained on
    the same data reproduces only ~82% of even the two-syllable breaks, which
    is not good enough to invent the missing third of the word list.

Output: `public/atlas/syllables.json`

    {"v": 1, "source": "…", "dots": {"exhibition": "ex·hib·ition"}}

Keys are atlas entry ids, values the dotted spelling.

Usage: python3 scripts/atlas/import_syllables.py [--dict DIR] [--dry]
"""
import argparse
import html
import json
import re
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PUB = ROOT / "public" / "atlas"

ZLIB_MAGIC = (0x01, 0x5E, 0x9C, 0xDA)
DOT = "\u00b7"

H1 = re.compile(r"<h1([^>]*)>(.*?)</h1>", re.S)
ATTR = re.compile(r'\b(headword|syllable)="([^"]*)"')
WORD = re.compile(r"^[A-Za-z][A-Za-z'\u2019\-]*$")


def streams(path: Path):
    """Yield every zlib stream in an MDict file, in file order."""
    d = path.read_bytes()
    n = len(d)
    i = 0
    while i < n - 2:
        if d[i] == 0x78 and d[i + 1] in ZLIB_MAGIC:
            try:
                z = zlib.decompressobj()
                out = z.decompress(d[i : i + 2000000])
                if out and not z.unconsumed_tail:
                    used = len(d[i : i + 2000000]) - len(z.unused_data)
                    yield out
                    i += used
                    continue
            except zlib.error:
                pass
        i += 1


def read_pairs(mdx: Path) -> dict[str, str]:
    """headword -> dotted spelling, for every headword that carries one."""
    out: dict[str, str] = {}
    for blob in streams(mdx):
        text = blob.decode("utf-8", "replace")
        if 'class="headword"' not in text:
            continue
        for m in H1.finditer(text):
            attrs = m.group(1)
            if 'class="headword"' not in attrs:
                continue
            found = dict(ATTR.findall(attrs))
            syl = found.get("syllable")
            if not syl:
                continue
            word = found.get("headword") or re.sub(r"<[^>]+>", "", m.group(2))
            word = html.unescape(word).strip()
            syl = html.unescape(syl).strip()
            if DOT not in syl or not WORD.match(word):
                continue
            if syl.replace(DOT, "").lower() != word.lower():
                continue
            if any(len(part) == 0 for part in syl.split(DOT)):
                continue
            out.setdefault(word.lower(), syl)
    return out


def letters(text: str) -> str:
    return re.sub(r"[^a-z]", "", text.lower())


def project(dotted: str, target: str) -> str | None:
    """Re-spell `dotted` onto `target` when both share the same letters.

    The atlas writes `o'clock`, OALD may write `o’clock`; the break positions
    are what matter, so walk the letter sequence of both and drop the dots at
    the same offsets.
    """
    if letters(dotted) != letters(target):
        return None
    want = []
    seen = 0
    for ch in dotted:
        if ch == DOT:
            want.append(seen)
        elif ch.isalpha():
            seen += 1
    out = []
    seen = 0
    for ch in target:
        if seen in want:
            out.append(DOT)
            want.remove(seen)
        out.append(ch)
        if ch.isalpha():
            seen += 1
    if want:
        return None
    return "".join(out)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dict", default=str(ROOT / "OALDPEX"))
    ap.add_argument("--dry", action="store_true", help="report, write nothing")
    a = ap.parse_args()

    pairs = read_pairs(Path(a.dict) / "oaldpex.mdx")
    by_letters: dict[str, str] = {}
    for key, val in pairs.items():
        by_letters.setdefault(letters(key), val)
    index = json.loads((PUB / "index.json").read_text(encoding="utf-8"))
    entries = index["words"]
    id_at = index["fields"].index("id")
    word_at = index["fields"].index("word")

    dots: dict[str, str] = {}
    exact = loose = 0
    for row in entries:
        eid, word = row[id_at], row[word_at]
        hit = pairs.get(word.lower())
        if hit:
            dots[eid] = hit
            exact += 1
            continue
        alt = by_letters.get(letters(word))
        if alt:
            moved = project(alt, word)
            if moved:
                dots[eid] = moved
                loose += 1

    out = {
        "v": 1,
        "source": "Oxford Advanced Learner's Dictionary (OALDPEX) syllable attribute",
        "dots": dict(sorted(dots.items())),
    }
    text = json.dumps(out, ensure_ascii=False, separators=(",", ":"))
    print(
        f"{len(pairs)} headwords with dots · {len(dots)}/{len(entries)} entries "
        f"({len(dots) / len(entries) * 100:.1f}%) · {exact} exact + {loose} re-spelled "
        f"· {len(text) // 1024} KB"
    )
    if a.dry:
        return
    (PUB / "syllables.json").write_text(text, encoding="utf-8")
    print(f"wrote {PUB / 'syllables.json'}")


if __name__ == "__main__":
    main()
