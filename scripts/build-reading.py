#!/usr/bin/env python3
"""Build the static reading list page from data/books.yml and the Google Books cache.

Usage: build-reading.py OUTPUT_HTML

Source of truth is data/books.yml (isbn, rating, title, optional shelf override).
Authors and categories come from data/google-books/<isbn>.json and are never invented.
Books whose ISBN has no cache entry, or whose entry has no author, are listed on stderr.
"""

import html
import json
import re
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
BOOKS = ROOT / 'data' / 'books.yml'
CACHE = ROOT / 'data' / 'google-books'

SHELVES = [
    ('software', 'Software engineering'),
    ('science', 'Science and philosophy'),
    ('other', 'Everything else'),
]

SOFTWARE_PREFIXES = ('computer', 'software', 'programming', 'machine learning',
                     'distributed operating', 'technology', 'design')
SCIENCE_PREFIXES = ('philosophy', 'science', 'psychology', 'psychotherapy', 'mathematics',
                    'geometry', 'religion', 'meditations', 'conduct of life', 'medical')


def shelf_for(category):
    c = (category or '').lower()
    if c.startswith(SOFTWARE_PREFIXES):
        return 'software'
    if c.startswith(SCIENCE_PREFIXES):
        return 'science'
    return 'other'


def clean_title(raw):
    """Normalise whitespace and move a trailing ', The' to the front."""
    t = re.sub(r'\s+', ' ', raw).strip()
    m = re.match(r'^(.*?), (The|A|An)(?=[:,(]|$)(.*)$', t)
    if m:
        t = f'{m.group(2)} {m.group(1)}{m.group(3)}'
    return t


def display_title(full):
    """Strip the subtitle and any trailing series or edition note."""
    t = re.split(r'\s*:\s', full, maxsplit=1)[0]
    t = re.sub(r'\s*\([^)]*\)\s*$', '', t)
    t = re.sub(r',\s*\d+(st|nd|rd|th) Edition$', '', t, flags=re.I)
    if t.isupper():
        t = t.title()
    return t.strip()


def load_books():
    books = yaml.safe_load(BOOKS.read_text())['books']
    unresolved = []
    out = []
    for b in books:
        isbn = str(b['isbn'])
        path = CACHE / f'{isbn}.json'
        info = json.loads(path.read_text()) if path.exists() else None
        authors = (info or {}).get('authors') or []
        category = ((info or {}).get('categories') or [None])[0]
        if info is None:
            unresolved.append((isbn, b['title'], 'no Google Books record'))
        elif not authors:
            unresolved.append((isbn, b['title'], 'record has no author'))
        full = clean_title(b['title'])
        out.append({
            'isbn': isbn,
            'full': full,
            'title': display_title(full),
            'author': ', '.join(authors),
            'rating': int(b.get('rating') or 0),
            'shelf': b.get('shelf') or shelf_for(category),
        })
    # Volumes of a series collapse to the same title once the subtitle goes; keep theirs
    counts = {}
    for b in out:
        counts[b['title']] = counts.get(b['title'], 0) + 1
    for b in out:
        if counts[b['title']] > 1:
            b['title'] = re.sub(r'\s*\([^)]*\)\s*$', '', b['full'])
    return out, unresolved


CSS = """
*{margin:0;padding:0;box-sizing:border-box}

body{color:#000;background:#7390bd;font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:16px;font-weight:100;font-style:italic;line-height:1.4;padding:20px 20px 60px;min-height:100vh}
a{color:inherit;text-decoration:none}
#fog{position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:-1}
a:focus-visible{outline:2px solid rgba(0,0,0,.5);outline-offset:4px;border-radius:4px}
main{max-width:1200px;margin:0 auto}
h1,h2{color:#fff;text-shadow:0 1px 2px rgba(20,30,50,.35),0 0 18px rgba(20,30,50,.45)}
.home{color:#1c2433;display:inline-block;font-size:18px;letter-spacing:.05em;text-transform:uppercase;transition:transform .2s ease,font-weight .2s ease}
.home:hover{font-weight:300;transform:translateX(10px)}
h1{font-size:clamp(30px,6vh,120px);font-weight:100;text-transform:uppercase;letter-spacing:.05em;line-height:1.1;margin:8vh 0 .2em}
.lede{max-width:500px;margin-bottom:8vh;line-height:1.6;font-weight:300}
section{margin-bottom:8vh}
h2{font-size:clamp(22px,4vh,60px);font-weight:100;text-transform:uppercase;letter-spacing:.05em;line-height:1.2;margin-bottom:.6em}
ol{list-style:none;max-width:640px}
li{padding:5px 0;margin-left:0;position:relative}
.stars{position:absolute;right:0;top:7px;font-size:11px;font-style:normal;letter-spacing:.15em;color:#1c2433}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.r4{margin-top:1.2em}
.t{font-weight:300;font-style:normal;transition:padding-left .2s ease}
li:hover .t{padding-left:6px}
.a{display:block;font-weight:300;color:#1c2433}
.a:empty{display:none}
h3{font-size:16px;font-weight:300;letter-spacing:.05em;text-transform:uppercase;color:#1c2433;margin:1.6em 0 .6em}
.unresolved{opacity:.7;max-width:640px}
@media(min-width:769px){section{display:grid;grid-template-columns:1fr 2fr;gap:0 40px}h2{grid-column:1;position:sticky;top:20px}.list{grid-column:2}}
@media(prefers-reduced-motion:reduce){.home,.t{transition:none}}
"""


