import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Car,
  Check,
  CheckSquare,
  DollarSign,
  FileText,
  Lock,
  MessageSquare,
  ShieldAlert,
  ShieldCheck,
  User as UserIcon,
  Wrench,
  X,
} from 'lucide-react';
import { AdminUserClient, type AdminUserDto } from '../../api/adminUserClient';
import { Badge, Button, ModalContainer } from '../ui';

export interface UserPermissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: AdminUserDto;
  currentUserRole?: string;
  onSuccess: (updatedUser: AdminUserDto) => void;
}

export interface PermissionItem {
  key: string;
  label: string;
  description: string;
}

export interface PermissionGroup {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  permissions: PermissionItem[];
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    id: 'fleet',
    name: 'Frota & Veículos',
    icon: Car,
    permissions: [
      { key: 'VIEW_VEHICLE', label: 'Visualizar veículos', description: 'Consultar ficha técnica, placas e histórico da frota' },
      { key: 'CREATE_VEHICLE', label: 'Cadastrar veículos', description: 'Inserir novos veículos e extrair via CRLV' },
      { key: 'EDIT_VEHICLE', label: 'Editar veículos', description: 'Atualizar dados cadastrais de veículos' },
      { key: 'CHANGE_VEHICLE_STATUS', label: 'Alterar status', description: 'Mudar status entre disponível, alugado, manutenção ou vendido' },
      { key: 'RECORD_KM', label: 'Registrar odômetro / KM', description: 'Lançar leituras de odômetro individual ou em lote' },
      { key: 'ARCHIVE_VEHICLE', label: 'Arquivar veículos', description: 'Arquivar veículos preservando histórico' },
    ],
  },
  {
    id: 'drivers',
    name: 'Motoristas',
    icon: UserIcon,
    permissions: [
      { key: 'VIEW_DRIVER', label: 'Visualizar motoristas', description: 'Acessar fichas cadastrais e dados dos condutores' },
      { key: 'CREATE_DRIVER', label: 'Cadastrar motoristas', description: 'Cadastrar novos motoristas e importar CNH com IA' },
      { key: 'EDIT_DRIVER', label: 'Editar motoristas', description: 'Atualizar contatos, endereços e habilitação' },
      { key: 'VIEW_DRIVER_HEALTH', label: 'Visualizar saúde', description: 'Consultar prontuário de saúde e contatos de emergência' },
      { key: 'EDIT_DRIVER_HEALTH', label: 'Editar dados de saúde', description: 'Atualizar ficha médica e de emergência' },
      { key: 'ARCHIVE_DRIVER', label: 'Arquivar motoristas', description: 'Inativar e arquivar motoristas' },
    ],
  },
  {
    id: 'contracts',
    name: 'Contratos de Locação',
    icon: FileText,
    permissions: [
      { key: 'VIEW_CONTRACT', label: 'Visualizar contratos', description: 'Acessar contratos ativos, vigências e histórico' },
      { key: 'CREATE_CONTRACT', label: 'Criar contratos', description: 'Montar novos contratos em rascunho' },
      { key: 'EDIT_CONTRACT', label: 'Editar contratos', description: 'Alterar valores, franquias e vigência de contratos em rascunho' },
      { key: 'SIGN_CONTRACT', label: 'Gerenciar assinaturas', description: 'Gerar PDF oficial e registrar confirmação de assinatura' },
      { key: 'CLOSE_CONTRACT', label: 'Encerrar contratos', description: 'Encerrar contrato ativo e liberar o veículo associado' },
      { key: 'CANCEL_CONTRACT', label: 'Cancelar contratos', description: 'Cancelar contratos antes do início de vigência' },
      { key: 'ARCHIVE_CONTRACT', label: 'Arquivar contratos', description: 'Arquivar contratos finalizados ou cancelados' },
    ],
  },
  {
    id: 'inspections',
    name: 'Vistorias Operacionais',
    icon: CheckSquare,
    permissions: [
      { key: 'VIEW_INSPECTION', label: 'Visualizar vistorias', description: 'Acessar histórico de check-ins e check-outs' },
      { key: 'CREATE_INSPECTION', label: 'Realizar vistorias', description: 'Executar vistoria técnica de entrega e devolução' },
    ],
  },
  {
    id: 'maintenance',
    name: 'Manutenção & Oficinas',
    icon: Wrench,
    permissions: [
      { key: 'VIEW_MAINTENANCE', label: 'Visualizar manutenção', description: 'Acessar ordens de serviço e planos preventivos' },
      { key: 'MUTATE_MAINTENANCE', label: 'Gerenciar OS e preventivas', description: 'Criar, alterar, faturar e concluir ordens de serviço' },
    ],
  },
  {
    id: 'tickets',
    name: 'Multas de Trânsito',
    icon: AlertTriangle,
    permissions: [
      { key: 'VIEW_TRAFFIC_TICKET', label: 'Visualizar multas', description: 'Consultar infrações, órgãos e autos de infração' },
      { key: 'TRAFFIC_TICKET_WRITE', label: 'Gerenciar multas e indicação', description: 'Atribuir responsabilidade, gerar cobrança e registrar indicação' },
    ],
  },
  {
    id: 'finance',
    name: 'Financeiro & Caixa',
    icon: DollarSign,
    permissions: [
      { key: 'VIEW_FINANCE', label: 'Visualizar financeiro', description: 'Consultar fluxo de caixa, títulos e relatórios (somente leitura)' },
      { key: 'RECEIPT_REGISTER', label: 'Baixar recebimentos', description: 'Registrar recebimentos de aluguel e caução' },
      { key: 'PAYMENT_REGISTER', label: 'Baixar pagamentos', description: 'Registrar pagamento de contas a pagar' },
      { key: 'RECEIVABLE_MUTATE', label: 'Gerenciar contas a receber', description: 'Criar, editar e cancelar títulos a receber' },
      { key: 'PAYABLE_MUTATE', label: 'Gerenciar contas a pagar', description: 'Criar, fatiar e cancelar títulos a pagar' },
    ],
  },
  {
    id: 'comms_docs',
    name: 'Comunicação & Documentos',
    icon: MessageSquare,
    permissions: [
      { key: 'MANAGE_WHATSAPP', label: 'WhatsApp (wa.me)', description: 'Gerar links de cobrança, KM e CNH via WhatsApp' },
      { key: 'VIEW_DOCUMENT', label: 'Visualizar documentos', description: 'Consultar repositório e alertas de vencimento' },
      { key: 'MUTATE_DOCUMENT', label: 'Gerenciar alertas e arquivos', description: 'Configurar régua de alertas e arquivamento de documentos' },
      { key: 'PROCESS_DOCUMENT_AI', label: 'Leitura com IA (OCR)', description: 'Processar CRLVs, CNHs e autos de infração com IA' },
    ],
  },
  {
    id: 'admin',
    name: 'Administração do Sistema',
    icon: ShieldCheck,
    permissions: [
      { key: 'MANAGE_USERS', label: 'Gerenciar usuários', description: 'Ativar, inativar e editar permissões de usuários' },
      { key: 'MANAGE_TENANT', label: 'Configurar empresa / tenant', description: 'Editar parâmetros globais e perfil da empresa' },
    ],
  },
];

