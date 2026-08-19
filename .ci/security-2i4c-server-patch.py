from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected 1 replacement, found {count}")
    p.write_text(text.replace(old, new))


def replace_count(path: str, old: str, new: str, expected: int) -> None:
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != expected:
        raise SystemExit(f"{path}: expected {expected} replacements, found {count}")
    p.write_text(text.replace(old, new))

replace_once(
    'src/server/vehicleRoutes.ts',
    "import { registerDocumentRoutes } from './documentRoutes';\n",
    "import { registerDocumentRoutes } from './documentRoutes';\nimport { registerContractTemplateRoutes } from './contractTemplateRoutes';\nimport { registerContractExecutionRoutes } from './contractExecutionRoutes';\n",
)
replace_once(
    'src/server/vehicleRoutes.ts',
    "  registerDocumentRoutes(app);\n",
    "  registerDocumentRoutes(app);\n  registerContractTemplateRoutes(app);\n  registerContractExecutionRoutes(app);\n",
)

replace_count(
    'src/server/contractRoutes.ts',
    "'generatedPdfUrl','signedContractUrl'",
    "'generatedPdfUrl','signedContractUrl','signatureRequired'",
    2,
)
replace_once(
    'src/server/contractRoutes.ts',
    "      const requestedNumber = normalizeContractNumber(body.contractNumber);\n\n      const item = await UnitOfWork.run(principal.companyId, async (tx) => {",
    "      const requestedNumber = normalizeContractNumber(body.contractNumber);\n      const requestedTemplateId = optionalText(body.templateId);\n\n      const item = await UnitOfWork.run(principal.companyId, async (tx) => {",
)
replace_once(
    'src/server/contractRoutes.ts',
    "        if (!vehicle || vehicle.isArchived) throw new ContractNotFoundError();\n        if (!driver || driver.isArchived) throw new ContractNotFoundError();\n\n        let contractNumber = requestedNumber || generateContractNumber();",
    "        if (!vehicle || vehicle.isArchived) throw new ContractNotFoundError();\n        if (!driver || driver.isArchived) throw new ContractNotFoundError();\n        if (requestedTemplateId) {\n          const template = await tx.getContractTemplateRepo().findByIdForCompany(principal.companyId, requestedTemplateId);\n          if (!template || template.isArchived) throw new ContractNotFoundError();\n          if (!template.isCurrent || !template.isActive) throw new ContractConflictError('Contract template unavailable');\n        }\n\n        let contractNumber = requestedNumber || generateContractNumber();",
)
replace_once(
    'src/server/contractRoutes.ts',
    "          templateId: optionalText(body.templateId),\n          signatureRequired: true,",
    "          templateId: requestedTemplateId,\n          signatureRequired: true,",
)

replace_once(
    'src/server/contractRoutes.ts',
    "        if (![ContractStatus.DRAFT, ContractStatus.AWAITING_SIGNATURE].includes(existing.status)) {\n          throw new ContractConflictError('Contract is not editable');\n        }\n\n        const vehicleId = body.vehicleId === undefined ? existing.vehicleId : requiredText(body.vehicleId, 'vehicleId');",
    "        if (![ContractStatus.DRAFT, ContractStatus.AWAITING_SIGNATURE].includes(existing.status)) {\n          throw new ContractConflictError('Contract is not editable');\n        }\n        const generatedArtifact = await tx.getContractArtifactRepo().findCurrentForContract(\n          principal.companyId, existing.id, 'GENERATED_PDF', true\n        );\n        if (generatedArtifact) throw new ContractConflictError('Contract terms are locked after PDF generation');\n\n        const vehicleId = body.vehicleId === undefined ? existing.vehicleId : requiredText(body.vehicleId, 'vehicleId');",
)
replace_once(
    'src/server/contractRoutes.ts',
    "        const vehicle = await tx.getVehicleRepo().findByIdForCompany(principal.companyId, vehicleId);\n        const driver = await tx.getDriverRepo().findByIdForCompany(principal.companyId, driverId);\n        if (!vehicle || vehicle.isArchived || !driver || driver.isArchived) throw new ContractNotFoundError();\n\n        const contractNumber = body.contractNumber === undefined",
    "        const vehicle = await tx.getVehicleRepo().findByIdForCompany(principal.companyId, vehicleId);\n        const driver = await tx.getDriverRepo().findByIdForCompany(principal.companyId, driverId);\n        if (!vehicle || vehicle.isArchived || !driver || driver.isArchived) throw new ContractNotFoundError();\n        const nextTemplateId = body.templateId === undefined ? existing.templateId : optionalText(body.templateId);\n        if (nextTemplateId) {\n          const template = await tx.getContractTemplateRepo().findByIdForCompany(principal.companyId, nextTemplateId);\n          if (!template || template.isArchived) throw new ContractNotFoundError();\n          if (!template.isCurrent || !template.isActive) throw new ContractConflictError('Contract template unavailable');\n        }\n\n        const contractNumber = body.contractNumber === undefined",
)
replace_once(
    'src/server/contractRoutes.ts',
    "          templateId: body.templateId === undefined ? existing.templateId : optionalText(body.templateId),\n",
    "          templateId: nextTemplateId,\n",
)

replace_once(
    'src/server/contractRoutes.ts',
    "        if (![ContractStatus.DRAFT, ContractStatus.AWAITING_SIGNATURE].includes(contract.status)) {\n          throw new ContractConflictError('Contract lifecycle does not allow activation');\n        }\n        if (contract.rentalAmount <= 0) throw new ContractConflictError('Contract rental amount incomplete');",
    "        if (![ContractStatus.DRAFT, ContractStatus.AWAITING_SIGNATURE].includes(contract.status)) {\n          throw new ContractConflictError('Contract lifecycle does not allow activation');\n        }\n        if (contract.signatureRequired) {\n          const generated = await tx.getContractArtifactRepo().findCurrentForContract(\n            principal.companyId, contract.id, 'GENERATED_PDF', true\n          );\n          const signed = await tx.getContractArtifactRepo().findCurrentForContract(\n            principal.companyId, contract.id, 'SIGNED_EVIDENCE', true\n          );\n          if (!generated || !signed || signed.sourceArtifactId !== generated.id) {\n            throw new ContractConflictError('Signed contract evidence required');\n          }\n        }\n        if (contract.rentalAmount <= 0) throw new ContractConflictError('Contract rental amount incomplete');",
)
