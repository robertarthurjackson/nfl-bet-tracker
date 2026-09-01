"""Turn the demo-dist build into a single artifact-ready HTML fragment:
inline the one JS chunk and CSS file, strip the document wrapper."""
import re, glob, sys

s = open('demo-dist/index.html').read()
title = re.search(r'<title>(.*?)</title>', s).group(1)
css = "\n".join(open(f).read() for f in glob.glob('demo-dist/assets/*.css')).replace('\ufffd', '\\fffd ')
js_files = glob.glob('demo-dist/assets/*.js')
assert len(js_files) == 1, f"expected one chunk, got {js_files}"
js = open(js_files[0]).read().replace('\ufffd', '\\ufffd')  # literal U+FFFD (parser sentinels) -> JS escape; only occurs in string/regex literals
body = re.search(r'<body>(.*?)</body>', s, re.S).group(1)
body = re.sub(r'<script[^>]*>.*?</script>', '', body, flags=re.S).strip()
out = (f'<title>{title}</title>\n<style>:root{{color-scheme:dark}}\n{css}</style>\n'
       f'{body}\n<script type="module">\n{js}\n</script>\n')
open('demo-dist/nfl-bet-tracker-demo.html', 'w').write(out)
print("fragment KB:", len(out)//1024, "| title:", title)
