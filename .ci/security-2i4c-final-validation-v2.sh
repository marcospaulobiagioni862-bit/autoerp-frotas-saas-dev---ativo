#!/usr/bin/env bash
set -euo pipefail

OLD_CANDIDATE='2288ee011415f69f011f6b21fb16db96d1e24196'
NEW_CANDIDATE='87f0f4a4ae92cf920c8a482323565bbf71377fd9'
OLD_TREE='036909fab49f8532aa8b83cc2576b51f7d9e2004'
NEW_TREE='a165a21d66f6c2e7500880f6e857272a0ebd2080'
BASE='68b2ab0315bfb9e77cacb760b8f1bffdb4034357'

# Keep the independently established final matrix, but bind it to the corrected
# consolidated candidate and the one additional runtime-cycle file.
git show origin/ci-validate-security-2i4c-final:.ci/security-2i4c-final-validation.sh > /tmp/i4c-final-original.sh

python - <<'PY'
from pathlib import Path
p = Path('/tmp/i4c-final-original.sh')
s = p.read_text()

replacements = [
    ("CANDIDATE=\"2288ee011415f69f011f6b21fb16db96d1e24196\"", "CANDIDATE=\"87f0f4a4ae92cf920c8a482323565bbf71377fd9\""),
    ("TREE=\"036909fab49f8532aa8b83cc2576b51f7d9e2004\"", "TREE=\"a165a21d66f6c2e7500880f6e857272a0ebd2080\""),
    (
        "  src/domain/contracts/contractTemplatePolicy.ts \\\n  src/domain/finance/ITransactionContext.ts \\\n",
        "  src/domain/contracts/contractTemplatePolicy.ts \\\n  src/domain/finance/FinanceEngine.ts \\\n  src/domain/finance/ITransactionContext.ts \\\n",
    ),
]
for old, new in replacements:
    count = s.count(old)
    if count != 1:
        raise SystemExit(f'final wrapper replacement precondition failed: expected 1, got {count}: {old!r}')
    s = s.replace(old, new)

anchor = "if grep -R -F 'signatureRequired: false' src/server/contractRoutes.ts; then exit 1; fi\n"
extra = """if grep -F \"import { TrafficTicketService } from '../services/TrafficTicketService';\" src/domain/finance/FinanceEngine.ts; then exit 1; fi
if grep -F 'private static trafficTicketService' src/domain/finance/FinanceEngine.ts; then exit 1; fi
test \"$(grep -Fc \"await import('../services/TrafficTicketService')\" src/domain/finance/FinanceEngine.ts)\" = \"2\"
"""
if s.count(anchor) != 1:
    raise SystemExit('final wrapper static-gate anchor missing')
s = s.replace(anchor, anchor + extra)
Path('/tmp/i4c-final-v2.sh').write_text(s)
PY

chmod +x /tmp/i4c-final-v2.sh
grep -F "CANDIDATE=\"$NEW_CANDIDATE\"" /tmp/i4c-final-v2.sh >/dev/null
grep -F "TREE=\"$NEW_TREE\"" /tmp/i4c-final-v2.sh >/dev/null
grep -F 'src/domain/finance/FinanceEngine.ts' /tmp/i4c-final-v2.sh >/dev/null
grep -F "await import('../services/TrafficTicketService')" /tmp/i4c-final-v2.sh >/dev/null

test "$(git rev-parse HEAD)" = "$NEW_CANDIDATE"
test "$(git rev-parse HEAD^{tree})" = "$NEW_TREE"
test "$(git rev-parse HEAD^)" = "$BASE"
test "$(git rev-list --count "$BASE"..HEAD)" = "1"

/tmp/i4c-final-v2.sh
