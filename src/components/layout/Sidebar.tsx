import {
  LayoutDashboard,
  Car,
  Users,
  FileText,
  DollarSign,
  Wrench,
  TrendingUp,
  AlertTriangle,
  Menu,
  X,
  Shield,
  Locate,
  Layers,
  Archive,
  UserCheck,
  Image,
  Trash2,
  BarChart3,
  LogOut,
  CheckSquare,
  PieChart as PieChartIcon,
  CreditCard,
  RefreshCw
} from 'lucide-react';
import { useState } from 'react';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  inadimplentesCount: number;
  userRole: 'Administrador' | 'Financeiro' | 'Operador' | 'Consulta' | 'Somente leitura';
  setUserRole: (role: 'Administrador' | 'Financeiro' | 'Operador' | 'Consulta' | 'Somente leitura') => void;
  onClearAllData: () => void;
  onOpenBackupManager?: () => void;
  onExitApp?: () => void;
  hasSimulationData?: boolean;
  onToggleSimulation?: () => void;
}

export default function Sidebar({ activeTab, setActiveTab, inadimplentesCount, userRole, setUserRole, onClearAllData, onOpenBackupManager, onExitApp, hasSimulationData, onToggleSimulation }: SidebarProps) {

  const [isOpen, setIsOpen] = useState(false);

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, section: 'Principal' },
    { id: 'fleet_dashboard', label: 'Gestão de Frota', icon: BarChart3, section: 'Principal' },
    
    { id: 'veiculos', label: 'Veículos', icon: Car, section: 'Cadastros' },
    { id: 'motoristas', label: 'Motoristas', icon: Users, section: 'Cadastros' },
    { id: 'contratos', label: 'Contratos de Aluguel', icon: FileText, section: 'Cadastros' },
    { id: 'modelo_contrato', label: 'Modelo Contrato PDF', icon: FileText, section: 'Cadastros' },
    
    { id: 'financeiro_dashboard', label: 'Dashboard Financeiro', icon: PieChartIcon, section: 'Financeiro' },
    { id: 'contas_receber', label: 'Contas a Receber (Aluguéis)', icon: DollarSign, section: 'Financeiro' },
    { id: 'contas_pagar', label: 'Contas a Pagar (Despesas)', icon: CreditCard, section: 'Financeiro' },
    { id: 'fluxo_caixa', label: 'Fluxo de Caixa', icon: RefreshCw, section: 'Financeiro' },
    { id: 'despesas_veiculo', label: 'Despesas por Veículo', icon: Wrench, section: 'Financeiro' },
    { id: 'auditoria', label: 'Auditoria & Conciliação', icon: CheckSquare, section: 'Financeiro' },
    { id: 'inadimplentes', label: 'Painel Inadimplência', icon: AlertTriangle, section: 'Financeiro', badge: inadimplentesCount },
    
    { id: 'manutencao', label: 'Ordens de Serviço', icon: Wrench, section: 'Operacional' },
    { id: 'km_carros', label: 'KM & Troca de Óleo', icon: Car, section: 'Operacional' },
    { id: 'seguranca_status', label: 'Rastreio e Seguro', icon: Shield, section: 'Operacional' },
    { id: 'rastreadores', label: 'Rastreadores', icon: Locate, section: 'Operacional' },
    { id: 'acessorios', label: 'Acessórios', icon: Layers, section: 'Operacional' },
    
    { id: 'documentos', label: 'Documentos', icon: FileText, section: 'Documentos & Seguros' },
    { id: 'detran_regras', label: 'Regras DETRAN/SP', icon: FileText, section: 'Documentos & Seguros' },
    { id: 'seguradoras', label: 'Seguradoras', icon: Shield, section: 'Documentos & Seguros' },
    { id: 'fotos_videos', label: 'Fotos e Vídeos', icon: Image, section: 'Documentos & Seguros' },
    
    { id: 'relatorios', label: 'Relatórios de Gestão', icon: TrendingUp, section: 'Relatórios & Sistema' },
    { id: 'arquivo_morto', label: 'Arquivo Morto', icon: Archive, section: 'Relatórios & Sistema' },
  ];

  const sections = ['Principal', 'Cadastros', 'Financeiro', 'Operacional', 'Documentos & Seguros', 'Relatórios & Sistema'];

  const handleNavClick = (tabId: string) => {
    setActiveTab(tabId);
    setIsOpen(false);
  };

  const sidebarContent = (
    <div className="flex flex-col h-full bg-slate-900 text-slate-300">
      {/* Logo */}
      <div className="p-6 border-b border-slate-800 flex items-center gap-3 bg-black">
        <div className="w-9 h-9 bg-red-600 rounded-lg flex items-center justify-center text-xl shadow-lg shadow-red-500/20 text-white font-bold">
          🚗
        </div>
        <div>
          <span className="text-white font-bold text-lg block tracking-tight leading-none">AutoERP</span>
          <small className="text-red-500 text-xs font-bold tracking-wide">Gestão de Frotas</small>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-5 bg-black">
        {sections.map(section => (
          <div key={section} className="space-y-0.5">
            <span className="px-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1.5">
              {section}
            </span>
            {menuItems
              .filter(item => item.section === section)
              .map(item => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                     key={item.id}
                     onClick={() => handleNavClick(item.id)}
                     title={item.label}
                     aria-label={item.label}
                     className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                       isActive
                         ? 'bg-red-600/15 text-red-500 border-l-2 border-red-600 font-bold'
                         : 'hover:bg-slate-800/50 hover:text-white border-l-2 border-transparent text-slate-400'
                     }`}
                  >
                    <Icon className={`w-5 h-5 shrink-0 ${isActive ? 'text-red-500' : 'text-slate-500'}`} />
                    <span className="flex-1 text-left">{item.label}</span>
                    {item.badge && item.badge > 0 ? (
                      <span className="bg-rose-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-sm">
                        {item.badge}
                      </span>
                    ) : null}
                  </button>
                );
              })}
          </div>
        ))}
      </nav>

      {/* Footer & Nível de Acesso */}
      <div className="p-4 border-t border-slate-800 bg-black">
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
            <UserCheck className="w-3.5 h-3.5 text-red-500" /> Nível de Acesso
          </label>
          <select
            value={userRole}
            onChange={(e) => setUserRole(e.target.value as any)}
            className="w-full bg-slate-900 border border-slate-800 text-slate-200 rounded-md py-1 px-2 text-xs font-bold focus:outline-none focus:border-red-600 cursor-pointer"
          >
            <option value="Administrador">Administrador</option>
            <option value="Financeiro">Financeiro</option>
            <option value="Operador">Operador</option>
            <option value="Consulta">Consulta</option>
            <option value="Somente leitura">Somente leitura</option>
          </select>
        </div>
        
        {onOpenBackupManager && (
          <button
            onClick={onOpenBackupManager}
            className="mt-3.5 w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white rounded-lg py-1.5 px-2 text-[11px] font-extrabold transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
            title="Ver e restaurar backups automáticos"
          >
            <Archive className="w-3.5 h-3.5 shrink-0 text-emerald-400" /> Backups do Sistema
          </button>
        )}
        
        {onToggleSimulation && (
          <button
            onClick={onToggleSimulation}
            className={`mt-2 w-full border rounded-lg py-1.5 px-2 text-[11px] font-extrabold transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer ${
              hasSimulationData 
                ? 'bg-amber-950/40 hover:bg-amber-600 border-amber-600/40 hover:border-amber-600 text-amber-400 hover:text-white shadow-sm'
                : 'bg-indigo-950/40 hover:bg-indigo-600 border-indigo-600/40 hover:border-indigo-600 text-indigo-400 hover:text-white shadow-sm'
            }`}
            title={hasSimulationData ? "Remover base de testes" : "Criar base completa de dados simulados"}
          >
            <Layers className="w-3.5 h-3.5 shrink-0" /> {hasSimulationData ? 'Remover Simulação' : 'Gerar Base de Testes'}
          </button>
        )}

        <button
          onClick={onClearAllData}
          className="mt-2 w-full bg-red-950/40 hover:bg-red-600 border border-red-600/40 hover:border-red-600 text-red-400 hover:text-white rounded-lg py-2 px-2 text-[11px] font-black transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer shadow-sm uppercase tracking-wide"
          title="Excluir todos os dados e zerar a planilha com backup automático"
        >
          <Trash2 className="w-3.5 h-3.5 shrink-0" /> Zerar Planilha
        </button>

        {onExitApp && (
          <button
            onClick={onExitApp}
            className="mt-2 w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white rounded-lg py-1.5 px-2 text-[11px] font-extrabold transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer"
            title="Sair do programa e verificar pendências"
          >
            <LogOut className="w-3.5 h-3.5 shrink-0 text-red-500" /> Sair do Sistema
          </button>
        )}

        <div className="mt-3.5 text-[10px] text-slate-600 font-medium flex justify-between">
          <span>v1.2.0 • AutoERP</span>
          <span className="text-red-500 font-bold">100% Seguro</span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:block w-60 fixed top-0 left-0 bottom-0 z-40 border-r border-slate-800">
        {sidebarContent}
      </aside>

      {/* Mobile Toggle & Header */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 fixed top-0 left-0 right-0 z-50 text-white">
        <div className="flex items-center gap-2">
          <div className="text-xl">🚗</div>
          <span className="font-bold tracking-tight">AutoERP</span>
        </div>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-1 text-slate-400 hover:text-white rounded"
        >
          {isOpen ? <Menu className="w-6 h-6" /> : <X className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      {isOpen && (
        <div className="md:hidden fixed inset-0 top-[52px] z-50 bg-slate-900">
          {sidebarContent}
        </div>
      )}
    </>
  );
}
