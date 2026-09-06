export const MOVEFLEX_DEFAULT_TEMPLATE_KEY = 'locacao-padrao';
export const MOVEFLEX_DEFAULT_TEMPLATE_TITLE = 'Contrato de Locação de Veículo MoveFlex';

export const MOVEFLEX_DEFAULT_CONTRACT_TEMPLATE_MARKDOWN = `CONTRATO PARTICULAR DE LOCAÇÃO DE VEÍCULO AUTOMOTOR

Pelo presente instrumento particular, as partes adiante qualificadas têm entre si justo e contratado o que segue:

LOCADORA
- Razão Social: {{company.name}}
- Nome Fantasia: {{company.tradeName}}
- CNPJ: {{company.document}}
- Endereço: {{company.address.full}}
- Telefone/WhatsApp: {{company.whatsapp}}
- E-mail: {{company.email}}
- Representante Legal: {{company.legalRepresentative.name}}
- CPF do Representante: {{company.legalRepresentative.cpf}}

LOCATÁRIO
- Nome Completo: {{driver.name}}
- CPF: {{driver.cpf}}
- RG: {{driver.rg}}
- CNH nº: {{driver.cnh}} Categoria: {{driver.cnhCategory}} Validade: {{driver.cnhExpiration}}
- Data de Nascimento: {{driver.birthDate}}
- Estado Civil: {{driver.maritalStatus}}
- Profissão: {{driver.profession}}
- Endereço Completo: {{driver.address.full}}
- Telefone/WhatsApp: {{driver.whatsapp}}
- E-mail: {{driver.email}}
- Nome da Mãe: {{driver.motherName}}
- Chave PIX para Devolução de Caução: {{driver.pixKey}}

CLÁUSULA 1 – OBJETO
Constitui objeto deste contrato a locação do seguinte veículo, de propriedade ou posse legítima da LOCADORA:
- Marca/Modelo: {{vehicle.brandModel}}
- Ano Fabricação/Modelo: {{vehicle.yearDisplay}}
- Placa: {{vehicle.plate}}
- RENAVAM: {{vehicle.renavam}}
- Chassi: {{vehicle.chassis}}
- Cor: {{vehicle.color}}
- Quilometragem Inicial: {{vehicle.currentKm}}
- Rastreador: {{vehicle.tracker.model}} / IMEI {{vehicle.tracker.imei}}

CLÁUSULA 2 – FINALIDADE ECONÔMICA
O veículo será utilizado para transporte de passageiros por aplicativos e demais finalidades expressamente autorizadas pela LOCADORA.
Parágrafo único: É vedada a utilização do veículo para fins ilícitos, sublocação não autorizada, competições, reboque irregular ou atividade incompatível com a legislação vigente.

CLÁUSULA 3 – REQUISITOS E OBRIGAÇÕES DE CONDUÇÃO
3.1. O LOCATÁRIO declara possuir habilitação válida e aptidão legal para conduzir o veículo, responsabilizando-se pela veracidade e atualização de seus documentos.
3.2. O LOCATÁRIO obriga-se a conduzir o veículo com zelo, prudência e observância das leis de trânsito.
3.3. É proibido conduzir o veículo sob efeito de álcool, drogas ou substâncias que comprometam a capacidade de condução.

CLÁUSULA 4 – PRAZO
4.1. O contrato tem início em {{contract.startDate}}.
4.2. Data final informada: {{contract.endDate}}.
4.3. Eventual rescisão antecipada observará as condições comerciais e legais previstas neste instrumento e nas políticas vigentes da LOCADORA.\n4.4. Quando houver data final definida, a renovação deverá ser tratada preferencialmente com antecedência mínima de 10 (dez) dias, conforme alerta operacional do sistema.

CLÁUSULA 5 – VALOR E PERIODICIDADE
5.1. Valor da locação: {{contract.rentalAmount}}.
5.2. Periodicidade da cobrança: {{contract.billingPeriodicity}}.
5.3. O pagamento deverá respeitar os vencimentos registrados no sistema e eventuais encargos previstos nas condições comerciais vigentes.\n5.4. Na cobrança semanal, o(s) dia(s) de vencimento seguirá(ão) a configuração do contrato. Na cobrança mensal, será considerado o dia do mês definido no cadastro do contrato.

CLÁUSULA 6 – LIMITE DE QUILOMETRAGEM
6.1. Franquia de quilometragem contratada: {{contract.franchiseKm}} km.
6.2. Quilometragem excedente: {{contract.excessKmRate}} por km excedente.

CLÁUSULA 7 – CAUÇÃO
7.1. Caução contratada: {{contract.securityDepositAmount}}.
7.2. A caução poderá ser utilizada para compensar obrigações comprovadamente vinculadas à locação, observadas as regras contratuais e legais aplicáveis.
7.3. Eventual saldo remanescente será tratado conforme encerramento, vistoria e apuração final do contrato.

CLÁUSULA 8 – COMBUSTÍVEL, LIMPEZA E CONSERVAÇÃO
8.1. O veículo deverá ser mantido em condições adequadas de conservação, limpeza e uso.
8.2. Custos decorrentes de uso inadequado poderão ser apurados e cobrados mediante evidência e vínculo com o contrato.

CLÁUSULA 9 – MANUTENÇÕES E REVISÕES
9.1. O LOCATÁRIO deverá observar os alertas de manutenção, revisão, pneus, óleo e demais itens de segurança.
9.2. Manutenções devem ser realizadas conforme autorização e fluxo operacional da LOCADORA.
9.3. Danos decorrentes de negligência, uso inadequado ou descumprimento de orientação técnica poderão ser atribuídos ao responsável após apuração.

CLÁUSULA 10 – INFRAÇÕES DE TRÂNSITO
10.1. O LOCATÁRIO responde pelas infrações ocorridas durante o período em que estiver responsável pelo veículo, sem prejuízo dos procedimentos de identificação do condutor.
10.2. Multas e demais despesas vinculadas ao período de responsabilidade poderão ser repassadas conforme documentação e regras do contrato.

CLÁUSULA 11 – SINISTROS E SEGURO
11.1. Em caso de colisão, furto, roubo ou outro sinistro, o LOCATÁRIO deverá comunicar imediatamente a LOCADORA e fornecer os documentos necessários.
11.2. Seguro vigente: {{vehicle.insurance.company}} — Apólice {{vehicle.insurance.policyNumber}}.
11.3. Cobertura: {{vehicle.insurance.coverageDetails}}.
11.4. Franquia securitária registrada: {{vehicle.insurance.deductibleAmount}}.

CLÁUSULA 12 – RASTREAMENTO E MONITORAMENTO
12.1. O LOCATÁRIO declara ciência de que o veículo poderá possuir sistema de rastreamento e telemetria.
12.2. Equipamento registrado: {{vehicle.tracker.model}}, IMEI {{vehicle.tracker.imei}}, número/serial {{vehicle.tracker.serialNumber}}.
12.3. A adulteração ou remoção não autorizada do equipamento poderá caracterizar descumprimento contratual.

CLÁUSULA 13 – INADIMPLÊNCIA
O inadimplemento será tratado conforme as condições financeiras registradas no contrato e a legislação aplicável, preservando-se a rastreabilidade das cobranças.

CLÁUSULA 14 – DEVOLUÇÃO DO VEÍCULO
A devolução deverá ocorrer conforme procedimento operacional da LOCADORA, com registro de quilometragem, vistoria, acessórios, documentos, combustível e eventuais avarias.

CLÁUSULA 15 – PROTEÇÃO DE DADOS
Os dados pessoais serão tratados para execução do contrato, segurança patrimonial, atendimento, cobrança e cumprimento de obrigações legais, observada a legislação aplicável.

CLÁUSULA 16 – DISPOSIÇÕES FINAIS
As partes reconhecem os registros eletrônicos, documentos, evidências de assinatura e histórico auditável vinculados a este contrato, sem prejuízo dos requisitos legais aplicáveis.

CONTRATO Nº {{contract.number}}

Local e Data: ______________________________

LOCADORA: {{company.tradeName}}
Representante: {{company.legalRepresentative.name}}

LOCATÁRIO: {{driver.name}}
CPF: {{driver.cpf}}

ASSINATURAS
LOCADORA: ______________________________________
LOCATÁRIO: _____________________________________

TESTEMUNHAS
1. Nome: _________________________ CPF: _________________________
2. Nome: _________________________ CPF: _________________________
`;

export function moveFlexBlankContractText(): string {
  return MOVEFLEX_DEFAULT_CONTRACT_TEMPLATE_MARKDOWN.replace(/{{\s*[a-zA-Z0-9.]+\s*}}/g, '____________________________');
}
