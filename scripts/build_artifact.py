import base64, re, pathlib

root = pathlib.Path('.')
html = (root/'index.html').read_text(encoding='utf-8')
css  = (root/'css/styles.css').read_text(encoding='utf-8')
js   = (root/'js/main.js').read_text(encoding='utf-8')

# broaden the Hebrew font stack since the webfont CDN is blocked in the sandbox
css = css.replace('"Heebo", system-ui, "Segoe UI", Arial, sans-serif',
                  '"Heebo","Assistant","Arimo","Segoe UI",system-ui,Arial,sans-serif')

# embed images as data URIs
def data_uri(p):
    b = (root/'assets'/p).read_bytes()
    return 'data:image/webp;base64,' + base64.b64encode(b).decode()

for name in ['hero-flow.webp','process-before-after.webp','systems-devices.webp']:
    html = html.replace(f'assets/{name}', data_uri(name))

# extract body inner
body = re.search(r'<body>(.*)</body>', html, re.S).group(1)
# drop the external script tag (we inline js)
body = re.sub(r'<script src="js/main.js"[^>]*></script>', '', body)

out = f'''<title>FLOA | תצוגה חיה</title>
<style>
{css}
</style>
<script>
document.documentElement.setAttribute('dir','rtl');
document.documentElement.setAttribute('lang','he');
</script>
{body}
<script>
{js}
</script>
'''
target = pathlib.Path('/tmp/claude-0/-home-user-floa/76fbfda3-685e-570f-972b-4456fc9d8091/scratchpad/floa-preview.html')
target.parent.mkdir(parents=True, exist_ok=True)
target.write_text(out, encoding='utf-8')
print('wrote', target, len(out), 'bytes')
