from pathlib import Path
p = Path('.ci/security-2i1b-validation.ts')
text = p.read_text(encoding='utf-8')
text = text.replace("import { spawn } from 'node:child_process';", "import { spawn } from 'node:child_process';\nimport { createHash } from 'node:crypto';")
text = text.replace("'km-init-' + requireMd5('company-i1b-a:veh-preexisting')", "'km-init-' + createHash('md5').update('company-i1b-a:veh-preexisting').digest('hex')")
start = text.find("\nfunction requireMd5(value: string): string {")
if start >= 0:
    end = text.find("\n}\n\nasync function login", start)
    if end < 0:
        raise SystemExit('requireMd5 end not found')
    text = text[:start] + "\n\nasync function login" + text[end + len("\n}\n\nasync function login"):]
p.write_text(text, encoding='utf-8')
