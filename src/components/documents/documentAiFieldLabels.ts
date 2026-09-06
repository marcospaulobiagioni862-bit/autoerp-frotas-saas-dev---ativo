const LABELS:Record<string,string>={
  name:'Nome',cpf:'CPF',rg:'RG',registrationNumber:'Número da CNH',category:'Categoria',birthDate:'Data de nascimento',issueDate:'Data de emissão',expirationDate:'Data de vencimento',ear:'Atividade remunerada (EAR)',
  plate:'Placa',renavam:'RENAVAM',chassis:'Chassi',brand:'Marca',model:'Modelo',manufactureYear:'Ano de fabricação',modelYear:'Ano do modelo',fuel:'Combustível',ownerName:'Proprietário',
  taxYear:'Ano de referência',referenceYear:'Ano de referência',amount:'Valor',dueDate:'Vencimento',installmentNumber:'Parcela',documentNumber:'Número do documento',
  noticeNumber:'Auto de infração',organName:'Órgão',infractionCode:'Código da infração',description:'Descrição',infractionDate:'Data da infração',infractionTime:'Horário da infração',infractionLocation:'Local da infração',discountDueDate:'Limite do desconto',discountAmount:'Valor do desconto',points:'Pontos',
  issuerName:'Emissor',issuerDocument:'Documento do emissor',invoiceNumber:'Número da nota',paymentMethod:'Forma de pagamento',
  contractNumber:'Número do contrato',startDate:'Data inicial',endDate:'Data final',driverName:'Motorista',driverDocument:'Documento do motorista',
  insurer:'Seguradora',policyNumber:'Número da apólice',insuredAmount:'Valor segurado',deductibleAmount:'Franquia',premiumAmount:'Prêmio total',installmentCount:'Quantidade de parcelas',coverageDetails:'Coberturas',brokerName:'Corretor',brokerContact:'Contato do corretor',
  supplierName:'Fornecedor',supplierDocument:'Documento do fornecedor',serviceDate:'Data do serviço',odometer:'Quilometragem',
  providerName:'Empresa do rastreador',equipmentModel:'Modelo do equipamento',imei:'IMEI',serialNumber:'Número de série',chipCarrier:'Operadora do chip',chipNumber:'Número do chip',installationDate:'Data de instalação',monthlyCost:'Mensalidade',
  result:'Resultado',
};
export const documentAiFieldLabel=(key:string):string=>LABELS[key]||key;
