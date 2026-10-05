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
