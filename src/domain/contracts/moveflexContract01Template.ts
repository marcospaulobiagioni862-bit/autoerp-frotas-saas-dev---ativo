export const MOVEFLEX_CONTRACT_01_TEMPLATE_KEY = 'locacao-padrao';
export const MOVEFLEX_CONTRACT_01_TEMPLATE_TITLE = 'Contrato 01 — Contrato Particular de Locação de Veículo';

export const MOVEFLEX_CONTRACT_01_TEMPLATE_MARKDOWN = `CONTRATO PARTICULAR DE LOCAÇÃO DE VEÍCULO
Pelo presente instrumento particular, de um lado:
LOCADORA
Razão Social: {{company.name}}
Nome Fantasia: {{company.tradeName}}
CNPJ: {{company.document}}
Endereço: {{company.address.full}}
Cidade/UF: {{company.address.city}}/{{company.address.state}}
Telefone: {{company.phone}}
E-mail: {{company.email}}
Representante Legal: {{company.legalRepresentative.name}}
CPF: {{company.legalRepresentative.cpf}}
Doravante denominada simplesmente LOCADORA.
E, de outro lado:
LOCATÁRIO
Nome Completo: {{driver.name}}
CPF: {{driver.cpf}}
RG: {{driver.rg}}
CNH nº: {{driver.cnh}}
Categoria: {{driver.cnhCategory}}
Validade da CNH: {{driver.cnhExpiration}}
Data de Nascimento: {{driver.birthDate}}
Estado Civil: {{driver.maritalStatus}}
Profissão: {{driver.profession}}
Endereço Completo: {{driver.address.full}}
Cidade/UF: {{driver.address.city}}/{{driver.address.state}}
CEP: {{driver.address.zipCode}}
Telefone: {{driver.phone}}
E-mail: {{driver.email}}
Nome da Mãe: {{driver.motherName}}
Chave PIX: {{driver.pixKey}}
Doravante denominado simplesmente LOCATÁRIO.
As partes resolvem firmar o presente Contrato Particular de Locação de Veículo, que será regido pelas cláusulas abaixo:
CLÁUSULA 1 – OBJETO
Constitui objeto deste contrato a locação do seguinte veículo:
Marca: {{vehicle.brand}}
Modelo: {{vehicle.model}}
Ano/Modelo: {{vehicle.yearDisplay}}
Placa: {{vehicle.plate}}
RENAVAM: {{vehicle.renavam}}
Cor: {{vehicle.color}}
Chassi: {{vehicle.chassis}}
Quilometragem Inicial: {{vehicle.currentKm}}
Número do Rastreador: {{vehicle.tracker.serialNumber}}
CLÁUSULA 2 – FINALIDADE
O veículo será utilizado exclusivamente para:
( ) Uso Particular
( ) Transporte por Aplicativos
( ) Outros: ___________________________________________
É vedada a utilização para fins ilícitos, transporte de cargas perigosas, competições, reboques ou qualquer atividade não autorizada pela LOCADORA.
CLÁUSULA 3 – PRAZO DA LOCAÇÃO
Data de Retirada: {{contract.startDate}}
Data Prevista para Devolução: {{contract.endDate}}
Período Mínimo Contratado: _____________________________
Renovação:
( ) Automática
( ) Mediante Novo Contrato.
CLÁUSULA 4 – VALORES
Valor da Locação:
R$ {{contract.rentalAmount}}
Periodicidade:
( ) Semanal
( ) Quinzenal
( ) Mensal
Vencimento:
Toda __________________________.
Forma de Pagamento:
( ) PIX
( ) Cartão
( ) Transferência
( ) Dinheiro
CLÁUSULA 5 – CAUÇÃO
O LOCATÁRIO pagará o valor de:
R$ {{contract.securityDepositAmount}}
a título de depósito de segurança (caução).
A caução poderá ser utilizada para quitação de:
• Multas;
• Avarias;
• Franquia de seguro;
• Pedágios;
• Estacionamentos;
• Diárias em atraso;
• Limpeza;
• Guincho;
• Combustível;
• Demais débitos pendentes.
Prazo de devolução da caução:
________ dias após o encerramento do contrato.
CLÁUSULA 6 – OBRIGAÇÕES DO LOCATÁRIO
O LOCATÁRIO obriga-se a:
I – Efetuar os pagamentos nas datas acordadas;
II – Conduzir o veículo com zelo;
III – Manter a CNH válida;
IV – Informar imediatamente acidentes, avarias, furtos ou roubos;
V – Realizar as revisões determinadas pela LOCADORA;
VI – Não emprestar, sublocar ou ceder o veículo a terceiros sem autorização.
CLÁUSULA 7 – MULTAS E INFRAÇÕES
Todas as multas, pontos, infrações e penalidades ocorridas durante a posse do veículo serão de inteira responsabilidade do LOCATÁRIO.
A LOCADORA poderá realizar a indicação do condutor junto aos órgãos competentes.
CLÁUSULA 8 – PEDÁGIOS E ESTACIONAMENTOS
Todas as despesas de pedágio, estacionamento, Zona Azul e sistemas automáticos serão de responsabilidade do LOCATÁRIO.
CLÁUSULA 9 – MANUTENÇÃO
A manutenção preventiva será realizada conforme cronograma definido pela LOCADORA.
O LOCATÁRIO deverá comunicar imediatamente:
• Luz de injeção;
• Ruídos;
• Vazamentos;
• Falhas mecânicas;
• Pneus danificados.
O descumprimento poderá gerar responsabilização pelos danos.
CLÁUSULA 10 – PNEUS
Os pneus serão entregues em perfeitas condições.
Em caso de:
• Corte;
• Rasgo;
• Furo irreparável;
• Mau uso;
• Danos por colisão;
o custo será de responsabilidade do LOCATÁRIO.
CLÁUSULA 11 – AVARIAS
Qualquer dano identificado será cobrado do LOCATÁRIO, incluindo:
• Lataria;
• Vidros;
• Lanternas;
• Rodas;
• Bancos;
• Forros;
• Chaves;
• Acessórios.
CLÁUSULA 12 – ACIDENTES
Em caso de acidente, o LOCATÁRIO deverá:
I – Registrar Boletim de Ocorrência;
II – Comunicar imediatamente a LOCADORA;
III – Encaminhar fotos e documentos solicitados.
CLÁUSULA 13 – FURTO OU ROUBO
O LOCATÁRIO deverá comunicar imediatamente à LOCADORA e apresentar:
• Boletim de Ocorrência;
• Chave(s);
• Documentação solicitada.
CLÁUSULA 14 – INADIMPLÊNCIA
O atraso no pagamento implicará:
Multa: ______ %
Juros: ______ % ao mês.
Após ______ dias de atraso, a LOCADORA poderá:
☐ Bloquear o veículo;
☐ Recolher o veículo;
☐ Rescindir o contrato;
☐ Negativar o débito.
CLÁUSULA 15 – RASTREAMENTO
O LOCATÁRIO declara estar ciente de que o veículo possui sistema de rastreamento e monitoramento.
Autoriza expressamente:
☐ Monitoramento.
☐ Bloqueio remoto em caso de inadimplência.
☐ Recuperação do veículo.
CLÁUSULA 16 – PROIBIÇÕES
É proibido:
• Dirigir sob efeito de álcool;
• Permitir condutores não autorizados;
• Utilizar o veículo para atividades ilícitas;
• Participar de corridas;
• Fazer alterações mecânicas sem autorização.
CLÁUSULA 17 – DEVOLUÇÃO
O veículo deverá ser devolvido:
Data: {{contract.endDate}}
Horário: ___________________________
Local: _____________________________
A não devolução autoriza a adoção das medidas judiciais cabíveis.
CLÁUSULA 18 – PROTEÇÃO DE DADOS (LGPD)
O LOCATÁRIO autoriza a coleta, armazenamento e tratamento de seus dados pessoais para execução deste contrato.
CLÁUSULA 19 – CONSULTA DE CRÉDITO
O LOCATÁRIO autoriza consultas junto:
☐ Serasa
☐ Boa Vista
☐ SCR
☐ Outros órgãos de proteção ao crédito.
CLÁUSULA 20 – FORO
Fica eleito o foro da Comarca de:
renunciando as partes a qualquer outro.
ANEXO I – CHECKLIST DE ENTREGA
☐ Chave Reserva
☐ Manual
☐ Documento
☐ Estepe
☐ Macaco
☐ Triângulo
☐ Tapetes
☐ Multimídia
☐ Capa de Banco
☐ Outros:
OBSERVAÇÕES
Cidade: ______________________
Data: //________
LOCADORA
CPF/CNPJ: {{company.document}}
LOCATÁRIO
CPF: {{driver.cpf}}
TESTEMUNHA 1
CPF: ________________________________
TESTEMUNHA 2
CPF: ________________________________`;