const ALL_PERMISSION_KEYS = PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => p.key));

export const ROLE_PRESETS: Record<string, { label: string; description: string; permissions: string[] }> = {
  ADMIN: {
    label: 'Administrador',
    description: 'Acesso irrestrito a todas as áreas, incluindo usuários e configurações da empresa.',
    permissions: ['*', ...ALL_PERMISSION_KEYS],
  },
  MANAGER: {
    label: 'Gestor Operacional',
    description: 'Controle total sobre frota, motoristas, contratos, vistorias e manutenção; financeiro e multas para acompanhamento.',
    permissions: ALL_PERMISSION_KEYS.filter((p) => p !== 'MANAGE_USERS' && p !== 'MANAGE_TENANT'),
  },
  OPERATIONAL: {
    label: 'Operador Geral',
    description: 'Chão de fábrica: KM, vistorias, ordens de serviço e cadastro. Financeiro somente leitura.',
    permissions: [
      'VIEW_VEHICLE', 'CREATE_VEHICLE', 'EDIT_VEHICLE', 'CHANGE_VEHICLE_STATUS', 'RECORD_KM',
      'VIEW_DRIVER', 'CREATE_DRIVER', 'EDIT_DRIVER',
      'VIEW_CONTRACT',
      'VIEW_INSPECTION', 'CREATE_INSPECTION',
      'VIEW_MAINTENANCE', 'MUTATE_MAINTENANCE',
      'VIEW_TRAFFIC_TICKET',
      'VIEW_FINANCE',
      'MANAGE_WHATSAPP',
      'VIEW_DOCUMENT', 'PROCESS_DOCUMENT_AI',
    ],
  },
  FINANCIAL: {
    label: 'Financeiro',
    description: 'Gestão completa de Contas a Receber, Contas a Pagar, baixas e multas. Sem alteração de frota/manutenção.',
    permissions: [
      'VIEW_FINANCE', 'RECEIPT_REGISTER', 'PAYMENT_REGISTER', 'RECEIVABLE_MUTATE', 'PAYABLE_MUTATE',
      'VIEW_CONTRACT',
      'VIEW_TRAFFIC_TICKET', 'TRAFFIC_TICKET_WRITE',
      'VIEW_DRIVER',
      'VIEW_VEHICLE',
      'VIEW_DOCUMENT',
      'MANAGE_WHATSAPP',
    ],
  },
};

