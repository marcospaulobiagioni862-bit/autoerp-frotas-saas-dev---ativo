export default function getTabTitle(activeTab: string): string {
  switch (activeTab) {
    case 'dashboard': return 'Balanço e Dashboard Operacional';
    case 'fleet_dashboard': return 'Gestão de Frota & Análise de Desempenho';
    case 'veiculos': return 'Controle de Veículos';
    case 'motoristas': return 'Cadastro de Motoristas';
    case 'contratos': return 'Contratos de Aluguel';
    case 'pagamentos': return 'Módulo Financeiro — Pagamentos de Despesas';
    case 'recebimentos': return 'Módulo Financeiro — Recebimentos de Aluguéis';
    case 'financeiro_dashboard': return 'Módulo Financeiro — Dashboard Financeiro';
    case 'contas_receber': return 'Módulo Financeiro — Contas a Receber';
    case 'contas_pagar': return 'Módulo Financeiro — Contas a Pagar';
    case 'fluxo_caixa': return 'Módulo Financeiro — Fluxo de Caixa';
    case 'despesas_veiculo': return 'Módulo Financeiro — Despesas por Veículo';
    case 'auditoria': return 'Auditoria & Conciliação de Contas';
    case 'manutencao': return 'Histórico de Manutenções e OS';
    case 'km_carros': return 'Controle de KM e Alertas de Troca de Óleo';
    case 'relatorios': return 'Relatórios de Gestão';
    case 'inadimplentes': return 'Painel de Inadimplência Ativa';
    case 'fotos_videos': return 'Galeria de Fotos e Vídeos';
    case 'seguranca_status': return 'Monitoramento e Apólices Ativas';
    case 'seguradoras': return 'Seguradoras e Apólices';
    case 'documentos': return 'Controle de Documentos';
    case 'detran_regras': return 'Regras e Calendários DETRAN/SP';
    case 'rastreadores': return 'Gestão de Rastreadores';
    case 'acessorios': return 'Controle de Acessórios';
    case 'arquivo_morto': return 'Arquivo Morto (Histórico)';
    default: return 'AutoERP';
  }
}
