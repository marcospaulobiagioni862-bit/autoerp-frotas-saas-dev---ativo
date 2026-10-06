/** Explicit public allowlist: never return SQL errors, constraint names or raw messages. */
const reasons: Record<string, [string, string]> = {
  'Valid signed contract evidence required': ['CONTRACT_SIGNATURE_REQUIRED', 'Confirme uma assinatura válida do documento atual antes de ativar ou cobrar o contrato.'],
  'Signature exceeds contract end': ['CONTRACT_SIGNATURE_AFTER_END', 'A assinatura é posterior ao término do contrato. Revise a vigência.'],
  'Contract period has not started': ['CONTRACT_PERIOD_NOT_STARTED', 'A vigência efetiva do contrato ainda não começou.'],
  'Contract period already ended': ['CONTRACT_PERIOD_ENDED', 'A vigência do contrato já terminou.'],
  'Contract rental amount incomplete': ['CONTRACT_RENT_INCOMPLETE', 'Informe um valor de aluguel válido.'],
  'Vehicle unavailable': ['CONTRACT_VEHICLE_UNAVAILABLE', 'O veículo não está disponível para ativação.'],
  'Vehicle documentation unavailable': ['CONTRACT_VEHICLE_DOCUMENTS_REQUIRED', 'Regularize os documentos obrigatórios do veículo antes de ativar.'],
  'Vehicle insurance unavailable': ['CONTRACT_INSURANCE_REQUIRED', 'O veículo precisa de seguro válido no início efetivo e na data da ativação.'],
  'Driver unavailable': ['CONTRACT_DRIVER_UNAVAILABLE', 'O motorista não está disponível para esta operação.'],
  'Driver CNH invalid': ['CONTRACT_DRIVER_LICENSE_INVALID', 'Regularize a CNH do motorista antes de continuar.'],
  'Contract binding conflict': ['CONTRACT_BINDING_CONFLICT', 'O veículo ou motorista já está vinculado a outro contrato.'],
  'Active binding conflict': ['CONTRACT_BINDING_CONFLICT', 'O veículo ou motorista já está vinculado a outro contrato.'],
  'Vehicle already bound': ['CONTRACT_BINDING_CONFLICT', 'O veículo já possui um vínculo operacional.'],
  'Vehicle already bound to another contract': ['CONTRACT_BINDING_CONFLICT', 'O veículo já está vinculado a outro contrato.'],
  'Driver already bound to another contract': ['CONTRACT_BINDING_CONFLICT', 'O motorista já está vinculado a outro contrato.'],
  'Active contract binding mismatch': ['CONTRACT_BINDING_MISMATCH', 'Os vínculos operacionais do contrato precisam ser conferidos.'],
  'Contract binding mismatch': ['CONTRACT_BINDING_MISMATCH', 'Os vínculos operacionais do contrato precisam ser conferidos.'],
  'Contract terms are locked after document generation': ['CONTRACT_TERMS_LOCKED', 'Os dados do contrato estão bloqueados após a geração do documento.'],
  'Duplicate contract number': ['CONTRACT_NUMBER_EXISTS', 'Já existe um contrato com esse número.'],
  'Contract must be active': ['CONTRACT_NOT_ACTIVE', 'Ative o contrato assinado antes desta cobrança.'],
  'Billing competence precedes contract start': ['CONTRACT_BILLING_BEFORE_SIGNATURE', 'A competência da cobrança não pode ser anterior à assinatura.'],
  'Billing competence exceeds contract end': ['CONTRACT_BILLING_AFTER_END', 'A competência da cobrança ultrapassa o término do contrato.'],
  'Close date precedes contract start': ['CONTRACT_CLOSE_BEFORE_SIGNATURE', 'O encerramento não pode ser anterior ao início da vigência.'],
  'Close date cannot be in the future': ['CONTRACT_CLOSE_IN_FUTURE', 'A data de encerramento não pode estar no futuro.'],
  'Contract financial reconciliation conflict': ['CONTRACT_FINANCE_REVIEW_REQUIRED', 'A conciliação da cobrança exige revisão. Nenhuma alteração desta operação foi aplicada.'],
  'Financial period closed': ['CONTRACT_FINANCIAL_PERIOD_CLOSED', 'O período financeiro está fechado. Regularize o período antes de ajustar a cobrança.'],
};

export function contractConflictResponse(reason?: string): { error: string; code: string } {
  if (reason?.startsWith('Contract lifecycle does not allow ')) {
    return { code: 'CONTRACT_LIFECYCLE_CONFLICT', error: 'O status atual do contrato não permite esta operação.' };
  }
  const known = Object.prototype.hasOwnProperty.call(reasons, reason || '') ? reasons[reason!] : undefined;
  const [code, error] = known || ['CONTRACT_CONFLICT', 'Não foi possível concluir a operação. Atualize o contrato e confira seu status e vínculos.'];
  return { error, code };
}
