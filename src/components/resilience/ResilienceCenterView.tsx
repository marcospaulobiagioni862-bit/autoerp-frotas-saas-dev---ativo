import React, { useState, useEffect } from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { 
  ShieldCheck, 
  ShieldAlert, 
  Activity, 
  Database, 
  HardDrive, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle2, 
  RefreshCw,
  Server,
  Lock,
  Download,
  RotateCcw,
  CheckCircle,
  FileText
} from 'lucide-react';
import { BackupService, BackupRecord, DisasterRecoveryStatusState } from '../../domain/resilience/BackupService';

export const ResilienceCenterView: React.FC = () => {
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [drStatus, setDrStatus] = useState<DisasterRecoveryStatusState | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [selectedBackupId, setSelectedBackupId] = useState<string>('');
  const [confirmRestoreModal, setConfirmRestoreModal] = useState<boolean>(false);

  const companyId = 'company-default';
  const userId = 'admin-user-01';

  const loadData = () => {
    setLoading(true);
    const list = BackupService.listBackups(companyId);
    const status = BackupService.getDisasterRecoveryStatus(companyId);
    setBackups(list);
    setDrStatus(status);
    if (list.length > 0 && !selectedBackupId) {
      setSelectedBackupId(list[0].id);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateBackup = async () => {
    setActionMessage('Criando backup automático...');
    try {
      await BackupService.createBackup(companyId, userId, 'MANUAL', `corr-manual-${Date.now()}`);
      loadData();
      setActionMessage('Backup criado e validado com sucesso.');
    } catch (err: any) {
      setActionMessage(`Erro ao criar backup: ${err?.message || err}`);
    }
  };

  const handleRestore = async () => {
    if (!selectedBackupId) return;
    setActionMessage('Executando restore controlado...');
    try {
      const res = await BackupService.restoreBackup(selectedBackupId, companyId, userId, `corr-restore-${Date.now()}`);
      setActionMessage(res.message);
      setConfirmRestoreModal(false);
      loadData();
    } catch (err: any) {
      setActionMessage(`Erro no restore: ${err?.message || err}`);
      setConfirmRestoreModal(false);
    }
  };

  if (loading || !drStatus) {
    return (
      <div className="p-8 flex justify-center items-center py-24">
        <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-indigo-600" />
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Continuidade Operacional & Disaster Recovery</h1>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Gerenciamento de backups imutáveis, validação de checksums, RPO/RTO e restauração controlada para o AutoERP.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={loadData} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Atualizar Status
          </Button>
          <Button onClick={handleCreateBackup} className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white">
            <Download className="w-4 h-4" /> Criar Backup Agora
          </Button>
        </div>
      </div>

      {actionMessage && (
        <div className="p-4 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 text-indigo-800 dark:text-indigo-300 text-sm flex items-center justify-between">
          <span>{actionMessage}</span>
          <button onClick={() => setActionMessage(null)} className="text-xs font-semibold underline">Fechar</button>
        </div>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-5 flex flex-col justify-between border-l-4 border-l-indigo-600">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Estado de Resiliência</p>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{drStatus.state}</h3>
          </div>
          <p className="text-xs text-slate-500 mt-4">Sistema operacional protegido</p>
        </Card>

        <Card className="p-5 flex flex-col justify-between border-l-4 border-l-emerald-600">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">RPO (Recovery Point Objective)</p>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{drStatus.rpoActualMinutes} min</h3>
          </div>
          <p className="text-xs text-slate-500 mt-4">Meta: &le; {drStatus.rpoTargetMinutes / 60}h ({drStatus.rpoStatus})</p>
        </Card>

        <Card className="p-5 flex flex-col justify-between border-l-4 border-l-blue-600">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">RTO (Recovery Time Objective)</p>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{drStatus.rtoActualSeconds} seg</h3>
          </div>
          <p className="text-xs text-slate-500 mt-4">Meta: &le; {drStatus.rtoTargetSeconds}s ({drStatus.rtoStatus})</p>
        </Card>

        <Card className="p-5 flex flex-col justify-between border-l-4 border-l-purple-600">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Backups Válidos</p>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{backups.length} snapshots</h3>
          </div>
          <p className="text-xs text-slate-500 mt-4">Integridade via SHA-256 Checksum</p>
        </Card>
      </div>

      {/* Backup History & Management */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-6 lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Histórico de Snapshots de Backup</h3>
            <span className="text-xs text-slate-500">Isolamento Multi-Tenant Ativo</span>
          </div>

          <div className="space-y-3">
            {backups.length === 0 ? (
              <p className="text-center py-8 text-sm text-slate-500">Nenhum backup encontrado. Clique em "Criar Backup Agora" para gerar o primeiro snapshot.</p>
            ) : (
              backups.map((bkp) => (
                <div 
                  key={bkp.id}
                  className={`p-4 rounded-lg border transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                    selectedBackupId === bkp.id 
                      ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/20' 
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                  }`}
                  onClick={() => setSelectedBackupId(bkp.id)}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 text-xs font-bold rounded bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
                        {bkp.type}
                      </span>
                      <span className="text-xs font-mono text-slate-500">{bkp.id}</span>
                      <span className="text-xs text-slate-400">{new Date(bkp.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 font-mono truncate max-w-md">
                      Checksum: {bkp.checksum}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span>Registros: <b>{bkp.recordCount}</b></span>
                      <span>Tamanho: <b>{Math.round(bkp.size / 1024)} KB</b></span>
                      <span className="text-emerald-600 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Validado
                      </span>
                    </div>
                  </div>
                  <div>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedBackupId(bkp.id);
                        setConfirmRestoreModal(true);
                      }}
                      className="gap-1.5 text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                    >
                      <RotateCcw className="w-3.5 h-3.5" /> Restaurar
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        {/* Runbook & Disaster Recovery Summary */}
        <Card className="p-6 space-y-4">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-600" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Runbook & Procedimentos DR</h3>
          </div>
          <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
            <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg space-y-1 border border-slate-200 dark:border-slate-800">
              <span className="font-semibold text-slate-900 dark:text-slate-100 block">1. Diagnóstico de Falha</span>
              <p className="text-xs">Monitore os alertas P0/P1 na central de observabilidade em caso de corrupção ou indisponibilidade.</p>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg space-y-1 border border-slate-200 dark:border-slate-800">
              <span className="font-semibold text-slate-900 dark:text-slate-100 block">2. Seleção de Backup Válido</span>
              <p className="text-xs">Escolha o snapshot mais recente com checksum verificado SHA-256 intacto.</p>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg space-y-1 border border-slate-200 dark:border-slate-800">
              <span className="font-semibold text-slate-900 dark:text-slate-100 block">3. Restore Controlado</span>
              <p className="text-xs">Confirme a operação restrita ao tenant atual (`companyId`). O núcleo financeiro permanece inviolável.</p>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg space-y-1 border border-slate-200 dark:border-slate-800">
              <span className="font-semibold text-slate-900 dark:text-slate-100 block">4. Validação & AuditLog</span>
              <p className="text-xs">O sistema valida a integridade relacional pós-restore e registra todas as ações no AuditLog.</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Confirmation Modal */}
      {confirmRestoreModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl p-6 max-w-md w-full space-y-4 border border-slate-200 dark:border-slate-800 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-600">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Confirmar Restore Controlado</h3>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Você está prestes a restaurar o snapshot selecionado (<span className="font-mono font-semibold">{selectedBackupId}</span>). Os dados atuais da empresa serão substituídos pelo estado do backup. O núcleo financeiro está protegido.
            </p>
            <div className="flex items-center justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setConfirmRestoreModal(false)}>Cancelar</Button>
              <Button onClick={handleRestore} className="bg-rose-600 hover:bg-rose-700 text-white">CONFIRMAR RESTORE</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
