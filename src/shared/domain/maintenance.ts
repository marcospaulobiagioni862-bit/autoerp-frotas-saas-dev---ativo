import { Veiculo, Manutencao, CustomMaintItem } from '../../types';

export interface MaintAlert {
  type: 'oleo' | 'correia' | 'freio' | 'embreagem' | 'custom';
  label: string;
  emoji: string;
  lastKm: number;
  period: number;
  kmSinceChange: number;
  kmRemaining: number;
  color: 'red' | 'yellow' | 'green';
  statusLabel: 'CRÍTICO' | 'Atenção' | 'Em dia';
  description: string;
}

export function getVehicleMaintenanceAlerts(v: Veiculo, manutencoes: Manutencao[]): MaintAlert[] {
  const alerts: MaintAlert[] = [];
  const currentKm = v.km_atual || v.km || v.km_inicial || 0;

  // 1. Troca de Óleo
  {
    const oilMaints = (manutencoes || [])
      .filter(m => m.veiculoPlaca === v.placa && m.status === 'Concluída' && m.tipo.toLowerCase().includes('óleo'))
      .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
    
    const lastKm = oilMaints.length > 0 ? oilMaints[0].km : (v.maint_oleo_km_ultimo ?? v.km_inicial ?? 0);
    const period = v.maint_oleo_periodo ?? 10000;
    const kmSinceChange = currentKm - lastKm;
    const kmRemaining = period - kmSinceChange;
    
    let color: 'red' | 'yellow' | 'green' = 'green';
    let statusLabel: 'CRÍTICO' | 'Atenção' | 'Em dia' = 'Em dia';
    const redThreshold = Math.max(1000, period * 0.10);
    const yellowThreshold = Math.max(2500, period * 0.25);
    
    if (kmRemaining <= redThreshold) {
      color = 'red';
      statusLabel = 'CRÍTICO';
    } else if (kmRemaining <= yellowThreshold) {
      color = 'yellow';
      statusLabel = 'Atenção';
    }

    const kmRemainingStr = kmRemaining < 0 
      ? `atrasado por ${Math.abs(kmRemaining).toLocaleString('pt-BR')} km` 
      : `restam ${kmRemaining.toLocaleString('pt-BR')} km`;

    alerts.push({
      type: 'oleo',
      label: 'Troca de Óleo',
      emoji: '🛢️',
      lastKm,
      period,
      kmSinceChange,
      kmRemaining,
      color,
      statusLabel,
      description: `Troca de Óleo ${statusLabel === 'Em dia' ? 'em dia' : statusLabel.toUpperCase()}: ${kmRemainingStr} (Última: ${lastKm.toLocaleString('pt-BR')} km, Recomendado: ${period.toLocaleString('pt-BR')} km)`
    });
  }

  // 2. Correia Dentada
  {
    const correiaMaints = (manutencoes || [])
      .filter(m => m.veiculoPlaca === v.placa && m.status === 'Concluída' && (m.tipo.toLowerCase().includes('correia') || m.tipo.toLowerCase().includes('dentada')))
      .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
    
    const lastKm = correiaMaints.length > 0 ? correiaMaints[0].km : (v.maint_correia_km_ultimo ?? v.km_inicial ?? 0);
    const period = v.maint_correia_periodo ?? 50000;
    const kmSinceChange = currentKm - lastKm;
    const kmRemaining = period - kmSinceChange;
    
    let color: 'red' | 'yellow' | 'green' = 'green';
    let statusLabel: 'CRÍTICO' | 'Atenção' | 'Em dia' = 'Em dia';
    const redThreshold = Math.max(1500, period * 0.10);
    const yellowThreshold = Math.max(3000, period * 0.25);
    
    if (kmRemaining <= redThreshold) {
      color = 'red';
      statusLabel = 'CRÍTICO';
    } else if (kmRemaining <= yellowThreshold) {
      color = 'yellow';
      statusLabel = 'Atenção';
    }

    const kmRemainingStr = kmRemaining < 0 
      ? `atrasado por ${Math.abs(kmRemaining).toLocaleString('pt-BR')} km` 
      : `restam ${kmRemaining.toLocaleString('pt-BR')} km`;

    alerts.push({
      type: 'correia',
      label: 'Correia Dentada',
      emoji: '⚙️',
      lastKm,
      period,
      kmSinceChange,
      kmRemaining,
      color,
      statusLabel,
      description: `Correia Dentada ${statusLabel === 'Em dia' ? 'em dia' : statusLabel.toUpperCase()}: ${kmRemainingStr} (Última: ${lastKm.toLocaleString('pt-BR')} km, Recomendado: ${period.toLocaleString('pt-BR')} km)`
    });
  }

  // 3. Revisão dos Freios
  {
    const freioMaints = (manutencoes || [])
      .filter(m => m.veiculoPlaca === v.placa && m.status === 'Concluída' && (m.tipo.toLowerCase().includes('freio') || m.tipo.toLowerCase().includes('pastilha') || m.tipo.toLowerCase().includes('disco')))
      .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
    
    const lastKm = freioMaints.length > 0 ? freioMaints[0].km : (v.maint_freio_km_ultimo ?? v.km_inicial ?? 0);
    const period = v.maint_freio_periodo ?? 20000;
    const kmSinceChange = currentKm - lastKm;
    const kmRemaining = period - kmSinceChange;
    
    let color: 'red' | 'yellow' | 'green' = 'green';
    let statusLabel: 'CRÍTICO' | 'Atenção' | 'Em dia' = 'Em dia';
    const redThreshold = Math.max(1000, period * 0.10);
    const yellowThreshold = Math.max(2500, period * 0.25);
    
    if (kmRemaining <= redThreshold) {
      color = 'red';
      statusLabel = 'CRÍTICO';
    } else if (kmRemaining <= yellowThreshold) {
      color = 'yellow';
      statusLabel = 'Atenção';
    }

    const kmRemainingStr = kmRemaining < 0 
      ? `atrasado por ${Math.abs(kmRemaining).toLocaleString('pt-BR')} km` 
      : `restam ${kmRemaining.toLocaleString('pt-BR')} km`;

    alerts.push({
      type: 'freio',
      label: 'Revisão dos Freios',
      emoji: '🛑',
      lastKm,
      period,
      kmSinceChange,
      kmRemaining,
      color,
      statusLabel,
      description: `Revisão dos Freios ${statusLabel === 'Em dia' ? 'em dia' : statusLabel.toUpperCase()}: ${kmRemainingStr} (Última: ${lastKm.toLocaleString('pt-BR')} km, Recomendado: ${period.toLocaleString('pt-BR')} km)`
    });
  }

  // 4. Troca de Embreagem
  {
    const embreagemMaints = (manutencoes || [])
      .filter(m => m.veiculoPlaca === v.placa && m.status === 'Concluída' && m.tipo.toLowerCase().includes('embreagem'))
      .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());
    
    const lastKm = embreagemMaints.length > 0 ? embreagemMaints[0].km : (v.maint_embreagem_km_ultimo ?? v.km_inicial ?? 0);
    const period = v.maint_embreagem_periodo ?? 80000;
    const kmSinceChange = currentKm - lastKm;
    const kmRemaining = period - kmSinceChange;
    
    let color: 'red' | 'yellow' | 'green' = 'green';
    let statusLabel: 'CRÍTICO' | 'Atenção' | 'Em dia' = 'Em dia';
    const redThreshold = Math.max(2000, period * 0.10);
    const yellowThreshold = Math.max(5000, period * 0.25);
    
    if (kmRemaining <= redThreshold) {
      color = 'red';
      statusLabel = 'CRÍTICO';
    } else if (kmRemaining <= yellowThreshold) {
      color = 'yellow';
      statusLabel = 'Atenção';
    }

    const kmRemainingStr = kmRemaining < 0 
      ? `atrasado por ${Math.abs(kmRemaining).toLocaleString('pt-BR')} km` 
      : `restam ${kmRemaining.toLocaleString('pt-BR')} km`;

    alerts.push({
      type: 'embreagem',
      label: 'Troca de Embreagem',
      emoji: '⛓️',
      lastKm,
      period,
      kmSinceChange,
      kmRemaining,
      color,
      statusLabel,
      description: `Troca de Embreagem ${statusLabel === 'Em dia' ? 'em dia' : statusLabel.toUpperCase()}: ${kmRemainingStr} (Última: ${lastKm.toLocaleString('pt-BR')} km, Recomendado: ${period.toLocaleString('pt-BR')} km)`
    });
  }

  // 5. Custom Maint Items
  if (v.maint_custom_items && v.maint_custom_items.length > 0) {
    v.maint_custom_items.forEach((item: CustomMaintItem) => {
      const hist = (manutencoes || [])
        .filter(m => m.veiculoPlaca === v.placa && m.status === 'Concluída' && m.tipo.toLowerCase() === item.label.toLowerCase())
        .sort((a, b) => new Date(b.data).getTime() - new Date(a.data).getTime());

      const lastKm = hist.length > 0 ? hist[0].km : (item.lastKm ?? v.km_inicial ?? 0);
      const period = item.period || 10000;
      const kmSinceChange = currentKm - lastKm;
      const kmRemaining = period - kmSinceChange;

      let color: 'red' | 'yellow' | 'green' = 'green';
      let statusLabel: 'CRÍTICO' | 'Atenção' | 'Em dia' = 'Em dia';
      const redThreshold = Math.max(1000, period * 0.10);
      const yellowThreshold = Math.max(2500, period * 0.25);

      if (kmRemaining <= redThreshold) {
        color = 'red';
        statusLabel = 'CRÍTICO';
      } else if (kmRemaining <= yellowThreshold) {
        color = 'yellow';
        statusLabel = 'Atenção';
      }

      const kmRemainingStr = kmRemaining < 0 
        ? `atrasado por ${Math.abs(kmRemaining).toLocaleString('pt-BR')} km` 
        : `restam ${kmRemaining.toLocaleString('pt-BR')} km`;

      alerts.push({
        type: 'custom',
        label: item.label,
        emoji: item.emoji || '🔧',
        lastKm,
        period,
        kmSinceChange,
        kmRemaining,
        color,
        statusLabel,
        description: `${item.label} ${statusLabel === 'Em dia' ? 'em dia' : statusLabel.toUpperCase()}: ${kmRemainingStr} (Última: ${lastKm.toLocaleString('pt-BR')} km, Recomendado: ${period.toLocaleString('pt-BR')} km)`
      });
    });
  }

  return alerts;
}
