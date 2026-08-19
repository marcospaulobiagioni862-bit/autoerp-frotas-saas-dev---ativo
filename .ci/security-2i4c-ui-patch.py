from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected 1 replacement, found {count}")
    p.write_text(text.replace(old, new))

# ContractClient: signatureRequired is now a mandatory server payload field.
replace_once(
    'src/api/contractClient.ts',
    "    typeof item.excessKmRate !== 'number' || !Number.isFinite(item.excessKmRate) ||\n    typeof item.isArchived !== 'boolean' ||",
    "    typeof item.excessKmRate !== 'number' || !Number.isFinite(item.excessKmRate) ||\n    typeof item.signatureRequired !== 'boolean' ||\n    typeof item.isArchived !== 'boolean' ||",
)

# Contract form: load/select server templates and suppress immediate activation for new signature-required contracts.
replace_once(
    'src/components/contracts/ContractFormModal.tsx',
    "import { VehicleClient } from '../../api/vehicleClient';\nimport type { Contract, Driver, Vehicle } from '../../types/entities';",
    "import { VehicleClient } from '../../api/vehicleClient';\nimport { ContractTemplateClient } from '../../api/contractTemplateClient';\nimport type { Contract, ContractTemplate, Driver, Vehicle } from '../../types/entities';",
)
replace_once(
    'src/components/contracts/ContractFormModal.tsx',
    "  const [drivers, setDrivers] = useState<Driver[]>([]);\n  const [loading, setLoading] = useState(false);",
    "  const [drivers, setDrivers] = useState<Driver[]>([]);\n  const [templates, setTemplates] = useState<ContractTemplate[]>([]);\n  const [loading, setLoading] = useState(false);",
)
replace_once(
    'src/components/contracts/ContractFormModal.tsx',
    "    securityDepositAmount: '1000', franchiseKm: '1500', excessKmRate: '0.5', paymentMethodId: '', notes: '',\n",
    "    securityDepositAmount: '1000', franchiseKm: '1500', excessKmRate: '0.5', paymentMethodId: '', templateId: '', notes: '',\n",
)
replace_once(
    'src/components/contracts/ContractFormModal.tsx',
    "    Promise.all([VehicleClient.list(), DriverClient.list()])\n      .then(([vehicleList, driverList]) => {",
    "    Promise.all([VehicleClient.list(), DriverClient.list(), ContractTemplateClient.list()])\n      .then(([vehicleList, driverList, templateList]) => {",
)
replace_once(
    'src/components/contracts/ContractFormModal.tsx',
    "        setVehicles(validVehicles);\n        setDrivers(validDrivers);\n        if (contractToEdit) {",
    "        setVehicles(validVehicles);\n        setDrivers(validDrivers);\n        setTemplates(templateList);\n        if (contractToEdit) {",
)
replace_once(
    'src/components/contracts/ContractFormModal.tsx',
    "            paymentMethodId: contractToEdit.paymentMethodId || '',\n            notes: contractToEdit.notes || '',",
    "            paymentMethodId: contractToEdit.paymentMethodId || '',\n            templateId: contractToEdit.templateId || '',\n            notes: contractToEdit.notes || '',",
)
replace_once(
    'src/components/contracts/ContractFormModal.tsx',
    "            securityDepositAmount: '1000', franchiseKm: '1500', excessKmRate: '0.5', paymentMethodId: '', notes: '',\n",
    "            securityDepositAmount: '1000', franchiseKm: '1500', excessKmRate: '0.5', paymentMethodId: '', templateId: templateList[0]?.id || '', notes: '',\n",
)
replace_once(
    'src/components/contracts/ContractFormModal.tsx',
    "        paymentMethodId: form.paymentMethodId || undefined,\n        notes: form.notes || undefined,",
    "        paymentMethodId: form.paymentMethodId || undefined,\n        templateId: form.templateId || undefined,\n        notes: form.notes || undefined,",
)
replace_once(
    'src/components/contracts/ContractFormModal.tsx',
    "  const canActivate = !contractToEdit || [ContractStatus.DRAFT, ContractStatus.AWAITING_SIGNATURE].includes(contractToEdit.status);",
    "  const canActivate = Boolean(contractToEdit?.signatureRequired === false && [ContractStatus.DRAFT, ContractStatus.AWAITING_SIGNATURE].includes(contractToEdit.status));",
)
replace_once(
    'src/components/contracts/ContractFormModal.tsx',
    "          <Field label=\"Número do contrato\"><Input value={form.contractNumber} onChange={(e) => set('contractNumber', e.target.value)} placeholder=\"Em branco = gerado no servidor\" /></Field>\n          <Field label=\"Data inicial\"><Input type=\"date\" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>",
    "          <Field label=\"Número do contrato\"><Input value={form.contractNumber} onChange={(e) => set('contractNumber', e.target.value)} placeholder=\"Em branco = gerado no servidor\" /></Field>\n          <Field label=\"Modelo de contrato\"><select value={form.templateId} onChange={(e) => set('templateId', e.target.value)} disabled={loadingOptions} className=\"control\"><option value=\"\">Selecione</option>{templates.map((item) => <option key={item.id} value={item.id}>{item.title} • v{item.versionNumber}</option>)}</select></Field>\n          <Field label=\"Data inicial\"><Input type=\"date\" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} /></Field>",
)

