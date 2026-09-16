import { Veiculo, Motorista, Contrato, ContaReceber, ContaPagar, Manutencao, KmRegistro, Pagamento } from '../types';

export const isSimulation = (item: any) => {
  return item?.id?.startsWith('SIM-') || item?.obs?.includes('SIMULAÇÃO') || item?.observacoes?.includes('SIMULAÇÃO') || item?.codigo?.startsWith('SIM-');
};

const SIM_IDENTIFIER = "BASE DE TESTE - DADOS FICTÍCIOS - NÃO UTILIZAR PARA OPERAÇÕES REAIS";

export const generateSimulationData = () => {
  const today = new Date();
  const dateStr = today.toISOString().split('T')[0];
  const lastMonth = new Date(today); lastMonth.setMonth(today.getMonth() - 1);
  const nextMonth = new Date(today); nextMonth.setMonth(today.getMonth() + 1);
  
  const lastMonthStr = lastMonth.toISOString().split('T')[0];
  const nextMonthStr = nextMonth.toISOString().split('T')[0];

  // 1. Motoristas
  const motoristas: Motorista[] = [
    {
      nome: 'João Carlos Teste', cpf: '000.000.000-01', cnh: '00000000001', cat: 'B', tel: '(00) 00000-0001', email: 'joao@simulacao.com',
      end: 'Rua Fictícia, 100', cidade: 'São Paulo', emergencia: 'Ninguém', status: 'Ativo', cnh_venc: nextMonthStr, obs: SIM_IDENTIFIER, plataforma: 'Nenhuma'
    },
    {
      nome: 'Carlos Eduardo Simulado', cpf: '000.000.000-02', cnh: '00000000002', cat: 'B', tel: '(00) 00000-0002', email: 'carlos@simulacao.com',
      end: 'Rua Simulada, 200', cidade: 'São Paulo', emergencia: 'Ninguém', status: 'Ativo', cnh_venc: nextMonthStr, obs: SIM_IDENTIFIER, plataforma: 'Nenhuma'
    },
    {
      nome: 'Marcos Antônio Teste', cpf: '000.000.000-03', cnh: '00000000003', cat: 'B', tel: '(00) 00000-0003', email: 'marcos@simulacao.com',
      end: 'Av Teste, 300', cidade: 'São Paulo', emergencia: 'Ninguém', status: 'Inadimplente', cnh_venc: nextMonthStr, obs: SIM_IDENTIFIER, plataforma: 'Nenhuma'
    },
    {
      nome: 'Ricardo Alves Simulado', cpf: '000.000.000-04', cnh: '00000000004', cat: 'B', tel: '(00) 00000-0004', email: 'ricardo@simulacao.com',
      end: 'Travessa Fictícia, 400', cidade: 'São Paulo', emergencia: 'Ninguém', status: 'Ativo', cnh_venc: nextMonthStr, obs: SIM_IDENTIFIER, plataforma: 'Nenhuma'
    },
    {
      nome: 'Paulo Henrique Teste', cpf: '000.000.000-05', cnh: '00000000005', cat: 'B', tel: '(00) 00000-0005', email: 'paulo@simulacao.com',
      end: 'Rua Exemplo, 500', cidade: 'São Paulo', emergencia: 'Ninguém', status: 'Inativo', cnh_venc: nextMonthStr, obs: SIM_IDENTIFIER, plataforma: 'Nenhuma'
    }
  ];

  // 2. Veículos
  const veiculos: Veiculo[] = [
    {
      placa: 'SIM0001', modelo: 'Corolla', marca: 'Toyota', ano: 2023, cor: 'Prata', renavam: '00000000001', valor: 120000,
      status: 'Alugado', motoristaCpf: '000.000.000-01', km_inicial: 50000, km_atual: 52800, km: 52800, plataforma: 'Uber', categoria: 'Automóveis'
    },
    {
      placa: 'SIM0002', modelo: 'Onix', marca: 'Chevrolet', ano: 2022, cor: 'Branco', renavam: '00000000002', valor: 75000,
      status: 'Alugado', motoristaCpf: '000.000.000-02', km_inicial: 70000, km_atual: 74500, km: 74500, plataforma: 'Uber', categoria: 'Automóveis'
    },
    {
      placa: 'SIM0003', modelo: 'Polo', marca: 'Volkswagen', ano: 2023, cor: 'Preto', renavam: '00000000003', valor: 85000,
      status: 'Alugado', motoristaCpf: '000.000.000-03', km_inicial: 85000, km_atual: 91200, km: 91200, plataforma: 'Uber', categoria: 'Automóveis'
    },
    {
      placa: 'SIM0004', modelo: 'Cronos', marca: 'Fiat', ano: 2022, cor: 'Vermelho', renavam: '00000000004', valor: 80000,
      status: 'Alugado', motoristaCpf: '000.000.000-04', km_inicial: 60000, km_atual: 63400, km: 63400, plataforma: 'Uber', categoria: 'Automóveis'
    },
    {
      placa: 'SIM0005', modelo: 'HB20', marca: 'Hyundai', ano: 2024, cor: 'Branco', renavam: '00000000005', valor: 85000,
      status: 'Disponível', km_inicial: 15000, km_atual: 18700, km: 18700, plataforma: 'Nenhuma', categoria: 'Automóveis'
    },
    {
      placa: 'SIM0006', modelo: 'Kwid', marca: 'Renault', ano: 2023, cor: 'Laranja', renavam: '00000000006', valor: 60000,
      status: 'Em preparação', km_inicial: 45000, km_atual: 46300, km: 46300, plataforma: 'Nenhuma', categoria: 'Automóveis'
    },
    {
      placa: 'SIM0007', modelo: 'Strada', marca: 'Fiat', ano: 2022, cor: 'Branca', renavam: '00000000007', valor: 90000,
      status: 'Disponível', km_inicial: 80000, km_atual: 82600, km: 82600, plataforma: 'Nenhuma', categoria: 'Caminhonetes'
    }
  ];

  // 3. Contratos
  const contratos: Contrato[] = [
    {
      id: 'SIM-CON-001', veiculoPlaca: 'SIM0001', motoristaCpf: '000.000.000-01', inicio: lastMonthStr, valor: 2800,
      frequencia: 'Mensal', diaCobranca: '10', kmFranquia: 3000, status: 'Ativo', caucao: 0, obs: SIM_IDENTIFIER
    },
    {
      id: 'SIM-CON-002', veiculoPlaca: 'SIM0002', motoristaCpf: '000.000.000-02', inicio: lastMonthStr, valor: 2600,
      frequencia: 'Mensal', diaCobranca: '05', kmFranquia: 2500, status: 'Ativo', caucao: 0, obs: SIM_IDENTIFIER
    },
    {
      id: 'SIM-CON-003', veiculoPlaca: 'SIM0003', motoristaCpf: '000.000.000-03', inicio: lastMonthStr, valor: 135,
      frequencia: 'Semanal', diaCobranca: 'Segunda-feira', kmFranquia: 3000, status: 'Ativo', caucao: 0, obs: SIM_IDENTIFIER
    },
    {
      id: 'SIM-CON-004', veiculoPlaca: 'SIM0004', motoristaCpf: '000.000.000-04', inicio: lastMonthStr, valor: 2750,
      frequencia: 'Mensal', diaCobranca: '15', kmFranquia: 3000, status: 'Ativo', caucao: 0, obs: SIM_IDENTIFIER
    },
    {
      id: 'SIM-CON-005', veiculoPlaca: 'SIM0005', motoristaCpf: '000.000.000-05', inicio: '2025-01-01', valor: 2500, fim: lastMonthStr,
      frequencia: 'Mensal', diaCobranca: '01', kmFranquia: 2500, status: 'Finalizado', caucao: 0, obs: SIM_IDENTIFIER
    }
  ];

  // 4 & 5 & 6. Contas a Receber (Receitas)
  const contasReceber: ContaReceber[] = [
    // João (Em dia)
    {
      id: 'SIM-REC-001', numeroLancamento: 'REC-SIM-001', descricao: 'Aluguel Mensal', clienteResponsavel: 'João Carlos Teste',
      motoristaCpf: '000.000.000-01', veiculoPlaca: 'SIM0001', contratoId: 'SIM-CON-001', categoria: 'Aluguel de Veículo',
      centroCusto: 'Frota Principal', valorOriginal: 2800, desconto: 0, acrescimo: 0, juros: 0, multa: 0, valorFinal: 2800,
      valorRecebido: 2800, saldoDevedor: 0, dataEmissao: lastMonthStr, dataVencimento: lastMonthStr, dataRealRecebimento: lastMonthStr,
      formaPagamento: 'PIX', status: 'Recebido', observacoes: SIM_IDENTIFIER, origemTipo: 'manual'
    },
    {
      id: 'SIM-REC-002', numeroLancamento: 'REC-SIM-002', descricao: 'KM Excedente', clienteResponsavel: 'João Carlos Teste',
      motoristaCpf: '000.000.000-01', veiculoPlaca: 'SIM0001', contratoId: 'SIM-CON-001', categoria: 'Aluguel de Veículo', subcategoria: 'KM Excedente',
      centroCusto: 'Frota Principal', valorOriginal: 280, desconto: 0, acrescimo: 0, juros: 0, multa: 0, valorFinal: 280,
      valorRecebido: 0, saldoDevedor: 280, dataEmissao: dateStr, dataVencimento: dateStr,
      formaPagamento: 'PIX', status: 'Em aberto', observacoes: SIM_IDENTIFIER, origemTipo: 'manual'
    },
    // Carlos (Cobrança em aberto e próxima vencimento)
    {
      id: 'SIM-REC-003', numeroLancamento: 'REC-SIM-003', descricao: 'Aluguel Mensal', clienteResponsavel: 'Carlos Eduardo Simulado',
      motoristaCpf: '000.000.000-02', veiculoPlaca: 'SIM0002', contratoId: 'SIM-CON-002', categoria: 'Aluguel de Veículo',
      centroCusto: 'Frota Principal', valorOriginal: 2600, desconto: 0, acrescimo: 0, juros: 0, multa: 0, valorFinal: 2600,
      valorRecebido: 0, saldoDevedor: 2600, dataEmissao: lastMonthStr, dataVencimento: dateStr,
      formaPagamento: 'Boleto', status: 'Em aberto', observacoes: SIM_IDENTIFIER, origemTipo: 'manual'
    },
    // Marcos (Em atraso, diárias)
    {
      id: 'SIM-REC-004', numeroLancamento: 'REC-SIM-004', descricao: '22 Diárias', clienteResponsavel: 'Marcos Antônio Teste',
      motoristaCpf: '000.000.000-03', veiculoPlaca: 'SIM0003', contratoId: 'SIM-CON-003', categoria: 'Aluguel de Veículo',
      centroCusto: 'Frota Principal', valorOriginal: 2970, desconto: 0, acrescimo: 0, juros: 50, multa: 100, valorFinal: 3120,
      valorRecebido: 0, saldoDevedor: 3120, dataEmissao: lastMonthStr, dataVencimento: lastMonthStr,
      formaPagamento: 'PIX', status: 'Vencido', observacoes: SIM_IDENTIFIER, origemTipo: 'manual'
    },
    {
      id: 'SIM-REC-005', numeroLancamento: 'REC-SIM-005', descricao: 'KM Excedente', clienteResponsavel: 'Marcos Antônio Teste',
      motoristaCpf: '000.000.000-03', veiculoPlaca: 'SIM0003', contratoId: 'SIM-CON-003', categoria: 'Aluguel de Veículo', subcategoria: 'KM Excedente',
      centroCusto: 'Frota Principal', valorOriginal: 540, desconto: 0, acrescimo: 0, juros: 10, multa: 20, valorFinal: 570,
      valorRecebido: 0, saldoDevedor: 570, dataEmissao: lastMonthStr, dataVencimento: lastMonthStr,
      formaPagamento: 'PIX', status: 'Vencido', observacoes: SIM_IDENTIFIER, origemTipo: 'manual'
    },
    // Ricardo (Pagamento parcial)
    {
      id: 'SIM-REC-006', numeroLancamento: 'REC-SIM-006', descricao: 'Aluguel Mensal', clienteResponsavel: 'Ricardo Alves Simulado',
      motoristaCpf: '000.000.000-04', veiculoPlaca: 'SIM0004', contratoId: 'SIM-CON-004', categoria: 'Aluguel de Veículo',
      centroCusto: 'Frota Principal', valorOriginal: 2750, desconto: 0, acrescimo: 0, juros: 0, multa: 0, valorFinal: 2750,
      valorRecebido: 1500, saldoDevedor: 1250, dataEmissao: lastMonthStr, dataVencimento: lastMonthStr, dataRealRecebimento: lastMonthStr,
      formaPagamento: 'PIX', status: 'Parcialmente recebido', observacoes: SIM_IDENTIFIER, origemTipo: 'manual'
    },
    // Multas
    {
      id: 'SIM-REC-007', numeroLancamento: 'REC-SIM-007', descricao: 'Multa de Trânsito Repassada', clienteResponsavel: 'Ricardo Alves Simulado',
      motoristaCpf: '000.000.000-04', veiculoPlaca: 'SIM0004', contratoId: 'SIM-CON-004', categoria: 'Cobrança Extra', subcategoria: 'Multa',
      centroCusto: 'Frota Principal', valorOriginal: 195.23, desconto: 0, acrescimo: 0, juros: 0, multa: 0, valorFinal: 195.23,
      valorRecebido: 0, saldoDevedor: 195.23, dataEmissao: dateStr, dataVencimento: nextMonthStr,
      formaPagamento: 'PIX', status: 'Em aberto', observacoes: SIM_IDENTIFIER, origemTipo: 'manual'
    },
    {
      id: 'SIM-REC-008', numeroLancamento: 'REC-SIM-008', descricao: 'Multa (50%) Repassada', clienteResponsavel: 'Carlos Eduardo Simulado',
      motoristaCpf: '000.000.000-02', veiculoPlaca: 'SIM0002', contratoId: 'SIM-CON-002', categoria: 'Cobrança Extra', subcategoria: 'Multa',
      centroCusto: 'Frota Principal', valorOriginal: 65.08, desconto: 0, acrescimo: 0, juros: 0, multa: 0, valorFinal: 65.08,
      valorRecebido: 0, saldoDevedor: 65.08, dataEmissao: dateStr, dataVencimento: nextMonthStr,
      formaPagamento: 'PIX', status: 'Em aberto', observacoes: SIM_IDENTIFIER, origemTipo: 'manual'
    }
  ];

  // 8 & 9. Contas a Pagar (Despesas & Multas)
  const contasPagar: ContaPagar[] = [
    // Manutenção SIM0006
    {
      id: 'SIM-PAG-001', numeroLancamento: 'PAG-SIM-001', descricao: 'Troca de Óleo e Revisão', fornecedor: 'Oficina Fictícia',
      veiculoPlaca: 'SIM0006', categoria: 'MANUTENÇÃO', subcategoria: 'Revisão Geral', centroCusto: 'Frota Principal',
      valorOriginal: 1850, desconto: 0, juros: 0, multa: 0, valorFinal: 1850, valorPago: 0, saldoDevedor: 1850,
      dataEmissao: dateStr, dataVencimento: nextMonthStr, status: 'Em aberto', observacoes: SIM_IDENTIFIER, origemTipo: 'manual'
    },
    // Seguro SIM0007
    {
      id: 'SIM-PAG-002', numeroLancamento: 'PAG-SIM-002', descricao: 'Seguro Mensal', fornecedor: 'Seguradora Sim',
      veiculoPlaca: 'SIM0007', categoria: 'SEGURO', subcategoria: 'Apólice', centroCusto: 'Frota Principal',
      valorOriginal: 400, desconto: 0, juros: 0, multa: 0, valorFinal: 400, valorPago: 400, saldoDevedor: 0,
      dataEmissao: lastMonthStr, dataVencimento: lastMonthStr, dataRealPagamento: lastMonthStr, status: 'Pago', observacoes: SIM_IDENTIFIER, origemTipo: 'manual'
    },
    {
      id: 'SIM-PAG-003', numeroLancamento: 'PAG-SIM-003', descricao: 'Seguro Mensal', fornecedor: 'Seguradora Sim',
      veiculoPlaca: 'SIM0007', categoria: 'SEGURO', subcategoria: 'Apólice', centroCusto: 'Frota Principal',
      valorOriginal: 400, desconto: 0, juros: 0, multa: 0, valorFinal: 400, valorPago: 0, saldoDevedor: 400,
      dataEmissao: dateStr, dataVencimento: nextMonthStr, status: 'Em aberto', observacoes: SIM_IDENTIFIER, origemTipo: 'manual'
    },
    // IPVA / Licenciamento
    {
      id: 'SIM-PAG-004', numeroLancamento: 'PAG-SIM-004', descricao: 'IPVA 2026', fornecedor: 'SEFAZ',
      veiculoPlaca: 'SIM0005', categoria: 'DOCUMENTAÇÃO', subcategoria: 'IPVA', centroCusto: 'Frota Principal',
      valorOriginal: 1200, desconto: 0, juros: 0, multa: 0, valorFinal: 1200, valorPago: 0, saldoDevedor: 1200,
      dataEmissao: dateStr, dataVencimento: nextMonthStr, status: 'Em aberto', observacoes: SIM_IDENTIFIER, origemTipo: 'manual'
    },
    {
      id: 'SIM-PAG-005', numeroLancamento: 'PAG-SIM-005', descricao: 'Licenciamento', fornecedor: 'DETRAN',
      veiculoPlaca: 'SIM0003', categoria: 'DOCUMENTAÇÃO', subcategoria: 'Licenciamento', centroCusto: 'Frota Principal',
      valorOriginal: 160, desconto: 0, juros: 0, multa: 0, valorFinal: 160, valorPago: 0, saldoDevedor: 160,
      dataEmissao: lastMonthStr, dataVencimento: lastMonthStr, status: 'Vencido', observacoes: SIM_IDENTIFIER, origemTipo: 'manual'
    },
    // Multas
    {
      id: 'SIM-PAG-006', numeroLancamento: 'PAG-SIM-006', descricao: 'Multa Excesso Velocidade (Empresa)', fornecedor: 'DETRAN',
      veiculoPlaca: 'SIM0003', categoria: 'MULTAS E INFRAÇÕES', subcategoria: 'Multa', centroCusto: 'Frota Principal',
      valorOriginal: 293.47, desconto: 0, juros: 0, multa: 0, valorFinal: 293.47, valorPago: 0, saldoDevedor: 293.47,
      dataEmissao: lastMonthStr, dataVencimento: dateStr, status: 'Em aberto', observacoes: SIM_IDENTIFIER, origemTipo: 'manual'
    },
    {
      id: 'SIM-PAG-007', numeroLancamento: 'PAG-SIM-007', descricao: 'Multa Compartilhada', fornecedor: 'DETRAN',
      veiculoPlaca: 'SIM0002', categoria: 'MULTAS E INFRAÇÕES', subcategoria: 'Multa', centroCusto: 'Frota Principal',
      valorOriginal: 130.16, desconto: 0, juros: 0, multa: 0, valorFinal: 130.16, valorPago: 0, saldoDevedor: 130.16,
      dataEmissao: dateStr, dataVencimento: nextMonthStr, status: 'Em aberto', observacoes: SIM_IDENTIFIER, origemTipo: 'manual'
    }
  ];

  // Rastreador (Despesa)
  veiculos.forEach((v, idx) => {
    contasPagar.push({
      id: `SIM-PAG-RAST-${idx}`, numeroLancamento: `PAG-SIM-RAST-${idx}`, descricao: 'Mensalidade Rastreador', fornecedor: 'Rastreador Fictício',
      veiculoPlaca: v.placa, categoria: 'RASTREADOR', subcategoria: 'Mensalidade', centroCusto: 'Frota Principal',
      valorOriginal: 150, desconto: 0, juros: 0, multa: 0, valorFinal: 150, valorPago: 150, saldoDevedor: 0,
      dataEmissao: lastMonthStr, dataVencimento: lastMonthStr, dataRealPagamento: lastMonthStr, status: 'Pago', observacoes: SIM_IDENTIFIER, origemTipo: 'manual'
    });
  });

  // 7. Histórico de KM (pelo menos 8 por veículo)
  const kmRegistros: KmRegistro[] = [];
  veiculos.forEach(v => {
    let currentKm = v.km_inicial || 0;
    for (let i = 8; i >= 1; i--) {
      const pastDate = new Date(today);
      pastDate.setDate(today.getDate() - (i * 5));
      const step = Math.floor(((v.km_atual || 0) - (v.km_inicial || 0)) / 8);
      const newKm = i === 1 ? (v.km_atual || 0) : currentKm + step;
      kmRegistros.push({
        id: `SIM-KM-${v.placa}-${i}`,
        veiculoPlaca: v.placa,
        motoristaCpf: v.motoristaCpf,
        dataHora: pastDate.toISOString(),
        km: newKm,
        kmAnterior: currentKm,
        kmPercorridos: newKm - currentKm,
        usuario: 'Simulação',
        origem: i === 8 ? 'Entrega do Veículo' : (i === 1 ? 'Atualização Periódica' : 'Registro Manual'),
        observacao: SIM_IDENTIFIER
      });
      currentKm = newKm;
    }
  });

  return {
    motoristas,
    veiculos,
    contratos,
    contasReceber,
    contasPagar,
    kmRegistros
  };
};

