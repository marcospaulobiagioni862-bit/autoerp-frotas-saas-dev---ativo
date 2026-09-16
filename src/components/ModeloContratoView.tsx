import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  FileText, 
  Printer, 
  Send, 
  User, 
  Car, 
  Calendar, 
  DollarSign, 
  CheckCircle, 
  Copy, 
  FileDown, 
  Edit, 
  Eye,
  RefreshCw,
  Building
} from 'lucide-react';
import { Contrato, Motorista, Veiculo, getFormattedAddress } from '../types';

interface ModeloContratoViewProps {
  contratos: Contrato[];
  motoristas: Motorista[];
  veiculos: Veiculo[];
  onTriggerToast: (msg: string, type: 'success' | 'warning' | 'error' | 'info') => void;
  initialMotoristaCpf?: string;
  hideSelector?: boolean;
}

export default function ModeloContratoView({
  contratos,
  motoristas,
  veiculos,
  onTriggerToast,
  initialMotoristaCpf,
  hideSelector = false
}: ModeloContratoViewProps) {
  const [selectedContratoId, setSelectedContratoId] = useState<string>('');
  
  // Locador (Loaded and saved in localStorage for persistence)
  const [locadorNome, setLocadorNome] = useState(() => localStorage.getItem('autoerp_locador_nome') || 'AUTOERP LOCADORA DE VEÍCULOS LTDA');
  const [locadorDocumento, setLocadorDocumento] = useState(() => localStorage.getItem('autoerp_locador_doc') || '45.123.456/0001-88');
  const [locadorEndereco, setLocadorEndereco] = useState(() => localStorage.getItem('autoerp_locador_end') || 'Av. das Nações Unidas, 12901 - Brooklin Paulista, São Paulo - SP');
  const [locadorTelefone, setLocadorTelefone] = useState(() => localStorage.getItem('autoerp_locador_tel') || '(11) 99999-8888');
  const [cidadeContrato, setCidadeContrato] = useState(() => localStorage.getItem('autoerp_locador_cidade') || 'São Paulo');

  // Locatário (Driver)
  const [motoristaNome, setMotoristaNome] = useState('');
  const [motoristaCpf, setMotoristaCpf] = useState('');
  const [motoristaRg, setMotoristaRg] = useState('');
  const [motoristaCnh, setMotoristaCnh] = useState('');
  const [motoristaCnhCat, setMotoristaCnhCat] = useState('B');
  const [motoristaTelefone, setMotoristaTelefone] = useState('');
  const [motoristaEndereco, setMotoristaEndereco] = useState('');
  const [motoristaEstadoCivil, setMotoristaEstadoCivil] = useState('Solteiro(a)');

  // Veículo
  const [veiculoModelo, setVeiculoModelo] = useState('');
  const [veiculoPlaca, setVeiculoPlaca] = useState('');
  const [veiculoCor, setVeiculoCor] = useState('');
  const [veiculoAno, setVeiculoAno] = useState('');
  const [veiculoChassi, setVeiculoChassi] = useState('');
  const [veiculoRenavam, setVeiculoRenavam] = useState('');
  const [veiculoFranquiaSeguro, setVeiculoFranquiaSeguro] = useState('R$ 2.500,00');

  // Contrato
  const [contratoValor, setContratoValor] = useState('');
  const [contratoFrequencia, setContratoFrequencia] = useState('Semanal');
  const [contratoDiaCobranca, setContratoDiaCobranca] = useState('Segunda-feira');
  const [contratoKmFranquia, setContratoKmFranquia] = useState('1.500');
  const [contratoCaucao, setContratoCaucao] = useState('1.000,00');
  const [contratoInicio, setContratoInicio] = useState('');
  const [contratoFim, setContratoFim] = useState('');

  // Editor mode
  const [isEditMode, setIsEditMode] = useState(false);
  const [contratoTextoCustom, setContratoTextoCustom] = useState('');

  // Persist Locador details
  useEffect(() => {
    localStorage.setItem('autoerp_locador_nome', locadorNome);
    localStorage.setItem('autoerp_locador_doc', locadorDocumento);
    localStorage.setItem('autoerp_locador_end', locadorEndereco);
    localStorage.setItem('autoerp_locador_tel', locadorTelefone);
    localStorage.setItem('autoerp_locador_cidade', cidadeContrato);
  }, [locadorNome, locadorDocumento, locadorEndereco, locadorTelefone, cidadeContrato]);

  // Set selectedContratoId based on initialMotoristaCpf if provided
  useEffect(() => {
    if (initialMotoristaCpf) {
      const existing = contratos.find(c => c.motoristaCpf === initialMotoristaCpf && c.status === 'Ativo') ||
                       contratos.find(c => c.motoristaCpf === initialMotoristaCpf);
      if (existing) {
        setSelectedContratoId(existing.id);
      } else {
        setSelectedContratoId('');
      }
    } else if (!hideSelector) {
      setSelectedContratoId('');
    }
  }, [initialMotoristaCpf, contratos, hideSelector]);

  // Pre-fill fields when a contract is selected or fallback when initialMotoristaCpf is provided
  useEffect(() => {
    if (selectedContratoId) {
      const c = contratos.find(item => item.id === selectedContratoId);
      if (c) {
        // Driver details
        const mot = motoristas.find(m => m.cpf === c.motoristaCpf);
        if (mot) {
          setMotoristaNome(mot.nome || '');
          setMotoristaCpf(mot.cpf || '');
          setMotoristaRg(mot.rg || '—');
          setMotoristaCnh(mot.cnh || '');
          setMotoristaCnhCat(mot.cat || 'B');
          setMotoristaTelefone(mot.tel || '');
          setMotoristaEndereco(getFormattedAddress(mot));
          setMotoristaEstadoCivil('Solteiro(a)');
        } else {
          setMotoristaCpf(c.motoristaCpf);
          setMotoristaNome('');
          setMotoristaRg('');
          setMotoristaCnh('');
          setMotoristaCnhCat('B');
          setMotoristaTelefone('');
          setMotoristaEndereco('');
          setMotoristaEstadoCivil('Solteiro(a)');
        }

        // Vehicle details
        const veic = veiculos.find(v => v.placa === c.veiculoPlaca);
        if (veic) {
          setVeiculoModelo(`${veic.marca} ${veic.modelo}`);
          setVeiculoPlaca(veic.placa || '');
          setVeiculoCor(veic.cor || '');
          setVeiculoAno(veic.ano ? veic.ano.toString() : '');
          setVeiculoChassi(veic.chassi || '—');
          setVeiculoRenavam(veic.renavam || '—');
          if (veic.seguro_valor_franquia) {
            setVeiculoFranquiaSeguro(new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(veic.seguro_valor_franquia));
          } else {
            setVeiculoFranquiaSeguro('R$ 2.500,00');
          }
        } else {
          setVeiculoPlaca(c.veiculoPlaca);
          setVeiculoModelo('');
          setVeiculoCor('');
          setVeiculoAno('');
          setVeiculoChassi('—');
          setVeiculoRenavam('—');
          setVeiculoFranquiaSeguro('R$ 2.500,00');
        }

        // Contract details
        setContratoValor(c.valor ? c.valor.toString() : '');
        setContratoFrequencia(c.frequencia || 'Semanal');
        setContratoDiaCobranca(c.diaCobranca || 'Segunda-feira');
        setContratoKmFranquia(c.kmFranquia ? c.kmFranquia.toString() : '1.500');
        setContratoCaucao(c.caucao ? c.caucao.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '1.000,00');
        setContratoInicio(c.inicio || '');
        setContratoFim(c.fim || '');
        return;
      }
    }

    // Fallback if no contract is selected but initialMotoristaCpf is provided
    if (initialMotoristaCpf) {
      const mot = motoristas.find(m => m.cpf === initialMotoristaCpf);
      if (mot) {
        setMotoristaNome(mot.nome || '');
        setMotoristaCpf(mot.cpf || '');
        setMotoristaRg(mot.rg || '—');
        setMotoristaCnh(mot.cnh || '');
        setMotoristaCnhCat(mot.cat || 'B');
        setMotoristaTelefone(mot.tel || '');
        setMotoristaEndereco(getFormattedAddress(mot));
        setMotoristaEstadoCivil('Solteiro(a)');

        // Pre-fill associated vehicle
        const associatedPlaca = mot.veiculoPlaca;
        if (associatedPlaca) {
          const veic = veiculos.find(v => v.placa === associatedPlaca);
          if (veic) {
            setVeiculoModelo(`${veic.marca} ${veic.modelo}`);
            setVeiculoPlaca(veic.placa || '');
            setVeiculoCor(veic.cor || '');
            setVeiculoAno(veic.ano ? veic.ano.toString() : '');
            setVeiculoChassi(veic.chassi || '—');
            setVeiculoRenavam(veic.renavam || '—');
            if (veic.seguro_valor_franquia) {
              setVeiculoFranquiaSeguro(new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(veic.seguro_valor_franquia));
            } else {
              setVeiculoFranquiaSeguro('R$ 2.500,00');
            }
          } else {
            setVeiculoPlaca(associatedPlaca);
            setVeiculoModelo('');
            setVeiculoCor('');
            setVeiculoAno('');
            setVeiculoChassi('—');
            setVeiculoRenavam('—');
            setVeiculoFranquiaSeguro('R$ 2.500,00');
          }
        } else {
          setVeiculoModelo('');
          setVeiculoPlaca('');
          setVeiculoCor('');
          setVeiculoAno('');
          setVeiculoChassi('—');
          setVeiculoRenavam('—');
          setVeiculoFranquiaSeguro('R$ 2.500,00');
        }

        // Reset contract fields since there is no actual active contract, or pre-fill with defaults
        setContratoValor('');
        setContratoFrequencia('Semanal');
        setContratoDiaCobranca('Segunda-feira');
        setContratoKmFranquia('1.500');
        setContratoCaucao('1.000,00');
        setContratoInicio('');
        setContratoFim('');
        return;
      }
    }

    // Default clear
    setMotoristaNome('');
    setMotoristaCpf('');
    setMotoristaRg('');
    setMotoristaCnh('');
    setMotoristaCnhCat('B');
    setMotoristaTelefone('');
    setMotoristaEndereco('');
    setMotoristaEstadoCivil('Solteiro(a)');
    setVeiculoModelo('');
    setVeiculoPlaca('');
    setVeiculoCor('');
    setVeiculoAno('');
    setVeiculoChassi('');
    setVeiculoRenavam('');
    setVeiculoFranquiaSeguro('R$ 2.500,00');
    setContratoValor('');
    setContratoFrequencia('Semanal');
    setContratoDiaCobranca('Segunda-feira');
    setContratoKmFranquia('1.500');
    setContratoCaucao('1.000,00');
    setContratoInicio('');
    setContratoFim('');
  }, [selectedContratoId, initialMotoristaCpf, contratos, motoristas, veiculos]);

  // Generate the contract text dynamically based on the current field values
  const getDynamicContractText = () => {
    const today = new Date();
    const dataAtualExtenso = `${today.getDate()} de ${today.toLocaleString('pt-BR', { month: 'long' })} de ${today.getFullYear()}`;

    const dataInicioFormat = contratoInicio 
      ? contratoInicio.split('-').reverse().join('/') 
      : '//____';

    const freqDiaria = contratoFrequencia === 'Diário' || contratoFrequencia === 'Diária' ? 'X' : ' ';
    const freqSemanal = contratoFrequencia === 'Semanal' ? 'X' : ' ';
    const freqMensal = contratoFrequencia === 'Mensal' ? 'X' : ' ';

    const valorFormatado = contratoValor 
      ? parseFloat(contratoValor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) 
      : '_______________';

    return `CONTRATO PARTICULAR DE LOCAÇÃO DE VEÍCULO AUTOMOTOR

Pelo presente instrumento particular, as partes adiante qualificadas têm entre si justo e contratado o que segue:

LOCADORA
•	Razão Social: ${locadorNome.toUpperCase()}
•	Nome Fantasia: ${locadorNome.toUpperCase()}
•	CNPJ: ${locadorDocumento}
•	Endereço: ${locadorEndereco}
•	Cidade/UF: ${cidadeContrato}
•	Telefone/WhatsApp: ${locadorTelefone}
•	E-mail: ________________________________________________
•	Representante Legal: ___________________________________
•	CPF do Representante: _________________________________

LOCATÁRIO
•	Nome Completo: ${motoristaNome.toUpperCase() || '________________________________________'}
•	CPF: ${motoristaCpf || '_________________________________________________'}
•	RG: ${motoristaRg || '_________________________________________________'}
•	CNH nº: ${motoristaCnh || '______________________________________________'} Categoria: ${motoristaCnhCat || '_____'} Validade: //____
•	Data de Nascimento: //____ Estado Civil: ${motoristaEstadoCivil || '_________________'}
•	Profissão: ____________________________________________
•	Endereço Completo: ${motoristaEndereco || '_____________________________________________________________________'}
•	Cidade/UF: ${cidadeContrato || '___________________________________________'} CEP: ____________________________
•	Telefone/WhatsApp: ${motoristaTelefone || '_____________________________________'}
•	E-mail: ________________________________________________
•	Nome da Mãe: _________________________________________
•	Chave PIX para Devolução de Caução: ___________________________________________

CLÁUSULA 1 – OBJETO
Constitui objeto deste contrato a locação do seguinte veículo, de propriedade ou posse legítima da LOCADORA:
•	Marca/Modelo: ${veiculoModelo || '_______________________'} Ano/Mod: ${veiculoAno || '_________'} Placa: ${veiculoPlaca || '___________'}
•	RENAVAM: ${veiculoRenavam || '_______________________'} Chassi: ${veiculoChassi || '_______________________'} 
•	Cód tabela FIPE: _______________________ Cor: ${veiculoCor || '_______________'}
•	Quilometragem Inicial: _______________ Quilometragem final: _______________ 
•	Número/ID do Rastreador: _________________

CLÁUSULA 2 – FINALIDADE ECONÔMICA
O veículo será utilizado exclusivamente para:
•	( ) Uso Particular
•	(X) Transporte de Passageiros por Aplicativos (Uber, 99, etc.)
•	( ) Outros: ___________________________________________

Parágrafo único: É expressamente vedada a utilização do veículo para fins ilícitos, sublocação, transporte de cargas perigosas, competições/rachas, reboque de outros veículos, ou qualquer atividade que viole as leis de trânsito vigentes.

CLÁUSULA 3 – REQUISITOS E OBRIGAÇÕES DE CONDUÇÃO
•	3.1. O LOCATÁRIO declara, sob as penas da lei, possuir: idade mínima de 21 anos, CNH definitiva e válida há pelo menos 2 anos, residência fixa e plena aptidão física, mental e legal para conduzir. A apresentação de documentos falsos ou desatualizados ensejará a rescisão imediata por justa causa, sem prejuízo das sanções penais.
•	3.2. O LOCATÁRIO obriga-se a conduzir o veículo com o máximo zelo, cuidado e prudência, respeitando rigorosamente as leis de trânsito.
•	3.3. É terminantemente PROIBIDO conduzir o veículo sob o efeito de álcool, drogas, substâncias entorpecentes, alucinógenas ou qualquer medicamento que altere os reflexos ou a capacidade psicomotora. O descumprimento desta obrigação resultará na rescisão imediata do contrato por justa causa, perda integral de coberturas de seguro e aplicação das penalidades cabíveis.

CLÁUSULA 4 – PRAZO E RESCISÃO ANTECIPADA
•	4.1. O contrato terá início em ${dataInicioFormat} e prazo mínimo de vigência de 06 (seis) meses.
•	4.2. A intenção de devolução por iniciativa do LOCATÁRIO deverá ser comunicada por escrito (e-mail ou WhatsApp) com antecedência mínima de 10 (dez) dias corridos.
•	4.3. A rescisão antecipada por iniciativa do LOCATÁRIO, ou motivada pelo seu inadimplemento, sujeitará este ao pagamento de multa rescisória equivalente a 30% (trinta por cento) sobre o valor do saldo restante que seria devido até o fim do prazo mínimo.

CLÁUSULA 5 – VALORES, PERIODICIDADE E EVOLUÇÃO DO PLANO
•	5.1. O valor da locação pactuado é de R$ ${valorFormatado} por período selecionado abaixo:
o	(${freqDiaria}) Diária (${freqSemanal}) Semanal (${freqMensal}) Mensal
•	5.2. Regra de Adimplência Opcional: O primeiro mês (30 dias) será pago impreterivelmente na modalidade diária, com vencimento até às 23h59 do respectivo dia.
•	5.3. Cumpridos os primeiros 30 dias sem qualquer atraso, a LOCADORA poderá liberar o pagamento Semanal. Após 3 meses consecutivos de pagamentos semanais pontuais, poderá liberar o pagamento Mensal.
•	5.4. O atraso em qualquer pagamento (seja por horas ou dias) importará no regresso automático do LOCATÁRIO à modalidade de cobrança Diária, perdendo os benefícios de prazos estendidos.

CLÁUSULA 6 – LIMITE DE QUILOMETRAGEM
O valor contratado contempla as seguintes franquias de quilometragem (não cumulativas entre os períodos):
•	Até 1.500 km por semana; ou Até 6.000 km por mês.
Parágrafo único: O quilômetro excedente será cobrado no valor de R$ 0,70 (setenta centavos) por km rodado, apurado via rastreador ou na vistoria presencial.

CLÁUSULA 7 – CAUÇÃO
•	7.1. Como garantia das obrigações, o LOCATÁRIO deposita, nesta data, a título de caução, o valor correspondente a 5% da Tabela FIPE vigente do veículo, totalizando R$ ${contratoCaucao || '_______________'}.
•	7.2. A caução poderá ser retida/utilizada pela LOCADORA para amortizar ou quitar (abater ou pagar integralmente): multas de trânsito, avarias no veículo, franquia de seguro, serviços de guincho, pedágios, diárias em atraso, lucros cessantes (tempo de carro parado na oficina), taxas de limpeza e qualquer outro débito gerado durante a locação.
•	7.3. O saldo remanescente da caução será devolvido ao LOCATÁRIO no prazo de até 3 (três) dias úteis após a devolução efetiva do veículo e realização da vistoria final de constatação de ausência de danos aparentes.

CLÁUSULA 8 – COMBUSTÍVEL E LIMPEZA
•	8.1. O veículo é entregue com o tanque de combustível CHEIO e limpo (higienizado/polido), devendo ser devolvido exatamente nas mesmas condições.
•	8.2. O descumprimento sujeitará o LOCATÁRIO ao repasse do custo do combustível pelo preço de mercado do dia, acrescido de taxa operacional de 20%, além de taxas de higienização técnica/lavagem detalhada conforme tabela de preços do estabelecimento parceiro.
•	8.3. É terminantemente PROIBIDO FUMAR (cigarro convencional, eletrônico ou derivados) no interior do veículo, sob pena de aplicação de multa imediata no valor de R$ 300,00 e cobrança de higienização interna para remoção de odores.

CLÁUSULA 9 – MANUTENÇÕES, REVISÕES E CUIDADOS DIÁRIOS
•	9.1. Compete ao LOCATÁRIO o custo financeiro das seguintes manutenções, troca de óleo de motor, filtros de óleo/ar, pastilhas de freio, alinhamento e balanceamento (na redes credenciadas pelo LOCADOR)
•	9.2. Compete ao LOCATÁRIO a obrigação de acompanhar os prazos e levar o veículo exclusivamente às oficinas credenciadas pela LOCADORA para a realização das revisões/manutenções periódicas nas datas ou quilometragens assinaladas.
•	9.3. O desleixo ou a não apresentação do veículo para revision na quilometragem correta ensejará multa compensatória de R$ 1.500,00 ao LOCATÁRIO, além da responsabilidade integral por eventuais danos mecânicos gerados (ex: motor fundido por falta de óleo ou água).
•	9.4. É dever diário do LOCATÁRIO verificar os níveis de fluidos (óleos (motor, câmbio, direção e freio) e líquido de arrefecimento) e a calibragem dos pneus. Danos causados por guias, buracos, riscos ou cortes nos pneus são de responsabilidade financeira exclusiva do LOCATÁRIO.

CLÁUSULA 10 – INFRAÇÕES DE TRÂNSITO, PEDÁGIOS E ESTACIONAMENTOS
•	10.1. O LOCATÁRIO é o único e exclusivo responsável civil e criminalmente por todas as infrações de trânsito lavradas durante o período em que o veículo esteve sob sua posse, autorizando expressamente a LOCADORA a indicá-lo como Real Condutor Infrator perante os órgãos de trânsito (Detran, PRF, Municípios, etc.).
•	10.2. Notificada a LOCADORA sobre a existência de multa, o LOCATÁRIO deverá efetuar o reembolso do valor integral em até 5 (cinco) dias úteis após o envio da notificação (via WhatsApp ou E-mail), independentemente do efeito suspensivo de eventuais recursos.

CLÁUSULA 11 – SINISTROS, SEGURO E VEÍCULO RESERVA
•	11.1. Em caso de colisão, furto, roubo ou qualquer sinistro, o LOCATÁRIO deverá obrigatoriamente: (i) Lavrar Boletim de Ocorrência policial em até 24h; (ii) Comunicar imediatamente a LOCADORA; (iii) Cooperar com fotos e relatos para acionamento do seguro.
•	11.2. Em qualquer situação de acionamento do seguro onde houver responsabilidade (culposa ou dolosa) do LOCATÁRIO ou de terceiros por ele permitidos, o LOCATÁRIO arcará com o valor integral da franquia securitária (Franquia participante: ${veiculoFranquiaSeguro}).
•	11.3. O LOCATÁRIO responderá por Lucros Cessantes (diárias que a locadora perdeu com o carro parado na oficina por culpa ou mau uso do locatário) limitados ao teto de até 15 (quinze) dias de paralisação do veículo.
•	11.4. Paralisação para Manutenção e Carro Reserva: Caso o veículo precise ficar imobilizado para manutenções preventivas ou corretivas de responsabilidade da LOCADORA por um período superior a 12 (doze) horas consecutivas, a LOCADORA deverá, a seu critério: (i) disponibilizar um veículo reserva equivalente para a continuidade do uso, ou (ii) conceder o desconto/abatimento proporcional do valor das diárias referente ao período em que o carro permaneceu parado na oficina. Esta regra não se aplica caso a manutenção tenha sido causada por mau uso, negligência ou acidente por culpa do LOCATÁRIO.
•	11.5. Substituição Definitiva ou Temporária de Veículo: Caso seja necessária ou conveniente a substituição do veículo objeto deste contrato — seja por motivos de manutenção, sinistro, ou por decisão comercial da LOCADORA (incluindo a hipótese de venda do veículo atual para reposição de frota) —, a LOCADORA poderá realizar a substituição, em caráter temporário ou definitivo, por outro veículo de categoria e qualidade equivalente. Realizada a troca, este contrato prosseguirá em sua totalidade, permanecendo plenamente válidas e inalteradas todas as suas demais cláusulas, prazos, valores e condições originais, vinculando-se automaticamente ao novo veículo disponibilizado.

CLÁUSULA 12 – RASTREAMENTO, MONITORAMENTO E BLOQUEIO REMOTO
•	12.1. O LOCATÁRIO declara-se ciente e concorda que o veículo está equipado com rastreador via satélite/celular, monitorando localização, velocidade e parâmetros de condução.
•	12.2. Ocorrendo inadimplemento superior a 48 (quarenta e oito) horas ou descumprimento grave de qualquer cláusula (como saída do perímetro urbano autorizado), a LOCADORA fica desde já autorizada a efetuar o BLOQUEIO ELETRÔNICO REMOTO do motor do veículo por medida de segurança, independentemente de aviso prévio.
•	12.3. A violação, desligamento, tentativa de fraude, adulteração ou destruição do sistema de rastreamento, bem como qualquer tipo de violação, adulteração, desligamento ou desconexão do velocímetro ou do odômetro do veículo, gera a rescisão contratual imediata por justa causa e a aplicação de multa punitiva correspondente a 1 (uma) mensalidade vigente, sem prejuízo da responsabilidade civil e criminal pelas perdas e danos decorrentes.

CLÁUSULA 13 – INADIMPLÊNCIA E REPOSSE DO VEÍCULO
•	13.1. O atraso no pagamento de qualquer obrigação ensejará a aplicação de multa moratória de 2% (dois por cento) sobre o débito, acrescida de juros de 1% (um por cento) ao mês e correção monetária.
•	13.2. Configurado o atraso superior a 3 (três) dias, o contrato restará rescindido de pleno direito, ficando a LOCADORA autorizada a proceder com a retomada/reposse imediata do veículo onde quer que ele se encontre, correndo por conta do LOCATÁRIO as despesas com guincho e custas de localização.

CLÁUSULA 14 – DEVOLUÇÃO E CRIME DE APROPRIAÇÃO INDÉBITA
A não devolução do veículo na data, hora e local previamente agendados, ou após a ordem de reposse por inadimplência, configurará flagrante crime de APROPRIAÇÃO INDÉBITA (Artigo 168 do Código Penal Brasileiro), ensejando a imediata comunicação policial via notícia-crime (Boletim de Ocorrência) e expedição de mandado de busca e apreensão.

CLÁUSULA 15 – PROTEÇÃO DE DADOS (LGPD) E CONSULTA DE CRÉDITO
O LOCATÁRIO autoriza expressamente a LOCADORA a realizar consultas cadastrais junto aos órgãos de proteção ao crédito (SPC, SERASA, Boa Vista) bem como a coletar, tratar e compartilhar seus dados pessoais e de localização para fins estritamente vinculados à execução deste contrato, cobranças e segurança do patrimônio, em conformidade com a Lei nº 13.709/18 (LGPD).

CLÁUSULA 16 – TÍTULO EXECUTIVO E FORO
As partes reconhecem este contrato como Título Executivo Extrajudicial (Art. 784, III, do CPC). Para dirimir quaisquer dúvidas decorrentes deste instrumento, elegem o Foro da Comarca de ${cidadeContrato || '______________________________'}, renunciando a qualquer outro por mais privilegiado que seja.

Por estarem assim justos e contratados, assinam o presente instrumento em 02 (duas) vias de igual teor, na presença de 02 (duas) testemunhas abaixo assinadas.

Local e Data: ${cidadeContrato || '________________________'}, ${dataAtualExtenso}.


LOCADORA (Assinatura/Certificado Digital)
______________________________________________________
LOCADORA: ${locadorNome.toUpperCase()}


LOCATÁRIO (Assinatura/Certificado Digital)
______________________________________________________
LOCATÁRIO: ${motoristaNome.toUpperCase()}
CPF: ${motoristaCpf}


TESTEMUNHAS:
1.	Nome: _________________________ CPF: _______________________ Ass: ______________
2.	Nome: _________________________ CPF: _______________________ Ass: ______________


ANEXO I – CHECKLIST DE ENTREGA (VISTORIA COMPLEMENTAR)
•	[ ] Chave Principal
•	[ ] Chave Reserva
•	[ ] CRLV-e Impresso
•	[ ] Suporte de Celular
•	[ ] Macaco / Triângulo
•	[ ] Chave de Roda
•	[ ] Pneu Estepe
•	[ ] Capa de Banco
•	[ ] Manual do Proprietário
•	[ ] Tapetes Internos
•	[ ] Kit Multimídia / Som
•	[ ] Nível de Combustível: [1/1] Full`;
  };

  // Sync edited text back or set initial text
  useEffect(() => {
    if (!isEditMode) {
      setContratoTextoCustom(getDynamicContractText());
    }
  }, [
    isEditMode, selectedContratoId, locadorNome, locadorDocumento, locadorEndereco, locadorTelefone, cidadeContrato,
    motoristaNome, motoristaCpf, motoristaRg, motoristaCnh, motoristaCnhCat, motoristaTelefone, motoristaEndereco, motoristaEstadoCivil,
    veiculoModelo, veiculoPlaca, veiculoCor, veiculoAno, veiculoChassi, veiculoRenavam, veiculoFranquiaSeguro,
    contratoValor, contratoFrequencia, contratoDiaCobranca, contratoKmFranquia, contratoCaucao, contratoInicio, contratoFim
  ]);

  const handlePrint = () => {
    // Elegant printing mechanism that displays only the contract content in a print dialog
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      onTriggerToast('Habilite popups no seu navegador para poder imprimir o contrato!', 'warning');
      return;
    }

    const htmlContent = `
      <html>
        <head>
          <title>Contrato de Locação - ${motoristaNome}</title>
          <style>
            body {
              font-family: 'Times New Roman', Times, serif;
              line-height: 1.6;
              color: #1a1a1a;
              margin: 40px;
              font-size: 14px;
            }
            h1, h2, h3 {
              text-align: center;
              font-weight: bold;
              margin-bottom: 20px;
            }
            p {
              margin-bottom: 15px;
              text-align: justify;
              text-indent: 40px;
            }
            .content-raw {
              white-space: pre-wrap;
              word-wrap: break-word;
              text-align: justify;
            }
            @media print {
              body { margin: 20px; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="content-raw">${contratoTextoCustom || getDynamicContractText()}</div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `;
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    onTriggerToast('Contrato preparado para impressão!', 'success');
  };

  const handleSendWhatsApp = () => {
    if (!motoristaTelefone) {
      onTriggerToast('Telefone do motorista não informado!', 'warning');
      return;
    }

    const cleanPhone = motoristaTelefone.replace(/\D/g, '');
    const dataInicioFormat = contratoInicio ? contratoInicio.split('-').reverse().join('/') : '—';
    const valorAluguelBrl = contratoValor ? parseFloat(contratoValor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—';

    const textMessage = `Olá, *${motoristaNome}*! Segue o resumo do seu *Contrato de Locação*:\n\n` +
      `🚗 *Veículo:* ${veiculoModelo} (${veiculoPlaca})\n` +
      `📅 *Início:* ${dataInicioFormat}\n` +
      `💰 *Valor:* ${valorAluguelBrl} (${contratoFrequencia})\n` +
      `💳 *Dia de Cobrança:* ${contratoDiaCobranca}\n` +
      `🔒 *Caução:* R$ ${contratoCaucao}\n` +
      `🛣️ *KM Franquia:* ${contratoKmFranquia} km inclusos\n\n` +
      `*Cláusula de Seguro:* Em caso de sinistro ou colisão, a franquia participante é de *${veiculoFranquiaSeguro}*.\n\n` +
      `Por favor, acesse o documento completo em anexo ou responda com "De Acordo" para validarmos a assinatura eletrônica digital.\n\n` +
      `Qualquer dúvida, estamos à disposição!\n*Financeiro AutoERP*`;

    const encodedMessage = encodeURIComponent(textMessage);
    const whatsappUrl = `https://api.whatsapp.com/send?phone=55${cleanPhone}&text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank');
    onTriggerToast('Mensagem com dados do contrato gerada e enviada via WhatsApp!', 'success');
  };

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(contratoTextoCustom || getDynamicContractText());
    onTriggerToast('Texto do contrato copiado para a área de transferência!', 'success');
  };

  return (
    <div className="flex flex-col gap-6" id="modelo-contrato-view-container">
      {/* Top action header */}
      {!hideSelector && (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-100 shadow-3xs">
          <div>
            <h2 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
              <FileText className="w-5 h-5 text-red-600" /> Gerador de Contrato PDF
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              Selecione um contrato ativo ou insira os dados para gerar e enviar o documento em formato legal.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedContratoId}
              onChange={(e) => setSelectedContratoId(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-red-600 shadow-3xs"
            >
              <option value="">-- Preencher de Contrato Existente --</option>
              {contratos.map(c => {
                const mot = motoristas.find(m => m.cpf === c.motoristaCpf);
                const veic = veiculos.find(v => v.placa === c.veiculoPlaca);
                return (
                  <option key={c.id} value={c.id}>
                    Contrato {c.id} - {mot ? mot.nome : c.motoristaCpf} ({veic ? veic.modelo : c.veiculoPlaca})
                  </option>
                );
              })}
            </select>

            {selectedContratoId && (
              <button
                onClick={() => {
                  setSelectedContratoId('');
                  onTriggerToast('Campos limpos com sucesso!', 'success');
                }}
                className="p-2 text-slate-400 hover:text-slate-600 bg-slate-50 border border-slate-100 hover:border-slate-200 rounded-xl transition-all"
                title="Limpar seleção"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left column: Configurations */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          
          {/* LOCADOR DATA */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-3xs space-y-4">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-slate-50">
              <Building className="w-4 h-4 text-slate-400" /> 1. Dados do Locador
            </h3>
            
            <div className="grid grid-cols-1 gap-3.5">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Razão Social / Nome Completo</label>
                <input
                  type="text"
                  value={locadorNome}
                  onChange={(e) => setLocadorNome(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-red-600"
                  placeholder="Nome do Locador"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">CNPJ ou CPF</label>
                  <input
                    type="text"
                    value={locadorDocumento}
                    onChange={(e) => setLocadorDocumento(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-red-600"
                    placeholder="Doc. Locador"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">WhatsApp / Contato</label>
                  <input
                    type="text"
                    value={locadorTelefone}
                    onChange={(e) => setLocadorTelefone(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-red-600"
                    placeholder="WhatsApp do Locador"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Endereço Completo</label>
                <input
                  type="text"
                  value={locadorEndereco}
                  onChange={(e) => setLocadorEndereco(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-red-600"
                  placeholder="Rua, Número, Bairro, Cidade - UF"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Cidade de Assinatura do Contrato</label>
                <input
                  type="text"
                  value={cidadeContrato}
                  onChange={(e) => setCidadeContrato(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-red-600"
                  placeholder="Ex: São Paulo"
                />
              </div>
            </div>
          </div>

          {/* LOCATÁRIO DATA */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-3xs space-y-4">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-slate-50">
              <User className="w-4 h-4 text-slate-400" /> 2. Dados do Locatário (Motorista)
            </h3>

            <div className="grid grid-cols-1 gap-3.5">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Nome Completo</label>
                <input
                  type="text"
                  value={motoristaNome}
                  onChange={(e) => setMotoristaNome(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-red-600"
                  placeholder="Nome do motorista"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">CPF</label>
                  <input
                    type="text"
                    value={motoristaCpf}
                    onChange={(e) => setMotoristaCpf(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-red-600"
                    placeholder="CPF do motorista"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">RG</label>
                  <input
                    type="text"
                    value={motoristaRg}
                    onChange={(e) => setMotoristaRg(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-red-600"
                    placeholder="RG do motorista"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Número CNH</label>
                  <input
                    type="text"
                    value={motoristaCnh}
                    onChange={(e) => setMotoristaCnh(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-red-600"
                    placeholder="CNH"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Categoria</label>
                  <input
                    type="text"
                    value={motoristaCnhCat}
                    onChange={(e) => setMotoristaCnhCat(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-red-600"
                    placeholder="Ex: AB"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">WhatsApp / Tel</label>
                  <input
                    type="text"
                    value={motoristaTelefone}
                    onChange={(e) => setMotoristaTelefone(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-red-600"
                    placeholder="Contato motorista"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Estado Civil</label>
                  <select
                    value={motoristaEstadoCivil}
                    onChange={(e) => setMotoristaEstadoCivil(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-red-600"
                  >
                    <option value="Solteiro(a)">Solteiro(a)</option>
                    <option value="Casado(a)">Casado(a)</option>
                    <option value="Divorciado(a)">Divorciado(a)</option>
                    <option value="Viúvo(a)">Viúvo(a)</option>
                    <option value="União Estável">União Estável</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Endereço de Residência</label>
                <input
                  type="text"
                  value={motoristaEndereco}
                  onChange={(e) => setMotoristaEndereco(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-red-600"
                  placeholder="Endereço do motorista"
                />
              </div>
            </div>
          </div>

          {/* VEÍCULO DATA */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-3xs space-y-4">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-slate-50">
              <Car className="w-4 h-4 text-slate-400" /> 3. Dados do Veículo
            </h3>

            <div className="grid grid-cols-1 gap-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Marca / Modelo</label>
                  <input
                    type="text"
                    value={veiculoModelo}
                    onChange={(e) => setVeiculoModelo(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-red-600"
                    placeholder="Modelo do carro"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Placa</label>
                  <input
                    type="text"
                    value={veiculoPlaca}
                    onChange={(e) => setVeiculoPlaca(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-red-600"
                    placeholder="Placa"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Cor</label>
                  <input
                    type="text"
                    value={veiculoCor}
                    onChange={(e) => setVeiculoCor(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-red-600"
                    placeholder="Cor"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Ano Fab/Mod</label>
                  <input
                    type="text"
                    value={veiculoAno}
                    onChange={(e) => setVeiculoAno(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-red-600"
                    placeholder="Ano"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Franquia Seguro</label>
                  <input
                    type="text"
                    value={veiculoFranquiaSeguro}
                    onChange={(e) => setVeiculoFranquiaSeguro(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-red-600"
                    placeholder="Ex: R$ 2.500,00"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Renavam</label>
                  <input
                    type="text"
                    value={veiculoRenavam}
                    onChange={(e) => setVeiculoRenavam(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-red-600"
                    placeholder="Renavam"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Chassi</label>
                  <input
                    type="text"
                    value={veiculoChassi}
                    onChange={(e) => setVeiculoChassi(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-red-600"
                    placeholder="Chassi"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* CONTRATO TERMS */}
          <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-3xs space-y-4 mb-6">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-slate-50">
              <Calendar className="w-4 h-4 text-slate-400" /> 4. Condições e Valores
            </h3>

            <div className="grid grid-cols-1 gap-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Valor Aluguel (R$)</label>
                  <input
                    type="number"
                    value={contratoValor}
                    onChange={(e) => setContratoValor(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-red-600"
                    placeholder="Ex: 500"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Periodicidade</label>
                  <select
                    value={contratoFrequencia}
                    onChange={(e) => setContratoFrequencia(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-red-600"
                  >
                    <option value="Diário">Diário</option>
                    <option value="Semanal">Semanal</option>
                    <option value="Mensal">Mensal</option>
                    <option value="Anual">Anual</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Dia Cobrança</label>
                  <input
                    type="text"
                    value={contratoDiaCobranca}
                    onChange={(e) => setContratoDiaCobranca(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-red-600"
                    placeholder="Dia de acerto"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Caução (R$)</label>
                  <input
                    type="text"
                    value={contratoCaucao}
                    onChange={(e) => setContratoCaucao(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-red-600"
                    placeholder="Ex: 1.000,00"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Franquia KM</label>
                  <input
                    type="text"
                    value={contratoKmFranquia}
                    onChange={(e) => setContratoKmFranquia(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-red-600"
                    placeholder="Ex: 1.500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Data de Início</label>
                  <input
                    type="date"
                    value={contratoInicio}
                    onChange={(e) => setContratoInicio(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-red-600"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Data de Fim (Opcional)</label>
                  <input
                    type="date"
                    value={contratoFim}
                    onChange={(e) => setContratoFim(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 focus:outline-none focus:border-red-600"
                  />
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Right column: Document Preview */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="bg-slate-800 text-slate-200 p-4 rounded-t-2xl flex items-center justify-between border-b border-slate-700">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-red-500" />
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-300">Visualização do Documento Impresso</span>
            </div>
            
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setIsEditMode(!isEditMode)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  isEditMode 
                    ? 'bg-red-600 text-white shadow-xs' 
                    : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                }`}
                title={isEditMode ? "Voltar ao modo de visualização" : "Editar cláusulas livremente"}
              >
                <Edit className="w-3.5 h-3.5" />
                {isEditMode ? 'Visualizar' : 'Editar Texto'}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-b-2xl border border-slate-200 shadow-xl overflow-hidden flex flex-col">
            {/* Paper Container */}
            <div className="p-8 md:p-12 overflow-y-auto max-h-[750px] bg-slate-50/50 border-b border-slate-100 flex justify-center">
              {isEditMode ? (
                <textarea
                  value={contratoTextoCustom}
                  onChange={(e) => setContratoTextoCustom(e.target.value)}
                  className="w-full h-[600px] p-6 bg-white border border-slate-200 rounded-xl shadow-inner font-mono text-xs leading-relaxed text-slate-800 focus:outline-none focus:border-red-500"
                  style={{ resize: 'none' }}
                />
              ) : (
                <div className="w-full max-w-2xl bg-white p-8 md:p-10 shadow-md border border-slate-200 text-slate-800 font-serif text-[11px] md:text-xs leading-relaxed whitespace-pre-wrap text-justify shadow-slate-100">
                  {contratoTextoCustom || getDynamicContractText()}
                </div>
              )}
            </div>

            {/* Actions Footer */}
            <div className="p-5 bg-slate-50 flex flex-wrap gap-3 items-center justify-between">
              <div className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                Ações rápidas de exportação
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleCopyToClipboard}
                  className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-3xs cursor-pointer"
                >
                  <Copy className="w-4 h-4 text-slate-500" />
                  Copiar Texto
                </button>
                
                <button
                  onClick={handlePrint}
                  className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-3xs cursor-pointer"
                >
                  <Printer className="w-4 h-4 text-slate-500" />
                  Imprimir / PDF
                </button>

                <button
                  onClick={handleSendWhatsApp}
                  disabled={!motoristaTelefone}
                  className={`px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all shadow-md cursor-pointer ${
                    motoristaTelefone
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white hover:shadow-emerald-600/20'
                      : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  <Send className="w-4 h-4" />
                  Enviar no WhatsApp
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