# Contract details: execution panel becomes the signed activation path; top action remains only for legacy contracts.
replace_once(
    'src/components/contracts/ContractDetailsModal.tsx',
    "import { FileUpload } from '../documents/FileUpload';\n",
    "import { FileUpload } from '../documents/FileUpload';\nimport { ContractExecutionPanel } from './ContractExecutionPanel';\n",
)
replace_once(
    'src/components/contracts/ContractDetailsModal.tsx',
    "        {[ContractStatus.DRAFT, ContractStatus.AWAITING_SIGNATURE].includes(contract.status) && <Button size=\"sm\" variant=\"primary\" isLoading={actionLoading} onClick={() => void activate()}>Ativar</Button>}",
    "        {[ContractStatus.DRAFT, ContractStatus.AWAITING_SIGNATURE].includes(contract.status) && contract.signatureRequired === false && <Button size=\"sm\" variant=\"primary\" isLoading={actionLoading} onClick={() => void activate()}>Ativar legado</Button>}",
)
replace_once(
    'src/components/contracts/ContractDetailsModal.tsx',
    "          {tab === 'OVERVIEW' && <div className=\"space-y-4\">\n            <div className=\"grid grid-cols-2 gap-3 sm:grid-cols-4\">",
    "          {tab === 'OVERVIEW' && <div className=\"space-y-4\">\n            <ContractExecutionPanel contract={contract} onChanged={async () => { await load(); onRefresh(); }} />\n            <div className=\"grid grid-cols-2 gap-3 sm:grid-cols-4\">",
)

# Contracts list: template manager and signed-flow navigation.
replace_once(
    'src/components/contracts/ContractsManagement.tsx',
    "import { AlertTriangle, Calendar, Car, DollarSign, Eye, FileText, Plus, Search, TrendingUp, User } from 'lucide-react';",
    "import { AlertTriangle, Calendar, Car, DollarSign, Eye, FileText, Plus, Search, Settings2, TrendingUp, User } from 'lucide-react';",
)
replace_once(
    'src/components/contracts/ContractsManagement.tsx',
    "import { ContractDetailsModal } from './ContractDetailsModal';\n",
    "import { ContractDetailsModal } from './ContractDetailsModal';\nimport { ContractTemplateManagementModal } from './ContractTemplateManagementModal';\n",
)
replace_once(
    'src/components/contracts/ContractsManagement.tsx',
    "  const [detailsOpen, setDetailsOpen] = useState(false);\n  const [contractToEdit, setContractToEdit] = useState<Contract | null>(null);",
    "  const [detailsOpen, setDetailsOpen] = useState(false);\n  const [templateManagerOpen, setTemplateManagerOpen] = useState(false);\n  const [contractToEdit, setContractToEdit] = useState<Contract | null>(null);",
)
replace_once(
    'src/components/contracts/ContractsManagement.tsx',
    "    setFormOpen(false);\n    setDetailsOpen(false);\n    void loadData();",
    "    setFormOpen(false);\n    setDetailsOpen(false);\n    setTemplateManagerOpen(false);\n    void loadData();",
)
replace_once(
    'src/components/contracts/ContractsManagement.tsx',
    "      />\n\n      {error && (",
    "      />\n      <div className=\"flex justify-end\"><Button variant=\"secondary\" onClick={() => setTemplateManagerOpen(true)}><Settings2 className=\"w-4 h-4\" />Modelos de Contrato</Button></div>\n\n      {error && (",
)
replace_once(
    'src/components/contracts/ContractsManagement.tsx',
    "                          {[ContractStatus.DRAFT, ContractStatus.AWAITING_SIGNATURE].includes(item.status) && <Button size=\"sm\" variant=\"secondary\" onClick={() => { setContractToEdit(item); setFormOpen(true); }}>Editar</Button>}\n                          {[ContractStatus.DRAFT, ContractStatus.AWAITING_SIGNATURE].includes(item.status) && <Button size=\"sm\" variant=\"primary\" isLoading={busy} onClick={() => void handleActivate(item.id)}>Ativar</Button>}",
    "                          {item.status === ContractStatus.DRAFT && <Button size=\"sm\" variant=\"secondary\" onClick={() => { setContractToEdit(item); setFormOpen(true); }}>Editar</Button>}\n                          {[ContractStatus.DRAFT, ContractStatus.AWAITING_SIGNATURE].includes(item.status) && item.signatureRequired === false && <Button size=\"sm\" variant=\"primary\" isLoading={busy} onClick={() => void handleActivate(item.id)}>Ativar legado</Button>}\n                          {[ContractStatus.DRAFT, ContractStatus.AWAITING_SIGNATURE].includes(item.status) && item.signatureRequired !== false && <Button size=\"sm\" variant=\"primary\" onClick={() => { setSelectedContractId(item.id); setDetailsOpen(true); }}>PDF / Assinatura</Button>}",
)
replace_once(
    'src/components/contracts/ContractsManagement.tsx',
    "      <ContractDetailsModal\n        isOpen={detailsOpen}",
    "      <ContractTemplateManagementModal isOpen={templateManagerOpen} onClose={() => setTemplateManagerOpen(false)} />\n      <ContractDetailsModal\n        isOpen={detailsOpen}",
)