export const applySimulation = () => {
  const data = generateSimulationData();
  
  const merge = (key: string, newData: any[]) => {
    const existingStr = localStorage.getItem(key);
    let existing: any[] = [];
    if (existingStr) {
      existing = JSON.parse(existingStr).filter((i: any) => !isSimulation(i));
    }
    localStorage.setItem(key, JSON.stringify([...existing, ...newData]));
  };

  merge('auto_erp_motoristas', data.motoristas);
  merge('auto_erp_veiculos', data.veiculos);
  merge('auto_erp_contratos', data.contratos);
  merge('auto_erp_contas_receber_v2', data.contasReceber);
  merge('auto_erp_contas_pagar_v2', data.contasPagar);
  merge('auto_erp_km_registros', data.kmRegistros);
  
  // Legacy arrays need to exist to avoid breaking older components before v2 full migration
  // Just filter them for simulation data as we don't necessarily generate old format, but if we do...
  const pagamentos = localStorage.getItem('auto_erp_pagamentos');
  if (pagamentos) {
      const filteredPagamentos = JSON.parse(pagamentos).filter((i: any) => !isSimulation(i));
      localStorage.setItem('auto_erp_pagamentos', JSON.stringify(filteredPagamentos));
  }
};

export const clearSimulation = () => {
  const clean = (key: string) => {
    const existingStr = localStorage.getItem(key);
    if (existingStr) {
      const existing = JSON.parse(existingStr).filter((i: any) => !isSimulation(i));
      localStorage.setItem(key, JSON.stringify(existing));
    }
  };

  clean('auto_erp_motoristas');
  clean('auto_erp_veiculos');
  clean('auto_erp_contratos');
  clean('auto_erp_contas_receber_v2');
  clean('auto_erp_contas_pagar_v2');
  clean('auto_erp_km_registros');
  clean('auto_erp_pagamentos');
};

export const hasSimulationData = () => {
  const check = (key: string) => {
    const existingStr = localStorage.getItem(key);
    if (existingStr) {
      return JSON.parse(existingStr).some((i: any) => isSimulation(i));
    }
    return false;
  };

  return check('auto_erp_motoristas') || check('auto_erp_veiculos');
};
