"""Coarse dominant cover color from a 32x32 image sample, excluding white margins."""
import colorsys, collections, json, subprocess, tempfile, re
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]

def cover_features(path):
    ppm = subprocess.run(['dwebp', str(path), '-ppm', '-o', '-'], capture_output=True, check=True).stdout
    header = re.match(rb'P6\s+(?:#[^\n]*\n\s*)?(\d+)\s+(\d+)\s+255\s', ppm)
    if not header:
        raise ValueError('Invalid PPM image')
    width,height = map(int,header.groups())
    raw = ppm[header.end():]
    pixels = bytearray()
    for y in range(32):
        for x in range(32):
            index=(min(height-1,int((y+.5)*height/32))*width+min(width-1,int((x+.5)*width/32)))*3
            pixels.extend(raw[index:index+3])
    chromatic, neutral = collections.defaultdict(list), collections.defaultdict(list)
    for i in range(0, len(pixels), 3):
        rgb = tuple(pixels[i:i+3])
        h,s,v = colorsys.rgb_to_hsv(*(c/255 for c in rgb))
        if s > .2 and v > .15:
            chromatic[int(h*16)].append(rgb)
        elif v < .9:
            neutral[int(v*8)].append(rgb)
    # ponytail: coarse hue buckets describe the cover palette, not semantic design similarity.
    bins = chromatic if sum(map(len, chromatic.values())) > 20 else neutral
    if not bins:
        return {'color':[245,245,245], 'chromaticFraction':0}
    values = max(bins.values(), key=len)
    return {'color':[round(sum(p[c] for p in values)/len(values)) for c in range(3)], 'chromaticFraction':sum(map(len,chromatic.values()))/(len(pixels)/3)}

if __name__ == '__main__':
    path=ROOT/'dist/reports.json'
    data=json.loads(path.read_text())
    for report in data['reports']:
        report.update(cover_features(ROOT/'dist'/report['cover']))
    path.write_text(json.dumps(data,indent=2)+'\n')
    print('Extracted colors for',len(data['reports']),'covers')