export const UserPermissionsModal: React.FC<UserPermissionsModalProps> = ({
  isOpen,
  onClose,
  user,
  onSuccess,
}) => {
  const initialRole = useMemo(() => {
    const raw = String(user.role || '').toUpperCase();
    return ROLE_PRESETS[raw] ? raw : 'OPERATIONAL';
  }, [user.role]);

  const [selectedRole, setSelectedRole] = useState<string>(initialRole);
  const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(() => {
    const existing = new Set<string>(user.permissions || []);
    if (existing.has('*')) {
      return new Set(['*', ...ALL_PERMISSION_KEYS]);
    }
    return existing;
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyPreset = (presetKey: string) => {
    setSelectedRole(presetKey);
    const preset = ROLE_PRESETS[presetKey];
    if (preset) {
      setSelectedPermissions(new Set(preset.permissions));
    }
  };

  const togglePermission = (key: string) => {
    setSelectedPermissions((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
        next.delete('*');
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleGroup = (group: PermissionGroup) => {
    const groupKeys = group.permissions.map((p) => p.key);
    const allSelected = groupKeys.every((k) => selectedPermissions.has(k) || selectedPermissions.has('*'));

    setSelectedPermissions((current) => {
      const next = new Set(current);
      if (allSelected) {
        groupKeys.forEach((k) => next.delete(k));
        next.delete('*');
      } else {
        groupKeys.forEach((k) => next.add(k));
      }
      return next;
    });
  };

  const handleSave = async () => {
    setLoading(true);
    setError(null);
    try {
      const permissionsArray: string[] = Array.from(selectedPermissions);
      if (selectedRole === 'ADMIN' && !permissionsArray.includes('*')) {
        permissionsArray.push('*');
      }
      const updated = await AdminUserClient.updateUserPermissions(user.id, {
        role: selectedRole,
        permissions: permissionsArray,
      });
      onSuccess(updated);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao salvar permissões do usuário.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const totalCount = ALL_PERMISSION_KEYS.length;
  const activeCount = selectedPermissions.has('*')
    ? totalCount
    : ALL_PERMISSION_KEYS.filter((k) => selectedPermissions.has(k)).length;

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="4xl">
      <div className="flex items-center justify-between border-b border-slate-100 p-4 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Matriz de Permissões de Acesso
            </h2>
            <Badge variant="outline">{user.name}</Badge>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {user.email} • ID: {user.id} • Ativo: {user.active ? 'Sim' : 'Não'}
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
          aria-label="Fechar modal"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Seção 1: Presets rápidos */}
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-4 dark:border-indigo-950/50 dark:bg-indigo-950/20">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-900 dark:text-indigo-200">
                1. Selecionar Perfil Operacional (Preset)
              </h3>
              <p className="text-[11px] text-slate-500">
                Escolha um perfil para aplicar os padrões recomendados da locadora. Você pode ajustar permissões individuais abaixo.
              </p>
            </div>
            <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">
              {activeCount} de {totalCount} permissões ativas
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(ROLE_PRESETS).map(([key, preset]) => {
              const isSelected = selectedRole === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => applyPreset(key)}
                  className={`flex flex-col text-left p-3 rounded-xl border transition-all ${
                    isSelected
                      ? 'border-indigo-600 bg-white shadow-sm ring-2 ring-indigo-500/20 dark:border-indigo-400 dark:bg-slate-900'
                      : 'border-slate-200 bg-white/70 hover:bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="font-bold text-xs text-slate-900 dark:text-slate-100">
                      {preset.label}
                    </span>
                    {isSelected && <Check className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />}
                  </div>
                  <p className="text-[10px] text-slate-500 leading-snug">
                    {preset.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Seção 2: Matriz por Módulo */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              2. Matriz Granular de Acessos por Módulo
            </h3>
            {selectedRole === 'ADMIN' && (
              <Badge className="border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300">
                Acesso irrestrito total (*)
              </Badge>
            )}
          </div>

          <div className="space-y-3">
            {PERMISSION_GROUPS.map((group) => {
              const GroupIcon = group.icon;
              const groupKeys = group.permissions.map((p) => p.key);
              const isAllGroupSelected = groupKeys.every((k) => selectedPermissions.has(k) || selectedPermissions.has('*'));
              const selectedGroupCount = groupKeys.filter((k) => selectedPermissions.has(k) || selectedPermissions.has('*')).length;

              return (
                <div
                  key={group.id}
                  className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-xs dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <div className="rounded-lg bg-slate-100 p-1.5 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        <GroupIcon className="w-4 h-4" />
                      </div>
                      <span className="font-bold text-xs text-slate-900 dark:text-slate-100">
                        {group.name}
                      </span>
                      <span className="text-[11px] text-slate-400">
                        ({selectedGroupCount}/{groupKeys.length})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleGroup(group)}
                      className="text-[11px] font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                    >
                      {isAllGroupSelected ? 'Desmarcar módulo' : 'Marcar todos'}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {group.permissions.map((perm) => {
                      const isChecked = selectedPermissions.has(perm.key) || selectedPermissions.has('*');
                      return (
                        <label
                          key={perm.key}
                          className={`flex items-start gap-2.5 p-2 rounded-lg border text-xs cursor-pointer transition ${
                            isChecked
                              ? 'border-indigo-200 bg-indigo-50/30 dark:border-indigo-900 dark:bg-indigo-950/20'
                              : 'border-slate-100 bg-slate-50/50 hover:bg-slate-50 dark:border-slate-800/60 dark:bg-slate-900/40'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => togglePermission(perm.key)}
                            className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-700"
                          />
                          <div className="min-w-0">
                            <span className="font-semibold text-slate-800 dark:text-slate-200 block text-xs">
                              {perm.label}
                            </span>
                            <span className="text-[10px] text-slate-500 block leading-tight">
                              {perm.description}
                            </span>
                            <span className="text-[9px] font-mono text-slate-400 block mt-0.5">
                              {perm.key}
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3.5 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
        <div className="text-xs text-slate-500">
          Papel configurado: <b className="font-semibold text-slate-700 dark:text-slate-300">{ROLE_PRESETS[selectedRole]?.label || selectedRole}</b>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleSave} isLoading={loading}>
            Salvar Permissões
          </Button>
        </div>
      </div>
    </ModalContainer>
  );
};
