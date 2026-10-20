"""Fail CI if displayed and accepted document text diverges."""
import ast
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
directory = root / 'apps/web/src/features/policies'
agreement = json.loads((directory / 'storageAgreement.ts').read_text(encoding='utf-8').split('export const storageAgreement = ', 1)[1])
parts = [agreement['title'], 'Version ' + agreement['version'], 'Effective date: ' + agreement['effectiveDate'], *agreement['intro']]
for section in agreement['sections']:
    parts.append(section['title'])
    if 'table' in section:
        parts.extend([' | '.join(section['table']['headers']), *[' | '.join(row) for row in section['table']['rows']]])
    parts.extend(section['paragraphs'])
    parts.extend(section.get('items', []))
retained = (root / 'apps/api/portal/agreement_2026_10_19.txt').read_text(encoding='utf-8')
if '\n\n'.join(parts) != retained:
    raise SystemExit('The public agreement differs from the version retained by enrollment.')
module = ast.parse((root / 'apps/api/portal/agreement.py').read_text(encoding='utf-8'))
packing = next(ast.literal_eval(node.value) for node in module.body if isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id == 'PACKING' for target in node.targets))
displayed = json.loads((directory / 'packingPolicy.ts').read_text(encoding='utf-8').split('export const packingPolicy = ', 1)[1])
if displayed['sections'][0]['paragraphs'] != packing.splitlines()[1:] or displayed['version'] != agreement['version']:
    raise SystemExit('The public packing policy differs from the version retained by enrollment.')
print('Displayed and retained agreement/packing documents match.')
