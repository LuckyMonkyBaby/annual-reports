from import_reports import is_plain_form
heading = 'UNITED STATES SECURITIES AND EXCHANGE COMMISSION FORM 10-K'
assert is_plain_form(heading, {'chromaticFraction': .02})
assert not is_plain_form(heading, {'chromaticFraction': .5})
assert not is_plain_form('2024 Annual Report — Typography', {'chromaticFraction': .02})
print('PASS: plain SEC form excluded; colorful and monochrome designed cover counterexamples preserved')

assert is_plain_form('SECURITIES AND EXCHANGE COMMISSION FORM 10‑K', {'chromaticFraction':.02})
