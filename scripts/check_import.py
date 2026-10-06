from import_reports import is_plain_form
heading = 'UNITED STATES SECURITIES AND EXCHANGE COMMISSION FORM 10-K'
assert is_plain_form(heading, {'chromaticFraction': .02})
assert not is_plain_form(heading, {'chromaticFraction': .5})
assert not is_plain_form('2024 Annual Report — Typography', {'chromaticFraction': .02})
print('PASS: plain SEC form excluded; colorful and monochrome designed cover counterexamples preserved')

assert is_plain_form('SECURITIES AND EXCHANGE COMMISSION FORM 10‑K', {'chromaticFraction':.02})

# Regression: a broken PDF character map cannot bypass the plain-form check.
import tempfile
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import import_archive

with tempfile.TemporaryDirectory() as folder:
    cache=Path(folder)
    (cache/'sample.page1.txt').write_text(('\x01\x17garbled\x19\x04 '*20))
    (cache/'sample.jpg').write_bytes(b'ocr-fixture')
    with patch.object(import_archive,'CACHE',cache), patch.object(import_archive,'cover_features',return_value={'color':[225,225,225],'chromaticFraction':0}), patch.object(import_archive.subprocess,'run',return_value=SimpleNamespace(stdout=heading.encode())) as ocr:
        try:
            import_archive.finish({'id':'sample','cover':'sample.webp','year':2025})
            raise AssertionError('garbled plain form was accepted')
        except ValueError as error:
            assert str(error)=='plain SEC form first page'
        assert ocr.call_args.args[0][0]=='tesseract'
print('PASS: garbled PDF text invokes local OCR and the plain form is rejected')

with tempfile.TemporaryDirectory() as folder:
    with patch.object(import_archive,'CACHE',Path(folder)), patch.object(import_archive,'get',side_effect=RuntimeError('curl connection failed')) as download:
        try:
            import_archive.archive_report(({'cik_str':1,'title':'Example','tickers':['TEST'],'exchanges':['NYSE']},2020))
            raise AssertionError('transport failure was hidden as an absent report')
        except RuntimeError as error:
            assert 'archive download failed' in str(error)
        assert download.call_count==1
print('PASS: archive transport errors remain distinguishable from absent documents')

# A PDF viewer clips this fixture to 290x390; MediaBox rendering would be 300x400.
import import_reports
from build_gallery import dimensions
import json
with tempfile.TemporaryDirectory() as folder:
    root=Path(folder);(root/'dist/covers').mkdir(parents=True);cache=root/'cache';cache.mkdir()
    stream=b'0 0 1 rg 0 0 290 390 re f'
    objects=[b'<< /Type /Catalog /Pages 2 0 R >>',b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /CropBox [0 10 290 400] /Resources << >> /Contents 4 0 R >>',b'<< /Length '+str(len(stream)).encode()+b' >>\nstream\n'+stream+b'\nendstream']
    pdf=b'%PDF-1.4\n';offsets=[0]
    for i,obj in enumerate(objects,1):
        offsets.append(len(pdf));pdf+=str(i).encode()+b' 0 obj\n'+obj+b'\nendobj\n'
    xref=len(pdf);pdf+=b'xref\n0 5\n0000000000 65535 f \n'+b''.join(f'{offset:010d} 00000 n \n'.encode() for offset in offsets[1:])+f'trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF'.encode()
    def fixture_get(url,path=None):
        data=pdf if url.endswith('.pdf') else (json.dumps({'stateOfIncorporation':'DE','tickers':['TEST']}).encode() if 'submissions' in url else b'Period of Report</div><div>2024-12-31<a href="cover.pdf">PDF</a>')
        if path:path.write_bytes(data)
        return data
    with patch.object(import_reports,'ROOT',root),patch.object(import_reports,'CACHE',cache),patch.object(import_reports,'get',side_effect=fixture_get):
        record=import_reports.import_one(('1','Example','ARS','2025-01-01','edgar/data/1/0000000001-25-000001.txt'))
    width,height=dimensions(root/'dist'/record['cover'])
    assert height==900 and abs(width-900*290/390)<1,(width,height)
    assert record['cover'].endswith('-crop.webp')
print('PASS: real PDF extraction uses visible CropBox and a new immutable asset URL')
