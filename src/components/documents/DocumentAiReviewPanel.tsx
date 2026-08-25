import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bot, Check, ExternalLink, FileSearch, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { AttachmentClient } from '../../api/attachmentClient';
import {
  DocumentAiClient,
  type DocumentAiExtraction,
  type DocumentAiObservability,
  type DocumentAiReviewInput,
} from '../../api/documentAiClient';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../ui/Button';

const WRITE_ROLES = new Set(['ADMIN', 'MANAGER', 'OPERATIONAL_MANAGER', 'OPERATIONAL']);

function editableValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function correctedValue(text: string, original: unknown): unknown {
  if (typeof original === 'number') {
    const numberValue = Number(text);
    return Number.isFinite(numberValue) ? numberValue : text;
  }
  if (typeof original === 'boolean') {
    if (text.trim().toLowerCase() === 'true') return true;
    if (text.trim().toLowerCase() === 'false') return false;
  }
  if (original && typeof original === 'object') {
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }
  return text;
}

function confidenceLabel(value: unknown): { text: string; className: string } {
  const confidence = typeof value === 'number' && Number.isFinite(value) ? value : null;
  if (confidence === null) return { text: 'Confiança não informada', className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' };
  const percentage = Math.max(0, Math.min(100, Math.round(confidence * 100)));
  if (percentage >= 85) return { text: `${percentage}%`, className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' };
  if (percentage >= 60) return { text: `${percentage}%`, className: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' };
  return { text: `${percentage}%`, className: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300' };
}

function runtimeDescription(mode: DocumentAiObservability['runtime']['mode']): string {
  if (mode === 'DISABLED') return 'Processamento automático desativado';
  if (mode === 'MISCONFIGURED') return 'Configuração incompleta';
  return 'Pronto apenas para documentos sintéticos';
}

function DocumentAiObservabilitySummary({
  snapshot,
  unavailable,
}: {
  snapshot: DocumentAiObservability | null;
  unavailable: boolean;
}) {
  if (!snapshot) {
    return (
      <div className="mx-4 mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
        <p className="font-medium">Indicadores operacionais indisponíveis</p>
        <p className="mt-1 text-xs">A fila de revisão permanece acessível; nenhuma execução foi iniciada.</p>
      </div>
    );
  }
  const counts = snapshot.counts;
  return (
    <section className="mx-4 mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900" aria-label="Observabilidade documental">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{runtimeDescription(snapshot.runtime.mode)}</p>
          <p className="text-xs text-slate-500">Somente leitura · execução automática bloqueada</p>
        </div>
        <span className="text-xs text-slate-500">{counts.total} extrações registradas</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ['Na fila', counts.PENDING],
          ['Processando', counts.PROCESSING],
          ['Em revisão', counts.REVIEW_REQUIRED],
          ['Falhas', counts.FAILED],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-md border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-950">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
            <p className="text-lg font-semibold text-slate-900 dark:text-white">{value}</p>
          </div>
        ))}
      </div>
      {unavailable && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">Indicadores anteriores preservados durante uma falha temporária de atualização.</p>}
    </section>
  );
}

export function DocumentAiReviewPanel() {
  const { user } = useAuth();
  const [items, setItems] = useState<DocumentAiExtraction[]>([]);
  const [observability, setObservability] = useState<DocumentAiObservability | null>(null);
  const [observabilityUnavailable, setObservabilityUnavailable] = useState(false);
  const [selectedId, setSelectedId] = useState<string>('');
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<'APPROVE' | 'REJECT' | 'RETRY' | null>(null);
  const [openingSource, setOpeningSource] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canReview =
    WRITE_ROLES.has(user.role.toUpperCase()) ||
    user.permissions.includes('*') ||
    user.permissions.includes('PROCESS_DOCUMENT_AI');

  const selected = useMemo(
    () => items.find((item) => item.id === selectedId) || items[0] || null,
    [items, selectedId],
  );

  const resetDraft = (item: DocumentAiExtraction | null) => {
    if (!item) {
      setDraft({});
      setNotes('');
      return;
    }
    setDraft(Object.fromEntries(
      Object.entries(item.proposedFields).map(([key, value]) => [key, editableValue(value)]),
    ));
    setNotes('');
  };

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [reviewResult, failedResult, observabilityResult] = await Promise.allSettled([
        DocumentAiClient.list('REVIEW_REQUIRED'),
        DocumentAiClient.list('FAILED'),
        DocumentAiClient.observability(),
      ]);
      if (observabilityResult.status === 'fulfilled') {
        setObservability(observabilityResult.value);
        setObservabilityUnavailable(false);
      } else {
        setObservabilityUnavailable(true);
      }
      if (reviewResult.status === 'rejected') throw reviewResult.reason;
      if (failedResult.status === 'rejected') throw failedResult.reason;
      const next = [...reviewResult.value, ...failedResult.value];
      setItems(next);
      setSelectedId((current) => next.some((item) => item.id === current) ? current : (next[0]?.id || ''));
      resetDraft(next.find((item) => item.id === selectedId) || next[0] || null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar revisões documentais.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    resetDraft(selected);
  }, [selected?.id]);

  const selectItem = (id: string) => {
    setSelectedId(id);
    const item = items.find((candidate) => candidate.id === id) || null;
    resetDraft(item);
  };

  const buildCorrections = (): Record<string, unknown> => {
    if (!selected) return {};
    const corrections: Record<string, unknown> = {};
    for (const [key, original] of Object.entries(selected.proposedFields)) {
      const candidate = correctedValue(draft[key] ?? '', original);
      if (JSON.stringify(candidate) !== JSON.stringify(original)) corrections[key] = candidate;
    }
    return corrections;
  };

  const review = async (decision: DocumentAiReviewInput['decision']) => {
    if (!selected || !canReview) return;
    setSubmitting(decision);
    setError(null);
    try {
      await DocumentAiClient.review(selected.id, {
        decision,
        corrections: buildCorrections(),
        notes,
      });
      const remaining = items.filter((item) => item.id !== selected.id);
      setItems(remaining);
      setSelectedId(remaining[0]?.id || '');
      resetDraft(remaining[0] || null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao registrar revisão documental.');
    } finally {
      setSubmitting(null);
    }
  };

  const retry = async () => {
    if (!selected || selected.status !== 'FAILED' || !canReview) return;
    setSubmitting('RETRY');
    setError(null);
    try {
      await DocumentAiClient.retry(selected.id);
      const remaining = items.filter((item) => item.id !== selected.id);
      setItems(remaining);
      setSelectedId(remaining[0]?.id || '');
      resetDraft(remaining[0] || null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao solicitar nova tentativa.');
    } finally {
      setSubmitting(null);
    }
  };

  const openSource = async () => {
    if (!selected) return;
    setOpeningSource(true);
    setError(null);
    try {
      const blob = await AttachmentClient.content(selected.attachmentId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Não foi possível abrir o documento de origem.');
    } finally {
      setOpeningSource(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">Carregando propostas para revisão...</div>;
  }

  if (items.length === 0) {
    return (
      <div>
        <DocumentAiObservabilitySummary snapshot={observability} unavailable={observabilityUnavailable} />
        <div className="p-6 text-center">
        <ShieldCheck className="h-9 w-9 mx-auto text-emerald-500 mb-2" />
        <p className="font-medium text-slate-900 dark:text-white">Nenhuma proposta ou falha pendente</p>
        <p className="text-sm text-slate-500 mt-1">Extrações futuras aparecerão aqui antes de qualquer aplicação no ERP.</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => void load()} icon={<RefreshCw className="h-4 w-4" />}>
          Atualizar
        </Button>
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
        </div>
      </div>
    );
  }

  if (!selected) return null;

  const fields = Object.entries(selected.proposedFields);

  return (
    <div>
      <DocumentAiObservabilitySummary snapshot={observability} unavailable={observabilityUnavailable} />
      <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] min-h-[420px]">
      <aside className="border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-slate-800 p-3 space-y-2">
        <div className="flex items-center justify-between px-2 py-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Revisão e falhas ({items.length})
          </span>
          <button type="button" onClick={() => void load()} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800" title="Atualizar">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
        {items.map((item) => (
          <button
            type="button"
            key={item.id}
            onClick={() => selectItem(item.id)}
            className={`w-full text-left rounded-lg border p-3 transition-colors ${
              item.id === selected.id
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                : 'border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium truncate">{item.detectedDocumentType || 'Documento não classificado'}</p>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                item.status === 'FAILED'
                  ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                  : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
              }`}>
                {item.status === 'FAILED' ? 'Falhou' : 'Revisar'}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1 truncate">Anexo {item.attachmentId}</p>
            <p className="text-xs text-slate-400 mt-1">{new Date(item.createdAt).toLocaleString('pt-BR')}</p>
          </button>
        ))}
      </aside>

      <section className="p-4 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-blue-600" />
              <h3 className="font-semibold text-lg">
                {selected.status === 'FAILED' ? 'Falha controlada na extração' : 'Proposta de extração'}
              </h3>
            </div>
            <p className="text-sm text-slate-500 mt-1">
              {selected.detectedDocumentType || 'Tipo ainda não identificado'}
              {selected.provider ? ` · ${selected.provider}${selected.model ? ` / ${selected.model}` : ''}` : ''}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            isLoading={openingSource}
            onClick={() => void openSource()}
            icon={<ExternalLink className="h-4 w-4" />}
          >
            Ver origem
          </Button>
        </div>

        {selected.status === 'FAILED' ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            <p className="font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> A extração falhou sem gravar proposta parcial.
            </p>
            <p className="mt-1">
              Código seguro: {selected.failureCode || 'PROCESSING_FAILED'} · tentativa {selected.attemptCount} de 3.
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
            A IA apenas propõe. Aprovar registra a revisão, mas não altera motorista, veículo, contrato, documento operacional ou financeiro.
          </div>
        )}

        <div className="rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
            <p className="text-sm font-medium flex items-center gap-2"><FileSearch className="h-4 w-4" /> Campos encontrados</p>
            <p className="text-xs text-slate-500 mt-1">
              Origem: anexo {selected.attachmentId} · SHA-256 {selected.attachmentChecksum.slice(0, 12)}…
            </p>
          </div>
          {selected.status === 'FAILED' ? (
            <div className="p-5 text-sm text-red-700 dark:text-red-300">
              Nenhuma proposta válida foi persistida. Uma nova tentativa exige ação explícita e continuará sob o limite do servidor.
            </div>
          ) : fields.length === 0 ? (
            <div className="p-5 text-sm text-amber-700 dark:text-amber-300">Nenhum campo estruturado foi proposto. Rejeite ou aguarde novo processamento.</div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {fields.map(([key, proposed]) => {
                const confidence = confidenceLabel(selected.fieldConfidence[key]);
                const changed = draft[key] !== editableValue(proposed);
                return (
                  <div key={key} className="p-4 grid grid-cols-1 md:grid-cols-[180px_minmax(0,1fr)] gap-3">
                    <div>
                      <p className="text-sm font-medium break-words">{key}</p>
                      <span className={`inline-flex mt-1 rounded-full px-2 py-0.5 text-xs font-medium ${confidence.className}`}>
                        {confidence.text}
                      </span>
                      <p className="text-[11px] text-slate-400 mt-2">Origem: documento acima</p>
                    </div>
                    <div>
                      <label className="text-xs text-slate-500">Valor proposto / correção humana</label>
                      <input
                        value={draft[key] ?? ''}
                        onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}
                        className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm bg-white dark:bg-slate-950 ${
                          changed ? 'border-amber-500 ring-1 ring-amber-200' : 'border-slate-300 dark:border-slate-700'
                        }`}
                      />
                      {changed && <p className="text-xs text-amber-600 mt-1">Correção humana será auditada.</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {selected.status === 'REVIEW_REQUIRED' && (
          <div>
            <label className="block text-sm font-medium mb-1">Observação da revisão</label>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="Motivo da correção, aprovação ou rejeição..."
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            />
          </div>
        )}

        {!canReview && (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            Seu perfil pode consultar a proposta, mas não pode aprovar ou rejeitar.
          </p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          {selected.status === 'FAILED' ? (
            <Button
              disabled={!canReview || selected.attemptCount >= 3}
              isLoading={submitting === 'RETRY'}
              onClick={() => void retry()}
              icon={<RefreshCw className="h-4 w-4" />}
            >
              {selected.attemptCount >= 3 ? 'Limite de tentativas atingido' : 'Solicitar nova tentativa'}
            </Button>
          ) : (
            <>
              <Button
                variant="danger"
                disabled={!canReview}
                isLoading={submitting === 'REJECT'}
                onClick={() => void review('REJECT')}
                icon={<X className="h-4 w-4" />}
              >
                Rejeitar proposta
              </Button>
              <Button
                disabled={!canReview || fields.length === 0}
                isLoading={submitting === 'APPROVE'}
                onClick={() => void review('APPROVE')}
                icon={<Check className="h-4 w-4" />}
              >
                Aprovar revisão
              </Button>
            </>
          )}
        </div>
      </section>
      </div>
    </div>
  );
}
