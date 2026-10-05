"""Build compact browser data and first-paint covers from the reviewed archive."""
import json
import hashlib
import re
import struct
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]

def dimensions(path):
    data=path.read_bytes()
    if data[12:16]==b'VP8 ' and data[23:26]==b'\x9d\x01\x2a':
        width,height=struct.unpack_from('<HH',data,26)
        return width&0x3fff,height&0x3fff
    if data[12:16]==b'VP8X':
        return 1+int.from_bytes(data[24:27],'little'),1+int.from_bytes(data[27:30],'little')
    if data[12:16]==b'VP8L' and data[20]==0x2f:
        bits=int.from_bytes(data[21:25],'little')
        return (bits&0x3fff)+1,((bits>>14)&0x3fff)+1
    raise ValueError(f'Unsupported WebP header: {path}')

def main():
    records=[]
    for report in json.loads((ROOT/'dist/reports.json').read_text())['reports']:
        record={key:report[key] for key in ['id','company','cik','year','tickers','cover','color','pdf']}
        record['width'],record['height']=dimensions(ROOT/'dist'/report['cover'])
        records.append(record)
    (ROOT/'dist/catalog.json').write_text(json.dumps({'reports':records},separators=(',',':'))+'\n')
    featured=next((r for r in records if r['cik']=='886982' and r['year']==2024),records[0])
    neighbors=sorted((r for r in records if r['id']!=featured['id']),key=lambda r:(sum((a-b)**2 for a,b in zip(r['color'],featured['color'])),r['id']))[:12]
    bootstrap=json.dumps({'featured':[featured,*neighbors],'initial':records[:48]},separators=(',',':'))
    tag=f'<script id="initial-reports" type="application/json">{bootstrap.replace("<", chr(92)+"u003c")}</script>'
    page=ROOT/'dist/index.html'
    html=re.sub(r'<script id="initial-reports".*?</script>\n?', '',page.read_text(),flags=re.S)
    html=re.sub(r'<script id="priority-cover".*?</script>\n?', '',html,flags=re.S)
    for source in ['app.mjs','style.css']:
        stem,ext=source.split('.')
        content=(ROOT/'dist'/source).read_bytes()
        asset=f'{stem}-{hashlib.sha256(content).hexdigest()[:12]}.{ext}'
        for old in (ROOT/'dist').glob(f'{stem}-*.{ext}'):
            old.unlink()
        (ROOT/'dist'/asset).write_bytes(content)
        html=re.sub(rf'{stem}(?:-[a-f0-9]{{12}})?\.{ext}',asset,html)
    preload=f'<script id="priority-cover">const priorityCover=document.createElement("link");priorityCover.rel="preload";priorityCover.as="image";priorityCover.href=document.documentElement.dataset.view==="all"?{json.dumps(records[0]["cover"])}:{json.dumps(featured["cover"])};priorityCover.fetchPriority="high";document.head.append(priorityCover);</script>'
    page.write_text(html.replace('</head>',preload+'</head>').replace('</body>',tag+'\n</body>'))
    print(f'Built {len(records)} catalog entries and 13 featured / 48 initial covers')

if __name__=='__main__':
    main()
