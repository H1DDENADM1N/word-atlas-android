"""Import IELTS exam sentences from 雅思真题例句词典 into the atlas.

The dictionary ships as an MDict pair:

  * `雅思真题例句词典.mdx` — Cambridge-style entries. Each entry carries an
    `.ex-area` full of `<div class="ex-pl" data-id="C04T1L1_S04">` placeholders:
    which sentences quote this headword, but not the sentences themselves.
  * `雅思真题例句词典.mdd` — resources, and inside it the missing `data.js`:
    `var iaesd_data = [{id, en, zh, qu}, …]`, one row per sentence id.

Both containers are MDict 2.0: a UTF-16 header, then zlib streams. Rather than
reimplementing the key/record index, this walks the file and keeps every stream
that decompresses — the entries are one big HTML blob, the sentences one JS
literal. That is enough for a one-off import and does not depend on the
dictionary's index layout staying put.

Output: `public/atlas/ielts.json`

    {"v": 1, "pool": {"C04T1L1_S04": ["en", "zh", "C04T1L1"]},
     "words": {"library": ["C04T1L1_S04", …]}}

Sentences live once in `pool`; `words` maps an atlas entry id to the ids that
quote it, best first. Keeping the two apart matters: 23k links point at barely
1.2k sentences, so inlining the text per word would multiply the file by eight.

Usage: python3 scripts/atlas/import_ielts.py [--dict DIR] [--per-word N]

Every quote is kept by default. An earlier build capped each entry at four and
then at twenty, which looked like the importer was losing sentences — it was
not, it was obeying the cap, and the cap is what hid 8 of the 14 sentences for
"increase". Do not reintroduce a cap without a visible reason in the UI.
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


def streams(path: Path):
    """Yield every zlib stream in an MDict file, in file order."""
    d = path.read_bytes()
    n = len(d)
    i = 0
    while i < n - 2:
        if d[i] == 0x78 and d[i + 1] in ZLIB_MAGIC:
            try:
                z = zlib.decompressobj()
                out = z.decompress(d[i : i + 400000])
                if out and not z.unconsumed_tail:
                    used = len(d[i : i + 400000]) - len(z.unused_data)
                    yield out
                    i += used
                    continue
            except zlib.error:
                pass
        i += 1


def read_sentences(mdd: Path):
    for blob in streams(mdd):
        if blob.lstrip().startswith(b"var iaesd_data"):
            text = blob.decode("utf-8")
            rows = json.loads(text[text.index("[") : text.rindex("]") + 1])
            return {r["id"]: r for r in rows}
    raise SystemExit(f"no iaesd_data found in {mdd}")


def read_links(mdx: Path):
    """headword -> [sentence id, …] from the `.ex-pl` placeholders."""
    hw = re.compile(r'<span class="hw">(.*?)</span>', re.S)
    ex = re.compile(r'<div class="ex-pl" data-id="([A-Za-z0-9_]+)"')
    links = {}
    for blob in streams(mdx):
        if b'class="entry"' not in blob:
            continue
        for seg in blob.decode("utf-8", "replace").split('<div class="entry">')[1:]:
            m = hw.search(seg)
            if not m:
                continue
            word = html.unescape(re.sub(r"<[^>]+>", "", m.group(1))).strip().lower()
            ids = ex.findall(seg)
            if ids:
                links.setdefault(word, []).extend(ids)
    return links


def source_of(sid: str) -> str:
    """C04T1L1_S04 -> C04T1L1."""
    return sid.split("_")[0]


def quotes(text: str, word: str) -> bool:
    """Does the sentence actually contain this word?

    The dictionary also links sentences that only use a cousin — `ex-match-der`
    turns `visitor` into a sentence about "a variety of shopping", `climate`
    into one about "climatic change". A card that shows those under the
    headword looks broken, so a link survives only if the word is on the page.

    Inflections have to be enumerated rather than matched by prefix: English
    drops the final `e` before `-ing` (increase -> increasing, not
    "increaseing") and turns `y` into `i` (study -> studies). A `word +
    up to three letters` rule misses both, which is how `increase` lost
    "increasing numbers of Australian doctors" and half its other quotes.
    """
    return any(re.search(rf"(?<![a-z]){re.escape(f)}(?![a-z])", text.lower()) for f in forms(word))


def exact(text: str, word: str) -> bool:
    """Is the headword itself on the page, not just an inflection of it?"""
    return re.search(rf"(?<![a-z]){re.escape(word.lower())}(?![a-z])", text.lower()) is not None


def forms(word: str) -> set[str]:
    """The surface forms of a word that a sentence may legitimately use."""
    w = word.lower()
    out = {w, w + "s", w + "es", w + "ed", w + "d", w + "ing", w + "er", w + "est",
           w + "ly", w + "ness", w + "ment", w + "able", w + "tion"}
    if w.endswith("e"):
        b = w[:-1]
        out |= {b + "ing", b + "ed", b + "es", b + "er", b + "est", b + "ation",
                b + "able", b + "ion", b + "ingly", b + "ance", b + "ant"}
    if w.endswith("y"):
        b = w[:-1]
        out |= {b + "ies", b + "ied", b + "ier", b + "iest", b + "ily", b + "iness", b + "ication"}
    if w.endswith("ic"):
        out.add(w + "al")
    # stop -> stopped / stopping, run -> running: a consonant doubles after a
    # short vowel.
    if len(w) >= 3 and w[-1] not in "aeiouwy" and w[-2] in "aeiou" and w[-3] not in "aeiou":
        out |= {w + w[-1] + "ed", w + w[-1] + "ing", w + w[-1] + "er"}
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dict", default=str(ROOT / "雅思真题例句词典"))
    ap.add_argument("--per-word", type=int, default=0, help="cap per entry; 0 keeps every quote")
    a = ap.parse_args()

    folder = Path(a.dict)
    mdx, mdd = folder / "雅思真题例句词典.mdx", folder / "雅思真题例句词典.mdd"
    sentences = read_sentences(mdd)
    links = read_links(mdx)
    print(f"{len(sentences)} sentences · {len(links)} headwords with quotes")

    index = json.loads((PUB / "index.json").read_text(encoding="utf-8"))
    pool, words, hits, refs = {}, {}, 0, 0
    for row in index["words"]:
        eid, word = row[0], row[1].lower()
        ids = links.get(word)
        if not ids:
            continue
        # One sentence can be quoted by many entries; keep the id once. A
        # sentence with the headword itself comes before one that only carries
        # an inflection, then the shortest — a card has room for a line, not a
        # paragraph — and 命题句 (qu=T, what the question actually tested) ahead
        # of transcript filler of the same length.
        picked = sorted(
            {sid for sid in ids if sentences.get(sid, {}).get("en") and quotes(sentences[sid]["en"], word)},
            key=lambda s: (
                not exact(sentences[s]["en"], word),
                len(sentences[s]["en"]),
                sentences[s].get("qu") != "T",
                s,
            ),
        )
        if a.per_word:
            picked = picked[: a.per_word]
        if not picked:
            continue
        hits += 1
        words[eid] = picked
        refs += len(picked)
        for sid in picked:
            if sid not in pool:
                s = sentences[sid]
                pool[sid] = [s["en"].strip(), (s.get("zh") or "").strip(), source_of(sid)]

    out = {"v": 1, "source": "雅思真题例句词典 v4.3.4", "pool": pool, "words": words}
    target = PUB / "ielts.json"
    target.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{hits}/{len(index['words'])} entries covered · {refs} refs · {len(pool)} sentences · {target.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
