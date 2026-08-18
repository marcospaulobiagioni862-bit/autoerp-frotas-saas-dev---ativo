from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p=Path(path); text=p.read_text(); count=text.count(old)
    if count!=1: raise SystemExit(f'{path}: expected one match, found {count}')
    p.write_text(text.replace(old,new,1))

# Server import + authenticated endpoint.
replace_once('server.ts',
"import { ReversalService } from './src/domain/finance/ReversalService';\n",
"import { ReversalService } from './src/domain/finance/ReversalService';\nimport { RenegotiationService } from './src/domain/finance/RenegotiationService';\n")

route=r'''  // SECURITY-2G6: receivable renegotiation is server-authoritative.
  app.post('/api/finance/receivables/renegotiate', async (req: Request, res: Response) => {
    const principal = requireFinancePrincipal(req, res);
    if (!principal) return;

    const obligationIds = Array.isArray(req.body?.obligationIds)
      ? req.body.obligationIds.filter((id: unknown): id is string => typeof id === 'string' && id.length > 0)
      : [];
    const newTotalAmount = Number(req.body?.newTotalAmount);
    const installmentsCount = Number(req.body?.installmentsCount);
    const firstDueDate = typeof req.body?.firstDueDate === 'string' ? req.body.firstDueDate : '';
    const categoryId = typeof req.body?.categoryId === 'string' ? req.body.categoryId : '';
    const description = typeof req.body?.description === 'string' ? req.body.description : '';

    if (
      obligationIds.length === 0 ||
      !Number.isFinite(newTotalAmount) ||
      newTotalAmount < 0 ||
      !Number.isInteger(installmentsCount) ||
      installmentsCount < 1 ||
      installmentsCount > 24 ||
      !firstDueDate ||
      !categoryId
    ) {
      res.status(400).json({ error: 'Payload de renegociação inválido' });
      return;
    }

    try {
      const items = await UnitOfWork.run(
        principal.companyId,
        async (txContext) =>
          await RenegotiationService.renegociate(
            {
              companyId: principal.companyId,
              obligationIds,
              type: 'RECEIVABLE',
              newTotalAmount,
              installmentsCount,
              firstDueDate,
              categoryId,
              description,
              userId: principal.userId,
              userName: principal.name,
            },
            txContext
          ),
        { financialPeriodLock: 'SHARED' }
      );
      res.status(201).json({ items });
    } catch (error) {
      sendFinanceCommandError(res, error);
    }
  });

'''
replace_once('server.ts',
"  // SECURITY-2G5: transaction history, transfers and reversals are server-authoritative.\n",
route+"  // SECURITY-2G5: transaction history, transfers and reversals are server-authoritative.\n")

# Modal transport migration.
p=Path('src/components/modals/RenegotiationModal.tsx'); text=p.read_text()
text=text.replace("import { FinanceEngine } from '../../domain/finance/FinanceEngine';\n",'')
text=text.replace("import { useAuth } from '../../hooks/useAuth';\n",'')
text=text.replace("import { X, RefreshCw, AlertCircle } from 'lucide-react';\n",
                  "import { X, RefreshCw, AlertCircle } from 'lucide-react';\nimport { FinanceRenegotiationClient } from '../../api/financeRenegotiationClient';\n")
text=text.replace("  const { user } = useAuth();\n",'')
old="""      // 1. Confirm that ALL receivables belong to user.companyId
      const anyNonSession = receivables.some((r) => r.companyId !== user.companyId);
      if (anyNonSession) {
        setError('Erro de isolamento de tenant: Um ou mais títulos selecionados não pertencem à sua empresa.');
        return;
      }

      // 2. Confirm that all belong to the SAME companyId
      const firstCompanyId = receivables[0].companyId;
      const anyMixedCompany = receivables.some((r) => r.companyId !== firstCompanyId);
      if (anyMixedCompany) {
        setError('Erro de isolamento de tenant: Não é permitido renegociar títulos de empresas distintas em uma mesma operação.');
        return;
      }

      setIsSubmitting(true);
      setError(null);

      await FinanceEngine.renegociate({
        companyId: user.companyId,
        obligationIds: receivables.map((r) => r.id),
        type: 'RECEIVABLE',
        newTotalAmount: Math.max(0, totalOriginalBalance - discountAmount + interestAmount),
        installmentsCount: installments,
        firstDueDate: newDueDate,
        categoryId: receivables[0].categoryId || 'cat-rec-1',
        description: notes || 'Renegociação de títulos em atraso',
        userId: user.userId,
        userName: user.name,
      });
"""
new="""      setIsSubmitting(true);
      setError(null);

      await FinanceRenegotiationClient.renegotiateReceivables({
        obligationIds: receivables.map((r) => r.id),
        newTotalAmount: Math.max(0, totalOriginalBalance - discountAmount + interestAmount),
        installmentsCount: installments,
        firstDueDate: newDueDate,
        categoryId: receivables[0].categoryId || 'cat-rec-1',
        description: notes || 'Renegociação de títulos em atraso',
      });
"""
if old not in text: raise SystemExit('RenegotiationModal submit block mismatch')
text=text.replace(old,new,1)
text=text.replace("    } catch (err: any) {\n      setError(err.message || 'Erro ao renegociar títulos.');\n",
                  "    } catch (err) {\n      setError(err instanceof Error ? err.message : 'Erro ao renegociar títulos.');\n")
p.write_text(text)