def render(books, unresolved):
    e = html.escape

    def title_span(b):
        full = f' title="{e(b["full"])}"' if b['full'] != b['title'] else ''
        return f'<span class="t"{full}>{e(b["title"])}</span>'
    sections = []
    for key, name in SHELVES:
        on_shelf = [b for b in books if b['shelf'] == key]
        rows = []
        for rating in (5, 4, 3):
            group = [b for b in on_shelf if b['rating'] == rating]
            if not group:
                continue
            cls = ' class="r4"' if rating < 5 and rows else ''
            stars = (f'<span class="stars" aria-hidden="true">{"★" * rating}{"☆" * (5 - rating)}</span>'
                     f'<span class="sr">Rated {rating} of 5.</span>')
            for n, b in enumerate(group):
                rows.append(f'<li{cls if n == 0 else ""} data-rating="{rating}">'
                            f'{title_span(b)}'
                            f'{stars if n == 0 else ""}'
                            f'<span class="a">{e(b["author"])}</span></li>')
        rated = f'<ol>{"".join(rows)}</ol>' if rows else ''
        unrated = [b for b in on_shelf if not b['rating']]
        also = ''
        if unrated:
            items = ''.join(
                f'<li>{title_span(b)}'
                f'<span class="a">{e(b["author"])}</span></li>' for b in unrated)
            also = f'<h3>Also on the shelf</h3><ol>{items}</ol>'
        sections.append(f'<section aria-labelledby="{key}"><h2 id="{key}">{e(name)}</h2>'
                        f'<div class="list">{rated}{also}</div></section>')

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="description" content="Stephen Williams's reading list: the software engineering canon, physics and philosophy, rated.">
<title>Reading — Stephen Williams</title>
<meta name="theme-color" content="#7390bd">
<meta property="og:type" content="website">
<meta property="og:url" content="https://onato.com/reading/">
<meta property="og:title" content="Reading — Stephen Williams">
<meta property="og:description" content="Stephen Williams's reading list: the software engineering canon, physics and philosophy, rated.">
<link rel="icon" href="/favicon.ico" type="image/x-icon">
<style>{CSS.strip()}</style>
</head>
<body>
<canvas id="fog"></canvas>
<script src="/fog-renderer.js" defer></script>
<script defer>
window.addEventListener('load', function () {{ requestAnimationFrame(function () {{ new FogRenderer(document.getElementById('fog')); }}); }});
</script>
<main>
<a class="home" href="/">← Stephen Williams</a>
<h1>And reads</h1>
<p class="lede">Mostly the well-regarded software engineering books, with a long-running interest in philosophy
and how the mind works.</p>
{"".join(sections)}
</main>
</body>
</html>
"""


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    out = Path(sys.argv[1])
    books, unresolved = load_books()
    out.parent.mkdir(parents=True, exist_ok=True)
    page = render(books, unresolved)
    out.write_text(page)
    counts = {k: sum(1 for b in books if b['shelf'] == k) for k, _ in SHELVES}
    print(f'    {out} ({len(page.encode()):,} bytes): {len(books)} books, shelves {counts}')
    for isbn, title, why in unresolved:
        print(f'    ⚠️  unresolved {isbn} {title!r}: {why}', file=sys.stderr)


if __name__ == '__main__':
    main()
