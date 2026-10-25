import React, { useState } from 'react';
import { ModalContainer } from '../ui/ModalContainer';
import { Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Button } from '../ui/Button';
import { FinanceSettlementClient, SettlementAccountOption } from '../../api/financeSettlementClient';
import { AlertCircle, Landmark } from 'lucide-react';
import { requestGuardedClose } from '../../app/unsavedChangesAuthority';

interface QuickAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccountCreated: (account: SettlementAccountOption) => void;
}

const ACCOUNT_TYPE_OPTIONS = [
  { value: 'CASH', label: 'Caixa Físico / Espécie' },
  { value: 'BANK', label: 'Conta Bancária (Corrente / Poupança)' },
  { value: 'DIGITAL_ACCOUNT', label: 'Conta Digital (Fintech)' },
  { value: 'INVESTMENT', label: 'Aplicação / Investimento' },
];

export const QuickAccountModal: React.FC<QuickAccountModalProps> = ({
  isOpen,
  onClose,
  onAccountCreated,
}) => {
  const [name, setName] = useState('');
  const [type, setType] = useState('CASH');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Informe o nome da conta.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const created = await FinanceSettlementClient.quickCreateAccount({
        name: trimmedName,
        type,
      });
      setName('');
      setType('CASH');
      onAccountCreated(created);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cadastrar conta financeira.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalContainer
      isOpen={isOpen}
      onClose={onClose}
      title="Nova Conta Financeira"
      subtitle="Cadastre uma conta rapidamente para registrar a baixa"
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 p-3 text-xs rounded-lg border border-error-border bg-error-bg text-error-text">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-3">
          <Input
            label="Nome da Conta *"
            placeholder="Ex: Banco Itaú - Principal ou Caixa Recepção"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
            required
            autoFocus
          />

          <Select
            label="Tipo de Conta *"
            value={type}
            onChange={(e) => setType(e.target.value)}
            options={ACCOUNT_TYPE_OPTIONS}
          />
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-graphite-100 dark:border-graphite-800">
          <Button
            type="button"
            variant="ghost"
            onClick={(event) => requestGuardedClose(event, onClose)}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="primary"
            disabled={isSubmitting || !name.trim()}
          >
            {isSubmitting ? 'Salvando...' : 'Criar Conta'}
          </Button>
        </div>
      </form>
    </ModalContainer>
  );
};
