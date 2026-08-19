from pathlib import Path
p = Path('src/components/contracts/ContractExecutionPanel.tsx')
text = p.read_text()
old = '''          {canGenerate && !generated && (
            <Button size="sm" variant="primary" isLoading={loading} onClick={generatePdf} disabled={!selectedTemplateId}>
              <FileText className="w-4 h-4" />Gerar PDF oficial
            </Button>
          )}'''
new = '''          {canGenerate && (
            <Button size="sm" variant="primary" isLoading={loading} onClick={generatePdf} disabled={!selectedTemplateId}>
              {generated ? <RefreshCw className="w-4 h-4" /> : <FileText className="w-4 h-4" />}{generated ? 'Regenerar PDF oficial' : 'Gerar PDF oficial'}
            </Button>
          )}'''
if text.count(old) != 1:
    raise SystemExit(f'ContractExecutionPanel regenerate patch count={text.count(old)}')
p.write_text(text.replace(old, new))
