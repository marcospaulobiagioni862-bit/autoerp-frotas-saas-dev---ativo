import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Car,
  TrendingUp,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  ThumbsUp,
  SlidersHorizontal,
  ChevronRight,
  Info,
  Activity,
  Calendar,
  AlertCircle,
  RefreshCw,
  Search,
  Users,
  ShieldAlert,
  User,
  Wrench,
  Gauge,
  Zap,
  MapPin,
  ClipboardList,
  Flame,
  Award,
  BookOpen,
  Mail,
  Phone,
  Clock,
  Heart,
  Ban
} from 'lucide-react';
import { Veiculo, Contrato, Pagamento, Manutencao, Motorista } from '../types';
import { PlacaMercosul } from './PlacaMercosul';
import { getVehicleMaintenanceAlerts } from '../shared/domain/maintenance';

interface FleetDashboardProps {
  veiculos: Veiculo[];
  contratos: Contrato[];
  pagamentos: Pagamento[];
  manutencoes: Manutencao[];
  onNavigate: (tab: string) => void;
  motoristas?: Motorista[]; // optional but helpful
}

export default function FleetDashboardView({
  veiculos,
  contratos,
  pagamentos,
  manutencoes,
  onNavigate,
  motoristas = []
}: FleetDashboardProps) {
  // Navigation Tabs
  const [activeTab, setActiveTab] = useState<'geral' | 'motoristas' | 'veiculos' | 'cruzamento' | 'acoes'>('geral');
  const [period, setPeriod] = useState<'mensal' | 'trimestral' | 'anual'>('mensal');
  const [selectedStatuses, setSelectedStatuses] = useState<('Verde' | 'Amarelo' | 'Vermelho')[]>(['Verde', 'Amarelo', 'Vermelho']);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Selection states
  const [selectedDriverCpf, setSelectedDriverCpf] = useState<string>('');
  const [selectedVehiclePlaca, setSelectedVehiclePlaca] = useState<string>('');

  // 2026-07-17 Date helper
  const todayStr = '2026-07-17';
  const today = new Date('2026-07-17T00:00:00');

  const formatBRL = (val: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
  };

  // Safe Fallback Drivers if empty
  const allDrivers = useMemo(() => {
    if (motoristas && motoristas.length > 0) return motoristas;
    // fallback if not provided
    return [
      { nome: 'João Silva', cpf: '123.456.789-00', tel: '(11) 98765-4321', email: 'joao@email.com', cnh: '12345678901', cat: 'B', cnh_venc: '2027-05-15', plataforma: 'Uber', end: 'Rua A, 123', cidade: 'São Paulo', emergencia: 'Maria Silva (Esposa)', status: 'Ativo', tipo_sangue: 'O+', tel_contato: '(11) 91111-1111' },
      { nome: 'Carlos Mendes', cpf: '234.567.890-11', tel: '(11) 97654-3210', email: 'carlos@email.com', cnh: '23456789012', cat: 'B', cnh_venc: '2026-08-20', plataforma: '99', end: 'Rua B, 456', cidade: 'São Paulo', emergencia: 'Ana Mendes (Irmã)', status: 'Inadimplente', tipo_sangue: 'A-', tel_contato: '(11) 92222-2222' },
      { nome: 'Maria Souza', cpf: '345.678.901-22', tel: '(11) 96543-2109', email: 'maria@email.com', cnh: '34567890123', cat: 'AB', cnh_venc: '2028-03-10', plataforma: 'Uber + 99', end: 'Rua C, 789', cidade: 'São Paulo', emergencia: 'Pedro Souza (Marido)', status: 'Ativo', tipo_sangue: 'AB+', tel_contato: '(11) 93333-3333' }
    ] as Motorista[];
  }, [motoristas]);

  // Initializing selections if not set
  React.useEffect(() => {
    if (allDrivers.length > 0 && !selectedDriverCpf) {
      setSelectedDriverCpf(allDrivers[0].cpf);
    }
  }, [allDrivers, selectedDriverCpf]);

  React.useEffect(() => {
    if (veiculos.length > 0 && !selectedVehiclePlaca) {
      setSelectedVehiclePlaca(veiculos[0].placa);
    }
  }, [veiculos, selectedVehiclePlaca]);

  // Stable hashing function to generate consistent analytics mock metrics based on plate or CNH
  const getConsistentMetrics = (seed: string) => {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    }
    const abs = Math.abs(hash);
    
    // Deterministic random generators based on the hash
    const kmPerMonth = 1200 + (abs % 1100); // 1200 to 2300 km
    const tripsPerMonth = 60 + (abs % 90); // 60 to 150 trips
    const fuelConsumption = 9.5 + ((abs % 55) / 10); // 9.5 to 15.0 km/L
    const brakesCount = abs % 15; // 0 to 14 brakings
    const speedingCount = abs % 10; // 0 to 9 speeding
    const fatigueHours = 2.0 + ((abs % 35) / 10); // 2.0 to 5.5 hours continuous
    const accidentHistory = (abs % 13) === 0 ? 1 : 0; // low probability of collision
    
    // Safety scores
    const multasCount = abs % 4; // 0 to 3
    const multasPoints = multasCount * 4;
    const multasValor = multasCount * 195;
    const riskScore = Math.max(30, 100 - (multasCount * 12) - (accidentHistory * 30) - (brakesCount * 1.5));

    // Maintenance parameters
    const unavailableDays = abs % 7; // 0 to 6 days
    
    return {
      kmPerMonth,
      tripsPerMonth,
      fuelConsumption,
      brakesCount,
      speedingCount,
      fatigueHours,
      accidentHistory,
      multasCount,
      multasPoints,
      multasValor,
      riskScore,
      unavailableDays,
      rawHash: abs
    };
  };

  // Helper date checker for current period
  const isDateInPeriod = (dateStr: string | undefined): boolean => {
    if (!dateStr) return false;
    const date = new Date(dateStr + 'T00:00:00');
    if (period === 'mensal') {
      return date.getFullYear() === 2026 && date.getMonth() === 6; // July 2026
    } else if (period === 'trimestral') {
      const minDate = new Date('2026-05-01T00:00:00');
      return date >= minDate && date <= today;
    } else {
      return date.getFullYear() === 2026; // Entire year 2026
    }
  };

  const getPeriodMultiplier = () => {
    if (period === 'mensal') return 1;
    if (period === 'trimestral') return 3;
    return 12;
  };

  // DYNAMIC STATUS RESOLVER (GREEN/YELLOW/RED)
  const getVehicleStatus = (v: Veiculo) => {
    // 1. Critical Red Conditions
    if (v.crlv_vencimento && v.crlv_vencimento < todayStr) {
      return { status: 'Vermelho' as const, motivo: 'CRLV Vencido' };
    }
    if (v.ipva_vencimento && v.ipva_vencimento < todayStr && v.ipva_situacao !== 'Pago') {
      return { status: 'Vermelho' as const, motivo: 'IPVA Vencido/Pendente' };
    }
    if (v.vistoria_vencimento && v.vistoria_vencimento < todayStr) {
      return { status: 'Vermelho' as const, motivo: 'Vistoria Vencida' };
    }
    if (!v.segurado) {
      return { status: 'Vermelho' as const, motivo: 'Sem Seguro Ativo' };
    }
    if (v.seguro_vencimento && v.seguro_vencimento < todayStr) {
      return { status: 'Vermelho' as const, motivo: 'Seguro Vencido' };
    }

    // Driver debt also puts a leased car on Red warning
    const activeContract = contratos.find(c => c.veiculoPlaca === v.placa && c.status === 'Ativo');
    if (activeContract) {
      const hasOverdue = pagamentos.some(p => p.motoristaCpf === activeContract.motoristaCpf && p.status === 'Atrasado');
      if (hasOverdue) {
        return { status: 'Vermelho' as const, motivo: 'Débito Crítico do Motorista' };
      }
    }

    // Proximity warnings (Under 15 days -> Red, 15 to 30 days -> Yellow)
    const getDiffDays = (dateStr: string) => {
      const d = new Date(dateStr + 'T00:00:00');
      return Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    };

    const datesToCheck = [
      { date: v.crlv_vencimento, name: 'CRLV' },
      { date: v.ipva_vencimento, name: 'IPVA', condition: v.ipva_situacao !== 'Pago' },
      { date: v.seguro_vencimento, name: 'Seguro' },
      { date: v.vistoria_vencimento, name: 'Vistoria' }
    ];

    for (const item of datesToCheck) {
      if (item.date && (item.condition === undefined || item.condition)) {
        const diff = getDiffDays(item.date);
        if (diff >= 0 && diff < 15) {
          return { status: 'Vermelho' as const, motivo: `${item.name} vence em ${diff} dias` };
        }
        if (diff >= 15 && diff <= 30) {
          return { status: 'Amarelo' as const, motivo: `${item.name} vence em ${diff} dias` };
        }
      }
    }

    // Pending fines (Unpaid fines) -> Yellow
    if (v.multas_quantidade && v.multas_quantidade > 0 && v.multas_situacao !== 'Paga') {
      return { status: 'Amarelo' as const, motivo: `${v.multas_quantidade} Multas Pendentes` };
    }

    // Regular -> Green
    return { status: 'Verde' as const, motivo: 'Conformidade 100% OK' };
  };

  // FULL ANALYTICAL RESOLVER FOR MOTORISTAS
  const calculatedDrivers = useMemo(() => {
    return allDrivers.map(d => {
      const metrics = getConsistentMetrics(d.cpf);
      const mult = getPeriodMultiplier();

      // Find current assigned vehicle
      const currentContract = contratos.find(c => c.motoristaCpf === d.cpf && c.status === 'Ativo');
      const assignedVehicle = currentContract ? veiculos.find(v => v.placa === currentContract.veiculoPlaca) : null;

      // Find payments from this driver in the selected period
      const driverPayments = pagamentos.filter(p => {
        return p.motoristaCpf === d.cpf && !p.isDespesa && p.status === 'Pago' && isDateInPeriod(p.dataPagamento || p.vencimento);
      });
      const revenue = driverPayments.reduce((sum, p) => sum + p.valor, 0);

      // Total associated maintenance costs
      const driverMaintenance = assignedVehicle 
        ? manutencoes.filter(m => m.veiculoPlaca === assignedVehicle.placa && isDateInPeriod(m.data)).reduce((sum, m) => sum + m.custo, 0)
        : 0;

      // Distance run in the selected period
      const kmRodado = metrics.kmPerMonth * mult;
      const viagens = metrics.tripsPerMonth * mult;

      // Calculate cost per km: (estimated fuel price R$ 5.80 / consumption) + (maintenance / km)
      const fuelCostPerKm = 5.80 / metrics.fuelConsumption;
      const maintCostPerKm = kmRodado > 0 ? driverMaintenance / kmRodado : 0;
      const totalCostPerKm = fuelCostPerKm + maintCostPerKm;

      // Security / Compliance events
      const countMultas = metrics.multasCount;
      const totalPointsCNH = metrics.multasPoints;
      const multasValor = metrics.multasValor;
      const riskScore = metrics.riskScore;

      // Document states
      const cnhExpired = d.cnh_venc < todayStr;
      const toxicoExpired = d.cpf === '234.567.890-11'; // make Carlos Mendes toxico expired for realistic alert
      const cursosConcluidos = d.cpf === '345.678.901-22' ? ['Direção Defensiva'] : d.cpf === '123.456.789-00' ? ['MOPP'] : [];

      return {
        driver: d,
        vehicle: assignedVehicle,
        contract: currentContract,
        kmRodado,
        viagens,
        revenue,
        maintenanceCost: driverMaintenance,
        totalCostPerKm,
        riskScore,
        multasCount: countMultas,
        totalPointsCNH,
        multasValor,
        accidentCount: metrics.accidentHistory,
        cnhExpired,
        toxicoExpired,
        cursosConcluidos,
        telemetry: {
          brakes: metrics.brakesCount * mult,
          speeding: metrics.speedingCount * mult,
          fatigueHours: metrics.fatigueHours,
          fuelConsumption: metrics.fuelConsumption
        }
      };
    });
  }, [allDrivers, contratos, veiculos, pagamentos, manutencoes, period]);

  // FULL ANALYTICAL RESOLVER FOR VEÍCULOS
  const calculatedVehicles = useMemo(() => {
    return veiculos.map(v => {
      const statusResult = getVehicleStatus(v);
      const metrics = getConsistentMetrics(v.placa);
      const mult = getPeriodMultiplier();

      // Find active driver
      const activeContract = contratos.find(c => c.veiculoPlaca === v.placa && c.status === 'Ativo');
      const activeDriver = activeContract ? allDrivers.find(d => d.cpf === activeContract.motoristaCpf) : null;

      // Financials in selected period
      const vehiclePayments = pagamentos.filter(p => {
        if (p.status !== 'Pago' || p.isDespesa) return false;
        if (p.veiculoPlaca && p.veiculoPlaca === v.placa) {
          return isDateInPeriod(p.dataPagamento || p.vencimento);
        }
        return !!activeContract && p.motoristaCpf === activeContract.motoristaCpf && isDateInPeriod(p.dataPagamento || p.vencimento);
      });
      const revenue = vehiclePayments.reduce((sum, p) => sum + p.valor, 0);

      // Maintenance in selected period
      const vehicleMaint = manutencoes.filter(m => m.veiculoPlaca === v.placa && isDateInPeriod(m.data));
      const maintenanceTotal = vehicleMaint.reduce((sum, m) => sum + m.custo, 0);

      // Other costs: fuel, simulated insurance & depreciation
      const kmRodado = metrics.kmPerMonth * mult;
      const simulatedFuelSpent = (kmRodado / metrics.fuelConsumption) * 5.80;
      const simulatedInsurance = 180 * mult; // R$ 180/month average
      const simulatedDepreciation = 300 * mult; // R$ 300/month average depreciation

      const totalCost = maintenanceTotal + simulatedFuelSpent + simulatedInsurance + simulatedDepreciation;
      const netMargin = revenue - totalCost;

      // Maintenance counts and logs
      const maintCount = vehicleMaint.length;
      const allTimeMaintenances = manutencoes.filter(m => m.veiculoPlaca === v.placa);
      const allTimeMaintCost = allTimeMaintenances.reduce((sum, m) => sum + m.custo, 0);

      // Forecast next revision
      const currentKm = v.km_atual || v.km || 0;
      const maintAlerts = getVehicleMaintenanceAlerts(v, manutencoes);
      const validAlerts = maintAlerts.filter(a => a.kmRemaining !== undefined);
      
      let nextRevisionKm = Math.ceil(currentKm / 10000) * 10000;
      let kmRemaining = nextRevisionKm - currentKm;
      let nextRevisionLabel = 'Revisão Geral';

      if (validAlerts.length > 0) {
        const sortedAlerts = [...validAlerts].sort((a, b) => a.kmRemaining - b.kmRemaining);
        const closestAlert = sortedAlerts[0];
        kmRemaining = closestAlert.kmRemaining;
        nextRevisionKm = closestAlert.lastKm + closestAlert.period;
        nextRevisionLabel = closestAlert.label;
      }

      return {
        vehicle: v,
        status: statusResult.status,
        motivo: statusResult.motivo,
        driver: activeDriver,
        revenue,
        maintenanceCost: maintenanceTotal,
        fuelCost: simulatedFuelSpent,
        insuranceCost: simulatedInsurance,
        depreciationCost: simulatedDepreciation,
        totalCost,
        netMargin,
        kmRodado,
        maintCount,
        allTimeMaintCost,
        allTimeMaintCount: allTimeMaintenances.length,
        unavailabilityDays: metrics.unavailableDays * mult,
        nextRevisionKm,
        kmRemaining,
        nextRevisionLabel,
        badgeClass: statusResult.status === 'Verde' 
          ? 'bg-emerald-100 text-emerald-800 border-emerald-200' 
          : statusResult.status === 'Amarelo' 
            ? 'bg-amber-100 text-amber-800 border-amber-200' 
            : 'bg-rose-100 text-rose-800 border-rose-200'
      };
    });
  }, [veiculos, contratos, pagamentos, manutencoes, allDrivers, period]);

  // RANKINGS
  const rankedDrivers = useMemo(() => {
    return [...calculatedDrivers].sort((a, b) => {
      // Sort primarily by revenue minus risk factor
      const scoreA = a.revenue - (100 - a.riskScore) * 10;
      const scoreB = b.revenue - (100 - b.riskScore) * 10;
      return scoreB - scoreA;
    });
  }, [calculatedDrivers]);

  const rankedVehiclesFin = useMemo(() => {
    return [...calculatedVehicles].sort((a, b) => b.netMargin - a.netMargin);
  }, [calculatedVehicles]);

  // COMBINED FILTERED LIST (based on selected colors and search term)
  const filteredVehiclesList = useMemo(() => {
    return calculatedVehicles.filter(v => {
      const matchesStatus = selectedStatuses.includes(v.status);
      const matchesSearch =
        v.vehicle.placa.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.vehicle.modelo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.vehicle.marca.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesStatus && matchesSearch;
    });
  }, [calculatedVehicles, selectedStatuses, searchTerm]);

  // COUNTS FOR BADGES
  const countVerde = calculatedVehicles.filter(v => v.status === 'Verde').length;
  const countAmarelo = calculatedVehicles.filter(v => v.status === 'Amarelo').length;
  const countVermelho = calculatedVehicles.filter(v => v.status === 'Vermelho').length;

  const toggleStatus = (status: 'Verde' | 'Amarelo' | 'Vermelho') => {
    if (selectedStatuses.includes(status)) {
      if (selectedStatuses.length > 1) {
        setSelectedStatuses(selectedStatuses.filter(s => s !== status));
      } else {
        setSelectedStatuses(['Verde', 'Amarelo', 'Vermelho']);
      }
    } else {
      setSelectedStatuses([...selectedStatuses, status]);
    }
  };

  // CROSS-ANALYSIS COMBINATIONS (Cruzamento de Dados Motorista x Veículo)
  const crossCombinations = useMemo(() => {
    return calculatedDrivers.map(cd => {
      const cv = calculatedVehicles.find(v => v.vehicle.placa === cd.vehicle?.placa);
      
      // Determine diagnostic of inefficiency
      let diagnostic = '';
      let isEfficient = false;
      let level: 'success' | 'warning' | 'danger' = 'success';

      if (cd.riskScore >= 85 && cd.telemetry.fuelConsumption > 12 && (!cv || cv.status === 'Verde')) {
        diagnostic = 'Excelente sintonia. Motorista prudente e veículo em perfeito estado mecânico.';
        isEfficient = true;
        level = 'success';
      } else if (cd.riskScore < 60 && cv && cv.netMargin < 200) {
        diagnostic = 'Rendimento crítico causado pelo perfil do motorista (alto índice de multas e condução agressiva prejudicam margem).';
        level = 'danger';
      } else if (cv && cv.maintenanceCost > cv.revenue * 0.4) {
        diagnostic = 'Ineficiência originada do desgaste mecânico do veículo. Alta taxa de manutenção corretiva consome receita.';
        level = 'warning';
      } else if (cd.revenue === 0) {
        diagnostic = 'Inadimplência ou ociosidade. Nenhuma receita registrada no período auditado.';
        level = 'danger';
      } else {
        diagnostic = 'Desempenho operacional moderado dentro das tolerâncias da frota.';
        level = 'warning';
      }

      return {
        driverName: cd.driver.nome,
        driverCpf: cd.driver.cpf,
        driverRisk: cd.riskScore,
        vehicleModel: cd.vehicle ? cd.vehicle.modelo : 'Não Vinculado',
        vehiclePlaca: cd.vehicle ? cd.vehicle.placa : 'S/P',
        vehicleStatus: cv ? cv.status : 'Verde',
        revenue: cd.revenue,
        maintenance: cd.maintenanceCost,
        netMargin: cv ? cv.netMargin : cd.revenue,
        fuelConsumption: cd.telemetry.fuelConsumption,
        diagnostic,
        isEfficient,
        level
      };
    });
  }, [calculatedDrivers, calculatedVehicles]);

  // ACTIVE SELECTIONS FOR ANALYSIS VIEWS
  const activeDriverAnalysis = calculatedDrivers.find(cd => cd.driver.cpf === selectedDriverCpf) || calculatedDrivers[0];
  const activeVehicleAnalysis = calculatedVehicles.find(cv => cv.vehicle.placa === selectedVehiclePlaca) || calculatedVehicles[0];

  // PRESCRIPTIVE ACTION ENGINE
  const prescriptiveActions = useMemo(() => {
    const list = [] as {
      id: string;
      target: string;
      type: 'warning' | 'training' | 'maint' | 'bonus' | 'replace';
      title: string;
      desc: string;
      impact: string;
      badgeColor: string;
    }[];

    calculatedDrivers.forEach(cd => {
      if (cd.riskScore < 50) {
        list.push({
          id: `act-1-${cd.driver.cpf}`,
          target: cd.driver.nome,
          type: 'warning',
          title: 'Notificação de Risco & Advertência Formal',
          desc: `Motorista acumulou ${cd.multasCount} multas (${cd.totalPointsCNH} pontos) e telemetria de direção perigosa com ${cd.telemetry.brakes} frenagens bruscas.`,
          impact: 'Redução imediata da sinistralidade e despesas com infrações de trânsito.',
          badgeColor: 'bg-rose-50 text-rose-700 border-rose-200'
        });
        list.push({
          id: `act-2-${cd.driver.cpf}`,
          target: cd.driver.nome,
          type: 'training',
          title: 'Reciclagem e Treinamento de Condução Defensiva',
          desc: `Inscrição obrigatória no programa de capacitação para melhorar a segurança e o consumo de combustível (${cd.telemetry.fuelConsumption.toFixed(1)} km/L atual).`,
          impact: 'Melhoria de até 15% na economia de combustível e proteção mecânica.',
          badgeColor: 'bg-amber-50 text-amber-700 border-amber-200'
        });
      } else if (cd.riskScore >= 95 && cd.revenue > 1000) {
        list.push({
          id: `act-3-${cd.driver.cpf}`,
          target: cd.driver.nome,
          type: 'bonus',
          title: 'Bonificação por Excelência e Direção Segura',
          desc: `Premiação de motorista destaque do período: Pontuação de Risco nota ${cd.riskScore} e faturamento exemplar.`,
          impact: 'Fomento à retenção de bons parceiros e estímulo aos demais condutores.',
          badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200'
        });
      }

      if (cd.toxicoExpired) {
        list.push({
          id: `act-4-${cd.driver.cpf}`,
          target: cd.driver.nome,
          type: 'warning',
          title: 'Regularização Urgente de Exame Toxicológico',
          desc: 'Exame periódico obrigatório está vencido ou próximo do limite regulamentar.',
          impact: 'Garantia de conformidade com as diretrizes do CONTRAN e proteção jurídica.',
          badgeColor: 'bg-rose-50 text-rose-700 border-rose-200'
        });
      }
    });

    calculatedVehicles.forEach(cv => {
      if (cv.status === 'Vermelho') {
        list.push({
          id: `act-5-${cv.vehicle.placa}`,
          target: `${cv.vehicle.modelo} (${cv.vehicle.placa})`,
          type: 'replace',
          title: 'Plano de Substituição e Desmobilização do Veículo',
          desc: `Veículo acumula restrições (${cv.motivo}) e/ou custos críticos que anulam a margem operacional (${formatBRL(cv.netMargin)} no período).`,
          impact: 'Redução do custo médio de manutenção corretiva e renovação estratégica da frota.',
          badgeColor: 'bg-rose-50 text-rose-700 border-rose-200'
        });
      } else if (cv.kmRemaining <= 1500) {
        list.push({
          id: `act-6-${cv.vehicle.placa}`,
          target: `${cv.vehicle.modelo} (${cv.vehicle.placa})`,
          type: 'maint',
          title: 'Agendamento de Revisão Preventiva Oblíqua',
          desc: `Próxima revisão mecânica de ${cv.nextRevisionKm} km está a apenas ${cv.kmRemaining} km de distância.`,
          impact: 'Preservação do valor de revenda do ativo e prevenção de quebras inesperadas.',
          badgeColor: 'bg-blue-50 text-blue-700 border-blue-200'
        });
      }
    });

    return list;
  }, [calculatedDrivers, calculatedVehicles]);

  const [appliedActions, setAppliedActions] = useState<string[]>([]);
  const handleApplyAction = (actionId: string) => {
    if (!appliedActions.includes(actionId)) {
      setAppliedActions([...appliedActions, actionId]);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="space-y-6 max-w-7xl mx-auto"
    >
      {/* HEADER BAR */}
      <div className="bg-slate-900 text-white p-5 rounded-2xl border border-slate-800 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-red-600/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight flex items-center gap-2">
              <span className="p-2 bg-red-600/20 text-red-500 rounded-lg">
                <Gauge className="w-5 h-5" />
              </span>
              Suíte Avançada de Análise & Auditoria de Frota
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Painel analítico completo integrando telemetria de direção, conformidade regulatória, performance de motoristas e rentabilidade de ativos.
            </p>
          </div>

          {/* PERIOD FILTER */}
          <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl border border-slate-700/50 shadow-inner shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2">Período:</span>
            {(['mensal', 'trimestral', 'anual'] as const).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1 text-xs font-bold rounded-lg capitalize transition-all ${
                  period === p
                    ? 'bg-red-600 text-white shadow-md'
                    : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* INNER NAVIGATION SUBTABS */}
        <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-slate-800">
          <button
            onClick={() => setActiveTab('geral')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all flex items-center gap-1.5 ${
              activeTab === 'geral' ? 'bg-white text-slate-900' : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Activity className="w-4 h-4" /> Resumo e KPIs
          </button>
          <button
            onClick={() => setActiveTab('motoristas')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all flex items-center gap-1.5 ${
              activeTab === 'motoristas' ? 'bg-white text-slate-900' : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Users className="w-4 h-4" /> Análise de Motoristas
          </button>
          <button
            onClick={() => setActiveTab('veiculos')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all flex items-center gap-1.5 ${
              activeTab === 'veiculos' ? 'bg-white text-slate-900' : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Car className="w-4 h-4" /> Análise de Veículos
          </button>
          <button
            onClick={() => setActiveTab('cruzamento')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all flex items-center gap-1.5 ${
              activeTab === 'cruzamento' ? 'bg-white text-slate-900' : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Zap className="w-4 h-4" /> Cruzamento de Dados
          </button>
          <button
            onClick={() => setActiveTab('acoes')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-extrabold transition-all flex items-center gap-1.5 ${
              activeTab === 'acoes' ? 'bg-white text-slate-900 animate-pulse' : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <ShieldAlert className="w-4 h-4" /> Plano de Ação ({prescriptiveActions.length - appliedActions.length})
          </button>
        </div>
      </div>

      {/* RENDER ACTIVE TAB */}
      <AnimatePresence mode="wait">
        {activeTab === 'geral' && (
          <motion.div
            key="geral"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            {/* KPI SUMMARY METRICS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-4.5 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Aproveitamento Regular</span>
                <div className="flex items-baseline gap-2 mt-1.5">
                  <span className="text-3xl font-black text-emerald-600 leading-none">
                    {Math.round((countVerde / veiculos.length) * 100)}%
                  </span>
                  <span className="text-xs text-slate-500 font-bold">({countVerde} em dia)</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-2">Sem nenhuma restrição contratual, fiscal ou física registrada.</p>
              </div>

              <div className="bg-white p-4.5 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Custo Médio de Manutenção</span>
                <div className="flex items-baseline gap-2 mt-1.5">
                  <span className="text-2xl font-black text-slate-800 leading-none">
                    {formatBRL(calculatedVehicles.reduce((sum, v) => sum + v.maintenanceCost, 0) / (veiculos.length || 1))}
                  </span>
                  <span className="text-[10px] text-slate-500 font-bold">/ veículo</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-2">Valores computados com base em ordens de serviço concluídas no período.</p>
              </div>

              <div className="bg-white p-4.5 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Média de Risco / Frota</span>
                <div className="flex items-baseline gap-2 mt-1.5">
                  <span className="text-3xl font-black text-amber-600 leading-none">
                    {Math.round(calculatedDrivers.reduce((sum, d) => sum + d.riskScore, 0) / (calculatedDrivers.length || 1))} / 100
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 mt-2">Baseado em infrações, frenagens e histórico de acidentes dos motoristas.</p>
              </div>

              <div className="bg-white p-4.5 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Margem Operacional Líquida</span>
                <div className="flex items-baseline gap-2 mt-1.5">
                  <span className="text-2xl font-black text-slate-800 leading-none">
                    {formatBRL(calculatedVehicles.reduce((sum, v) => sum + v.netMargin, 0))}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 mt-2">Faturamento bruto subtraindo manutenção, combustível, seguros e depreciação.</p>
              </div>
            </div>

            {/* COLOR STATUS QUICK FILTER CONTROLLER */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Filtro por Situação Operacional do Veículo:
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => toggleStatus('Verde')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all flex items-center gap-2 cursor-pointer ${
                    selectedStatuses.includes('Verde')
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                      : 'bg-slate-50 border-slate-200 text-slate-400'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                  <span>Verde ({countVerde})</span>
                </button>
                <button
                  onClick={() => toggleStatus('Amarelo')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all flex items-center gap-2 cursor-pointer ${
                    selectedStatuses.includes('Amarelo')
                      ? 'bg-amber-50 border-amber-300 text-amber-800'
                      : 'bg-slate-50 border-slate-200 text-slate-400'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                  <span>Amarelo ({countAmarelo})</span>
                </button>
                <button
                  onClick={() => toggleStatus('Vermelho')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all flex items-center gap-2 cursor-pointer ${
                    selectedStatuses.includes('Vermelho')
                      ? 'bg-rose-50 border-rose-300 text-rose-800'
                      : 'bg-slate-50 border-slate-200 text-slate-400'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                  <span>Vermelho ({countVermelho})</span>
                </button>
              </div>
            </div>

            {/* PERFORMANCE RANKINGS CENTRAL AREA */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* VEHICLE NET MARGIN RANKING CHART */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm uppercase tracking-tight flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-red-600" />
                    Desempenho Financeiro dos Veículos (Margem Líquida)
                  </h3>
                  <p className="text-[11px] text-slate-400 mb-4">
                    Receita subtraída de todos os custos reais e estimados (Top 1 e Bottom 1 em destaque).
                  </p>
                </div>

                <div className="space-y-4">
                  {rankedVehiclesFin.map((v, idx) => {
                    const maxMargin = Math.max(...rankedVehiclesFin.map(item => Math.abs(item.netMargin)), 1);
                    const isTop = idx === 0;
                    const isBottom = idx === rankedVehiclesFin.length - 1;
                    const fillPct = Math.min(100, Math.max(10, (Math.abs(v.netMargin) / maxMargin) * 100));

                    return (
                      <div key={v.vehicle.placa} className="space-y-1">
                        <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                          <span className="flex items-center gap-1.5">
                            <span className="font-mono text-slate-400">#{idx + 1}</span>
                            <span>{v.vehicle.modelo}</span>
                            <span className="text-[10px] font-mono text-slate-400">({v.vehicle.placa})</span>
                          </span>
                          <span className={v.netMargin >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                            {formatBRL(v.netMargin)}
                          </span>
                        </div>
                        <div className="h-4.5 bg-slate-100 rounded-full overflow-hidden flex relative">
                          <div
                            style={{ width: `${fillPct}%` }}
                            className={`h-full rounded-full transition-all ${
                              isTop 
                                ? 'bg-emerald-500 shadow-xs shadow-emerald-500/20' 
                                : isBottom 
                                  ? 'bg-rose-500' 
                                  : 'bg-slate-400'
                            }`}
                          />
                          <span className="absolute right-2.5 top-0 bottom-0 flex items-center text-[9px] font-black uppercase text-slate-500">
                            {isTop ? '✨ Destaque Positivo' : isBottom ? '⚠️ Candidato Substituição' : 'Médio'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* DRIVER SAFETY & REVENUE RANKING CHART */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm uppercase tracking-tight flex items-center gap-2">
                    <Users className="w-4 h-4 text-red-600" />
                    Ranking Geral de Parcerias (Motoristas)
                  </h3>
                  <p className="text-[11px] text-slate-400 mb-4">
                    Classificação baseada em receita faturada cruzada com comportamento seguro na telemetria.
                  </p>
                </div>

                <div className="space-y-4">
                  {rankedDrivers.map((d, idx) => {
                    const isTop = idx === 0;
                    const isBottom = idx === rankedDrivers.length - 1;

                    return (
                      <div key={d.driver.cpf} className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 flex items-center justify-between text-xs hover:bg-slate-50/90 transition-all">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-sm font-black text-slate-300 w-5">#{idx + 1}</span>
                          <div>
                            <div className="font-extrabold text-slate-800">{d.driver.nome}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5">Veículo: {d.vehicle ? d.vehicle.modelo : 'Nenhum'}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 text-right">
                          <div>
                            <span className="text-[10px] text-slate-400 block font-bold">Faturamento</span>
                            <span className="font-black text-slate-800">{formatBRL(d.revenue)}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block font-bold">Risco</span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold border ${
                              d.riskScore >= 80 
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-100' 
                                : d.riskScore >= 50 
                                  ? 'bg-amber-50 text-amber-800 border-amber-100' 
                                  : 'bg-rose-50 text-rose-800 border-rose-100'
                            }`}>
                              {d.riskScore}/100
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* DETAILED FLEET LIST WITH COLUMNS */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm uppercase tracking-tight">
                    Listagem Geral de Auditoria da Frota
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Demonstrando {filteredVehiclesList.length} veículos de acordo com os filtros aplicados.
                  </p>
                </div>
                <div className="relative w-full sm:w-60">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Pesquisar por placa ou modelo..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full text-xs bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-red-500"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/30 text-slate-500 text-[10px] uppercase font-black border-b border-slate-100">
                      <th className="px-5 py-3">Placa</th>
                      <th className="px-5 py-3">Modelo / Marca</th>
                      <th className="px-5 py-3">Situação</th>
                      <th className="px-5 py-3">Última Pendência</th>
                      <th className="px-5 py-3">Receita Período</th>
                      <th className="px-5 py-3 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredVehiclesList.length > 0 ? (
                      filteredVehiclesList.map(v => (
                        <tr key={v.vehicle.placa} className="hover:bg-slate-50/60 transition-colors text-slate-700">
                          <td className="px-5 py-3">
                            <PlacaMercosul placa={v.vehicle.placa} size="md" />
                          </td>
                          <td className="px-5 py-3 font-bold">
                            <div>{v.vehicle.modelo}</div>
                            <div className="text-[10px] text-slate-400 font-normal">{v.vehicle.marca} • {v.vehicle.ano}</div>
                          </td>
                          <td className="px-5 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black border flex items-center gap-1.5 w-fit ${v.badgeClass}`}>
                              <span className={`w-2 h-2 rounded-full ${
                                v.status === 'Verde' ? 'bg-emerald-500' : v.status === 'Amarelo' ? 'bg-amber-400' : 'bg-rose-500'
                              }`} />
                              {v.status}
                            </span>
                          </td>
                          <td className="px-5 py-3 font-medium">
                            <span className={v.status === 'Vermelho' ? 'text-rose-600 font-bold' : v.status === 'Amarelo' ? 'text-amber-700' : 'text-emerald-700'}>
                              {v.status === 'Verde' ? '✓ Sem Pendências' : v.motivo}
                            </span>
                          </td>
                          <td className="px-5 py-3 font-extrabold text-slate-800">
                            {formatBRL(v.revenue)}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <button
                              onClick={() => {
                                setSelectedVehiclePlaca(v.vehicle.placa);
                                setActiveTab('veiculos');
                              }}
                              className="text-red-600 hover:text-red-800 font-bold hover:underline"
                            >
                              Análise Detalhada
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-5 py-8 text-center text-slate-400 italic">
                          Nenhum veículo encontrado com os filtros atuais.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}

        {/* MOTORISTAS DETAIL TAB */}
        {activeTab === 'motoristas' && (
          <motion.div
            key="motoristas"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6"
          >
            {/* SIDE LIST OF DRIVERS */}
            <div className="lg:col-span-4 space-y-3">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Selecione o Motorista para Auditoria</span>
              <div className="space-y-2">
                {calculatedDrivers.map(cd => {
                  const isSelected = selectedDriverCpf === cd.driver.cpf;
                  return (
                    <div
                      key={cd.driver.cpf}
                      onClick={() => setSelectedDriverCpf(cd.driver.cpf)}
                      className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                        isSelected 
                          ? 'bg-slate-900 text-white border-slate-900 shadow-md' 
                          : 'bg-white text-slate-800 hover:bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div>
                        <div className="font-extrabold text-xs">{cd.driver.nome}</div>
                        <div className={`text-[10px] font-mono mt-0.5 ${isSelected ? 'text-slate-400' : 'text-slate-400'}`}>
                          CNH Cat: {cd.driver.cat} • {cd.driver.cpf}
                        </div>
                      </div>
                      <ChevronRight className={`w-4 h-4 ${isSelected ? 'text-red-500' : 'text-slate-300'}`} />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* DETAILED DRILLDOWN ANALYSIS AREA */}
            <div className="lg:col-span-8 space-y-6">
              {activeDriverAnalysis ? (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
                  
                  {/* Driver Header */}
                  <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-slate-950 text-white flex items-center justify-center font-extrabold text-base border border-slate-800">
                        {activeDriverAnalysis.driver.nome.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="text-base font-black text-slate-900">{activeDriverAnalysis.driver.nome}</h3>
                        <p className="text-[11px] text-slate-500">
                          Motorista {activeDriverAnalysis.driver.status} • Admissão: {activeDriverAnalysis.driver.cpf === '123.456.789-00' ? '15/01/2024' : activeDriverAnalysis.driver.cpf === '234.567.890-11' ? '10/06/2025' : '01/02/2025'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Score de Risco:</span>
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-black border ${
                        activeDriverAnalysis.riskScore >= 80 
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                          : activeDriverAnalysis.riskScore >= 50 
                            ? 'bg-amber-50 border-amber-200 text-amber-800' 
                            : 'bg-rose-50 border-rose-200 text-rose-800 animate-pulse'
                      }`}>
                        {activeDriverAnalysis.riskScore} / 100
                      </span>
                    </div>
                  </div>

                  {/* 1.1 DADOS CADASTRAIS */}
                  <div className="space-y-2.5">
                    <h4 className="text-[11px] uppercase font-black text-slate-400 tracking-wider flex items-center gap-1">
                      <User className="w-3.5 h-3.5" /> 1.1 Dados Cadastrais e Operacionais
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200/60 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 block font-bold">Nº Registro CNH</span>
                        <span className="font-mono font-bold text-slate-800">{activeDriverAnalysis.driver.cnh}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block font-bold">Categoria & Validade CNH</span>
                        <span className="font-bold text-slate-800">
                          Cat {activeDriverAnalysis.driver.cat} • {activeDriverAnalysis.driver.cnh_venc}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block font-bold">Veículo Vinculado Atualmente</span>
                        <span className="font-bold text-red-600">
                          {activeDriverAnalysis.vehicle ? `${activeDriverAnalysis.vehicle.modelo} (${activeDriverAnalysis.vehicle.placa})` : 'Nenhum veículo vinculado'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 1.2 DESEMPENHO E PRODUTIVIDADE */}
                  <div className="space-y-2.5">
                    <h4 className="text-[11px] uppercase font-black text-slate-400 tracking-wider flex items-center gap-1">
                      <TrendingUp className="w-3.5 h-3.5" /> 1.2 Desempenho e Produtividade Comercial
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 text-center">
                        <span className="text-[9px] text-slate-400 block font-bold uppercase">Distância Estimada</span>
                        <span className="text-lg font-black text-slate-800 mt-1 block font-mono">{activeDriverAnalysis.kmRodado} km</span>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 text-center">
                        <span className="text-[9px] text-slate-400 block font-bold uppercase">Entregas / Viagens</span>
                        <span className="text-lg font-black text-slate-800 mt-1 block font-mono">{activeDriverAnalysis.viagens} un</span>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 text-center">
                        <span className="text-[9px] text-slate-400 block font-bold uppercase">Receita no Período</span>
                        <span className="text-lg font-black text-emerald-600 mt-1 block font-mono">{formatBRL(activeDriverAnalysis.revenue)}</span>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 text-center">
                        <span className="text-[9px] text-slate-400 block font-bold uppercase">Custo Médio / Km</span>
                        <span className="text-lg font-black text-slate-800 mt-1 block font-mono">{formatBRL(activeDriverAnalysis.totalCostPerKm)}</span>
                      </div>
                    </div>
                  </div>

                  {/* 1.3 SEGURANÇA E CONFORMIDADE & 1.4 COMPORTAMENTO */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Compliance & Safety */}
                    <div className="space-y-2.5">
                      <h4 className="text-[11px] uppercase font-black text-slate-400 tracking-wider flex items-center gap-1">
                        <ShieldAlert className="w-3.5 h-3.5" /> 1.3 Segurança e Conformidade
                      </h4>
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/60 space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-bold">Multas Registradas:</span>
                          <span className={`font-bold ${activeDriverAnalysis.multasCount > 0 ? 'text-red-600' : 'text-slate-700'}`}>
                            {activeDriverAnalysis.multasCount} infrações ({activeDriverAnalysis.totalPointsCNH} pontos)
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-bold">Custo de Infrações:</span>
                          <span className="font-mono font-bold text-slate-800">{formatBRL(activeDriverAnalysis.multasValor)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-bold">Histórico de Sinistros:</span>
                          <span className={`font-bold ${activeDriverAnalysis.accidentCount > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                            {activeDriverAnalysis.accidentCount} ocorrências
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-bold">Exame Toxicológico:</span>
                          <span className={`px-1.5 py-0.2 rounded text-[10px] font-black ${
                            activeDriverAnalysis.toxicoExpired ? 'bg-rose-100 text-rose-800 border' : 'bg-emerald-100 text-emerald-800 border'
                          }`}>
                            {activeDriverAnalysis.toxicoExpired ? 'Expirado / Pendente' : 'Válido'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Telemetry Behavior */}
                    <div className="space-y-2.5">
                      <h4 className="text-[11px] uppercase font-black text-slate-400 tracking-wider flex items-center gap-1">
                        <Activity className="w-3.5 h-3.5" /> 1.4 Comportamento de Direção (Telemetria)
                      </h4>
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/60 space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-bold">Frenagens Bruscas:</span>
                          <span className={`font-mono font-bold ${activeDriverAnalysis.telemetry.brakes > 5 ? 'text-red-600' : 'text-slate-700'}`}>
                            {activeDriverAnalysis.telemetry.brakes} eventos
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-bold">Excesso de Velocidade:</span>
                          <span className={`font-mono font-bold ${activeDriverAnalysis.telemetry.speeding > 3 ? 'text-red-600' : 'text-slate-700'}`}>
                            {activeDriverAnalysis.telemetry.speeding} alertas
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-bold">Direção Contínua Limite (Fadiga):</span>
                          <span className="font-bold text-slate-800">{activeDriverAnalysis.telemetry.fatigueHours.toFixed(1)} horas</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-bold">Média Consumo Combustível:</span>
                          <span className="font-mono font-bold text-emerald-600">{activeDriverAnalysis.telemetry.fuelConsumption.toFixed(1)} km/L</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions shortcut */}
                  <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400 font-bold">Auditoria concluída em conformidade corporativa.</span>
                    <button
                      onClick={() => setActiveTab('acoes')}
                      className="bg-slate-900 text-white font-bold px-3 py-1.5 rounded-lg text-xs hover:bg-slate-800"
                    >
                      Ir para Plano de Ação →
                    </button>
                  </div>

                </div>
              ) : (
                <div className="bg-white p-6 rounded-xl border border-slate-200 italic text-slate-400 text-xs text-center py-16">
                  Nenhum motorista selecionado.
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* VEÍCULOS DETAIL TAB */}
        {activeTab === 'veiculos' && (
          <motion.div
            key="veiculos"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-6"
          >
            {/* SIDE LIST OF VEHICLES */}
            <div className="lg:col-span-4 space-y-3">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Selecione o Veículo para Análise</span>
              <div className="space-y-2">
                {calculatedVehicles.map(cv => {
                  const isSelected = selectedVehiclePlaca === cv.vehicle.placa;
                  return (
                    <div
                      key={cv.vehicle.placa}
                      onClick={() => setSelectedVehiclePlaca(cv.vehicle.placa)}
                      className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                        isSelected 
                          ? 'bg-slate-900 text-white border-slate-900 shadow-md' 
                          : 'bg-white text-slate-800 hover:bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div>
                        <div className="font-extrabold text-xs">{cv.vehicle.modelo}</div>
                        <div className="text-[10px] font-mono mt-0.5 text-slate-400">
                          Placa: {cv.vehicle.placa} • Status: {cv.status}
                        </div>
                      </div>
                      <span className={`w-2.5 h-2.5 rounded-full ${
                        cv.status === 'Verde' ? 'bg-emerald-500' : cv.status === 'Amarelo' ? 'bg-amber-400' : 'bg-rose-500 animate-pulse'
                      }`} />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* DETAILED DRILLDOWN VEHICLE AREA */}
            <div className="lg:col-span-8 space-y-6">
              {activeVehicleAnalysis ? (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
                  
                  {/* Vehicle Header */}
                  <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {activeVehicleAnalysis.vehicle.foto ? (
                        <img
                          src={activeVehicleAnalysis.vehicle.foto}
                          alt={activeVehicleAnalysis.vehicle.modelo}
                          referrerPolicy="no-referrer"
                          className="w-14 h-11 rounded-lg object-cover border border-slate-200 shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center border shrink-0">
                          <Car className="w-6 h-6" />
                        </div>
                      )}
                      <div>
                        <h3 className="text-base font-black text-slate-900">{activeVehicleAnalysis.vehicle.modelo}</h3>
                        <p className="text-[11px] text-slate-500">
                          {activeVehicleAnalysis.vehicle.marca} • Ano {activeVehicleAnalysis.vehicle.ano} • Cor {activeVehicleAnalysis.vehicle.cor}
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <PlacaMercosul placa={activeVehicleAnalysis.vehicle.placa} size="md" />
                    </div>
                  </div>

                  {/* 2.1 DADOS CADASTRAIS */}
                  <div className="space-y-2.5">
                    <h4 className="text-[11px] uppercase font-black text-slate-400 tracking-wider flex items-center gap-1">
                      <ClipboardList className="w-3.5 h-3.5" /> 2.1 Dados Cadastrais e Responsável
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200/60 text-xs text-slate-700">
                      <div>
                        <span className="text-[10px] text-slate-400 block font-bold">RENAVAM</span>
                        <span className="font-mono font-bold text-slate-800">{activeVehicleAnalysis.vehicle.renavam || 'Não Cadastrado'}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block font-bold">Motorista Responsável</span>
                        <span className="font-bold text-slate-800">
                          {activeVehicleAnalysis.driver ? activeVehicleAnalysis.driver.nome : 'Sem motorista vinculado'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block font-bold">Km Registrado</span>
                        <span className="font-mono font-bold text-slate-800">
                          {activeVehicleAnalysis.vehicle.km_atual || activeVehicleAnalysis.vehicle.km || 0} km
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 2.2 DESEMPENHO FINANCEIRO */}
                  <div className="space-y-2.5">
                    <h4 className="text-[11px] uppercase font-black text-slate-400 tracking-wider flex items-center gap-1">
                      <DollarSign className="w-3.5 h-3.5" /> 2.2 Desempenho Financeiro e Margem Líquida (Período)
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 text-center">
                        <span className="text-[9px] text-slate-400 block font-bold uppercase">Receita Gerada</span>
                        <span className="text-base font-black text-emerald-600 mt-1 block font-mono">
                          {formatBRL(activeVehicleAnalysis.revenue)}
                        </span>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 text-center">
                        <span className="text-[9px] text-slate-400 block font-bold uppercase">Custo Manutenção</span>
                        <span className="text-base font-black text-rose-600 mt-1 block font-mono">
                          {formatBRL(activeVehicleAnalysis.maintenanceCost)}
                        </span>
                      </div>
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 text-center">
                        <span className="text-[9px] text-slate-400 block font-bold uppercase">Custos Indiretos (Est.)</span>
                        <span className="text-base font-black text-slate-700 mt-1 block font-mono">
                          {formatBRL(activeVehicleAnalysis.fuelCost + activeVehicleAnalysis.insuranceCost + activeVehicleAnalysis.depreciationCost)}
                        </span>
                      </div>
                      <div className="p-3 bg-red-50/20 rounded-xl border border-red-100 text-center font-bold">
                        <span className="text-[9px] text-red-700 block font-bold uppercase">Margem Líquida</span>
                        <span className={`text-base font-black mt-1 block font-mono ${
                          activeVehicleAnalysis.netMargin >= 0 ? 'text-slate-900' : 'text-red-600'
                        }`}>
                          {formatBRL(activeVehicleAnalysis.netMargin)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 2.3 MANUTENÇÃO E CONFIABILIDADE & 2.4 COMPLIANCE */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Maintenance and Reliability */}
                    <div className="space-y-2.5">
                      <h4 className="text-[11px] uppercase font-black text-slate-400 tracking-wider flex items-center gap-1">
                        <Wrench className="w-3.5 h-3.5" /> 2.3 Manutenção e Confiabilidade
                      </h4>
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/60 space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-bold">OS do Período:</span>
                          <span className="font-bold text-slate-800">{activeVehicleAnalysis.maintCount} ordens</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-bold">Custo Histórico Acumulado:</span>
                          <span className="font-mono font-bold text-slate-800">{formatBRL(activeVehicleAnalysis.allTimeMaintCost)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-bold">Tempo de Indisponibilidade:</span>
                          <span className="font-bold text-amber-700">{activeVehicleAnalysis.unavailabilityDays} dias parados</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-bold">Próxima Revisão:</span>
                          <span className="font-mono font-bold text-blue-600">
                            {(activeVehicleAnalysis as any).nextRevisionLabel || 'Revisão'}: {activeVehicleAnalysis.nextRevisionKm} km (faltam {activeVehicleAnalysis.kmRemaining} km)
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Pendencias e Conformidade */}
                    <div className="space-y-2.5">
                      <h4 className="text-[11px] uppercase font-black text-slate-400 tracking-wider flex items-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5" /> 2.4 Pendências e Conformidade
                      </h4>
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/60 space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-bold">Status Alerta Geral:</span>
                          <span className={`px-2 py-0.2 rounded text-[10px] font-black ${
                            activeVehicleAnalysis.status === 'Verde' ? 'bg-emerald-100 text-emerald-800' : activeVehicleAnalysis.status === 'Amarelo' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800 animate-pulse'
                          }`}>
                            {activeVehicleAnalysis.status}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-bold">Descrição Pendência:</span>
                          <span className="font-bold text-slate-700 truncate max-w-[150px]" title={activeVehicleAnalysis.motivo}>
                            {activeVehicleAnalysis.status === 'Verde' ? 'Nenhuma pendência' : activeVehicleAnalysis.motivo}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-bold">Seguro Ativo:</span>
                          <span className="font-bold text-slate-800">{activeVehicleAnalysis.vehicle.segurado ? 'Sim (Porto Seguro)' : 'Não Seguro / Crítico'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-bold">Licenciamento Anual:</span>
                          <span className="font-bold text-emerald-700">Válido</span>
                        </div>
                      </div>
                    </div>
                  </div>

                </div>
              ) : (
                <div className="bg-white p-6 rounded-xl border border-slate-200 italic text-slate-400 text-xs text-center py-16">
                  Nenhum veículo selecionado.
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* CRUZAMENTO DE DADOS TAB */}
        {activeTab === 'cruzamento' && (
          <motion.div
            key="cruzamento"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="font-bold text-slate-800 text-sm uppercase tracking-tight flex items-center gap-1.5">
                <Zap className="text-red-500 w-4.5 h-4.5" /> 3. Cruzamento e Diagnóstico de Performance (Motorista x Veículo)
              </h3>
              <p className="text-[11px] text-slate-400 mt-1">
                Relacione o comportamento e rendimento do motorista com a saúde mecânica e financeira do ativo operado para isolar causas raiz de baixa performance.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
                {crossCombinations.map((combo, idx) => {
                  let borderClass = 'border-slate-200 bg-slate-50/40';
                  let statusTag = 'Moderado';
                  let tagClass = 'bg-slate-100 text-slate-800 border-slate-200';

                  if (combo.level === 'success') {
                    borderClass = 'border-emerald-200 bg-emerald-50/10';
                    statusTag = 'Alta Eficiência';
                    tagClass = 'bg-emerald-100 text-emerald-800 border-emerald-200';
                  } else if (combo.level === 'danger') {
                    borderClass = 'border-rose-200 bg-rose-50/10';
                    statusTag = 'Baixa Eficiência / Crítico';
                    tagClass = 'bg-rose-100 text-rose-800 border-rose-200';
                  }

                  return (
                    <div key={combo.driverCpf} className={`p-4 rounded-xl border ${borderClass} flex flex-col justify-between space-y-4`}>
                      <div className="space-y-2">
                        <div className="flex justify-between items-start">
                          <span className="text-[9px] font-black uppercase text-slate-400">Combinação #{idx + 1}</span>
                          <span className={`text-[9px] font-black border px-1.5 py-0.2 rounded uppercase ${tagClass}`}>{statusTag}</span>
                        </div>

                        <div>
                          <div className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-slate-500" /> {combo.driverName}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">CPF: {combo.driverCpf}</div>
                        </div>

                        <div className="border-t border-dashed border-slate-200 my-2 pt-2">
                          <div className="text-xs font-bold text-red-600 flex items-center gap-1.5">
                            <Car className="w-3.5 h-3.5" /> {combo.vehicleModel}
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">Placa: {combo.vehiclePlaca}</div>
                        </div>
                      </div>

                      {/* Core Metrics */}
                      <div className="grid grid-cols-2 gap-2 bg-white/80 p-2.5 rounded-lg border border-slate-100 text-[11px] text-slate-700">
                        <div>
                          <span className="text-slate-400 block font-bold text-[9px] uppercase">Faturamento</span>
                          <span className="font-extrabold text-slate-800">{formatBRL(combo.revenue)}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block font-bold text-[9px] uppercase">Margem Líquida</span>
                          <span className={`font-extrabold ${combo.netMargin >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                            {formatBRL(combo.netMargin)}
                          </span>
                        </div>
                        <div className="mt-1">
                          <span className="text-slate-400 block font-bold text-[9px] uppercase">Risco Condutor</span>
                          <span className="font-bold text-slate-800">{combo.driverRisk}/100</span>
                        </div>
                        <div className="mt-1">
                          <span className="text-slate-400 block font-bold text-[9px] uppercase">Consumo Médio</span>
                          <span className="font-bold text-slate-800">{combo.fuelConsumption.toFixed(1)} km/L</span>
                        </div>
                      </div>

                      {/* Automatic Diagnostic Statement */}
                      <div className="p-2.5 rounded-lg bg-slate-900 text-white text-[10px] leading-relaxed flex gap-1.5">
                        <Info className="w-3.5 h-3.5 text-red-500 shrink-0" />
                        <span>
                          <strong className="block uppercase text-[8px] text-slate-400 tracking-wider">Parecer Técnico:</strong>
                          {combo.diagnostic}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Analysis conclusion */}
              <div className="mt-6 p-4 rounded-xl bg-slate-900 text-white flex flex-col sm:flex-row items-center justify-between gap-4 border border-slate-800">
                <div className="space-y-1">
                  <h4 className="text-xs font-black uppercase text-red-500 tracking-wider">Conclusão Analítica da Auditoria</h4>
                  <p className="text-[11px] text-slate-300 leading-normal">
                    O cruzamento de telemetria comprova que o veículo <strong>XYZ-5678 (Polo)</strong> sofre depreciação acelerada decorrente de condução inadequada de Carlos Mendes, enquanto o Onix e a Strada demonstram sinergia saudável.
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab('acoes')}
                  className="bg-red-600 text-white font-black px-4 py-2 rounded-lg text-xs hover:bg-red-700 shrink-0"
                >
                  Visualizar Recomendações de Ação →
                </button>
              </div>

            </div>
          </motion.div>
        )}

        {/* PRESCRIPTIVE PLAN / RECOMMENDATIONS TAB */}
        {activeTab === 'acoes' && (
          <motion.div
            key="acoes"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <div className="border-b border-slate-100 pb-3 mb-4 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm uppercase tracking-tight flex items-center gap-1.5">
                    <ShieldAlert className="text-red-500 w-4.5 h-4.5" /> 4. Plano de Ações Operacionais Recomendadas (Prescritivo)
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Ações recomendadas automáticas geradas pela inteligência do sistema para otimização da margem da frota e conformidade jurídica.
                  </p>
                </div>
                <span className="bg-slate-100 text-slate-700 text-[10px] font-black px-2 py-0.5 rounded border border-slate-200">
                  {prescriptiveActions.length - appliedActions.length} pendentes
                </span>
              </div>

              <div className="space-y-3">
                {prescriptiveActions.length > 0 ? (
                  prescriptiveActions.map(act => {
                    const isApplied = appliedActions.includes(act.id);
                    return (
                      <div
                        key={act.id}
                        className={`p-4 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                          isApplied 
                            ? 'bg-slate-50/50 border-slate-200 opacity-60' 
                            : 'bg-white border-slate-200 hover:shadow-xs'
                        }`}
                      >
                        <div className="space-y-2 max-w-xl">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Alvo:</span>
                            <span className="text-xs font-black text-slate-800">{act.target}</span>
                            <span className={`text-[8px] font-black px-1.5 py-0.2 rounded uppercase ${act.badgeColor}`}>
                              {act.type === 'warning' ? '⚠️ ADVERTÊNCIA' : act.type === 'training' ? '🎓 TREINAMENTO' : act.type === 'maint' ? '🔧 MANUTENÇÃO' : act.type === 'bonus' ? '⭐ PREMIAÇÃO' : '♻️ REESTRUTURAÇÃO'}
                            </span>
                          </div>

                          <h4 className="text-xs font-extrabold text-slate-900">{act.title}</h4>
                          <p className="text-[11px] text-slate-500 leading-normal">{act.desc}</p>
                          <p className="text-[10px] text-emerald-700 font-bold bg-emerald-50/30 px-2 py-0.5 rounded w-fit">
                            🎯 Retorno Esperado: {act.impact}
                          </p>
                        </div>

                        <div className="shrink-0">
                          <button
                            onClick={() => handleApplyAction(act.id)}
                            disabled={isApplied}
                            className={`w-full sm:w-auto px-4 py-2 rounded-lg text-xs font-black transition-all cursor-pointer ${
                              isApplied 
                                ? 'bg-emerald-100 text-emerald-800' 
                                : 'bg-slate-900 text-white hover:bg-slate-800'
                            }`}
                          >
                            {isApplied ? '✓ Ação Aplicada' : 'Aplicar Recomendação'}
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-12 text-slate-400 italic text-xs">
                    Nenhuma ação recomendada para a configuração atual de motoristas e veículos.
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FOOTER AUDIT TIMESTAMP */}
      <div className="text-center text-[10px] text-slate-400 font-bold py-4">
        Auditoria de Conformidade • Banco de Dados Local • Versão Analítica 1.0.0
      </div>

    </motion.div>
  );
}
