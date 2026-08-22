from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    p = Path(path)
    source = p.read_text()
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exact anchor once, found {count}")
    p.write_text(source.replace(old, new, 1))


for path, noun in [
    ("src/domain/finance/ReceivableService.ts", "receivable"),
    ("src/domain/finance/PayableService.ts", "payable"),
]:
    anchor = f"    let {noun}:"
    replacement = (
        "    const cancellationReason = typeof reason === 'string' ? reason.trim() : '';\n"
        "    if (!cancellationReason || cancellationReason.length > 1000) {\n"
        "      throw new Error('Motivo de cancelamento é obrigatório e deve ter no máximo 1000 caracteres');\n"
        "    }\n\n"
        f"    let {noun}:"
    )
    replace_once(path, anchor, replacement)

replace_once(
    "src/domain/finance/ReceivableService.ts",
    """    const previousState = { ...receivable };

    const updatedReceivable = txContext
      ? await txContext.getReceivableRepo().update(receivableId, {
          status: ObligationStatus.CANCELLED,
          updatedAt: new Date().toISOString(),
        })
      : await this.repo.updateForCompany(receivableId, companyId, {
          status: ObligationStatus.CANCELLED,
          updatedAt: new Date().toISOString(),
        });""",
    """    const previousState = { ...receivable };
    const cancelledAt = new Date().toISOString();

    const updatedReceivable = txContext
      ? await txContext.getReceivableRepo().update(receivableId, {
          status: ObligationStatus.CANCELLED,
          cancelledAt,
          cancelReason: cancellationReason,
          updatedAt: cancelledAt,
        })
      : await this.repo.updateForCompany(receivableId, companyId, {
          status: ObligationStatus.CANCELLED,
          cancelledAt,
          cancelReason: cancellationReason,
          updatedAt: cancelledAt,
        });""",
)

replace_once(
    "src/domain/finance/PayableService.ts",
    """    const previousState = { ...payable };

    const updatedPayable = txContext
      ? await txContext.getPayableRepo().update(payableId, {
          status: ObligationStatus.CANCELLED,
          updatedAt: new Date().toISOString(),
        })
      : await this.repo.updateForCompany(payableId, companyId, {
          status: ObligationStatus.CANCELLED,
          updatedAt: new Date().toISOString(),
        });""",
    """    const previousState = { ...payable };
    const cancelledAt = new Date().toISOString();

    const updatedPayable = txContext
      ? await txContext.getPayableRepo().update(payableId, {
          status: ObligationStatus.CANCELLED,
          cancelledAt,
          cancelReason: cancellationReason,
          updatedAt: cancelledAt,
        })
      : await this.repo.updateForCompany(payableId, companyId, {
          status: ObligationStatus.CANCELLED,
          cancelledAt,
          cancelReason: cancellationReason,
          updatedAt: cancelledAt,
        });""",
)

replace_once(
    "server.ts",
    """  app.post('/api/finance/receivables/:id/cancel', async (req: Request, res: Response) => {
    const principal = requireFinancePrincipal(req, res);
    if (!principal) return;

    try {""",
    """  app.post('/api/finance/receivables/:id/cancel', async (req: Request, res: Response) => {
    const principal = requireFinancePrincipal(req, res);
    if (!principal) return;

    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (!reason || reason.length > 1000) {
      res.status(400).json({ error: 'Invalid receivable cancellation request' });
      return;
    }

    try {""",
)

replace_once(
    "server.ts",
    """  app.post('/api/finance/payables/:id/cancel', async (req: Request, res: Response) => {
    const principal = requireFinancePrincipal(req, res);
    if (!principal) return;

    try {""",
    """  app.post('/api/finance/payables/:id/cancel', async (req: Request, res: Response) => {
    const principal = requireFinancePrincipal(req, res);
    if (!principal) return;

    const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
    if (!reason || reason.length > 1000) {
      res.status(400).json({ error: 'Invalid payable cancellation request' });
      return;
    }

    try {""",
)

test_source = r'''import { sql } from 'drizzle-orm';
import { db } from '../../db';
import { UnitOfWork } from '../../db/uow';
import { ReceivableService } from '../../domain/finance/ReceivableService';
import { PayableService } from '../../domain/finance/PayableService';

const companyA = 'finance-r20-company-a';
const companyB = 'finance-r20-company-b';
const adminA = 'finance-r20-admin-a';
const adminB = 'finance-r20-admin-b';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function row(query: any): Promise<any> {
  const result: any = await db.execute(query);
  return result.rows?.[0];
}

async function rejects(fn: () => Promise<unknown>, contains: string): Promise<void> {
  let message = '';
  try { await fn(); } catch (error) { message = String(error); }
  assert(message.includes(contains), `expected rejection containing ${contains}, got ${message || 'no rejection'}`);
}

async function seed(): Promise<void> {
  await db.execute(sql`DELETE FROM audit_logs WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM account_receivables WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM account_payables WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM financial_categories WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM users WHERE company_id IN (${companyA},${companyB})`);
  await db.execute(sql`DELETE FROM companies WHERE id IN (${companyA},${companyB})`);

  await db.execute(sql`INSERT INTO companies(id,name,status,created_at,updated_at) VALUES
    (${companyA},'Finance R20 A','ACTIVE',NOW(),NOW()),
    (${companyB},'Finance R20 B','ACTIVE',NOW(),NOW())`);
  await db.execute(sql`INSERT INTO users(id,company_id,name,email,role,active,created_at,updated_at) VALUES
    (${adminA},${companyA},'Finance R20 Admin A','r20-a@example.test','ADMIN',true,NOW(),NOW()),
    (${adminB},${companyB},'Finance R20 Admin B','r20-b@example.test','ADMIN',true,NOW(),NOW())`);
  await db.execute(sql`INSERT INTO financial_categories(id,company_id,name,type,active,created_at,updated_at) VALUES
    ('r20-income-a',${companyA},'Income R20','INCOME',true,NOW(),NOW()),
    ('r20-expense-a',${companyA},'Expense R20','EXPENSE',true,NOW(),NOW()),
    ('r20-income-b',${companyB},'Income R20 B','INCOME',true,NOW(),NOW())`);

  for (const [id,status,paid,balance,cancelledAt,cancelReason,renegotiationId] of [
    ['r20-rec-manual','PENDING',0,100,null,null,null],
    ['r20-rec-empty','PENDING',0,100,null,null,null],
    ['r20-rec-partial','PARTIALLY_PAID',10,90,null,null,null],
    ['r20-rec-already','CANCELLED',0,100,'2026-08-01T10:00:00.000Z','Motivo original',null],
  ] as const) {
    await db.execute(sql`INSERT INTO account_receivables(
      id,company_id,origin_type,origin_id,category_id,description,original_amount,
      discount_amount,fine_amount,interest_amount,updated_amount,paid_amount,balance_amount,
      due_date,competence_date,status,idempotency_key,cancelled_at,cancel_reason,renegotiation_id,created_at,updated_at
    ) VALUES(
      ${id},${companyA},'MANUAL',${`origin-${id}`},'r20-income-a',${id},100,
      0,0,0,100,${paid},${balance},'2026-09-20','2026-08-22',${status},${`idem-${id}`},
      ${cancelledAt},${cancelReason},${renegotiationId},NOW(),NOW()
    )`);
  }

  for (const [id,status,paid,balance,cancelledAt,cancelReason,renegotiationId] of [
    ['r20-pay-manual','PENDING',0,100,null,null,null],
    ['r20-pay-paid','PAID',100,0,null,null,null],
    ['r20-pay-reneg','CANCELLED',0,100,'2026-08-02T10:00:00.000Z','Renegociado através do lote r20-reneg','r20-reneg'],
  ] as const) {
    await db.execute(sql`INSERT INTO account_payables(
      id,company_id,origin_type,origin_id,category_id,description,original_amount,
      discount_amount,fine_amount,interest_amount,updated_amount,paid_amount,balance_amount,
      due_date,competence_date,status,idempotency_key,cancelled_at,cancel_reason,renegotiation_id,created_at,updated_at
    ) VALUES(
      ${id},${companyA},'MANUAL',${`origin-${id}`},'r20-expense-a',${id},100,
      0,0,0,100,${paid},${balance},'2026-09-20','2026-08-22',${status},${`idem-${id}`},
      ${cancelledAt},${cancelReason},${renegotiationId},NOW(),NOW()
    )`);
  }

  await db.execute(sql`INSERT INTO account_receivables(
    id,company_id,origin_type,origin_id,category_id,description,original_amount,
    discount_amount,fine_amount,interest_amount,updated_amount,paid_amount,balance_amount,
    due_date,competence_date,status,idempotency_key,created_at,updated_at
  ) VALUES('r20-rec-foreign',${companyB},'MANUAL','origin-r20-foreign','r20-income-b','foreign',100,
    0,0,0,100,0,100,'2026-09-20','2026-08-22','PENDING','idem-r20-foreign',NOW(),NOW())`);
}

function cancelReceivable(id: string, reason: string, companyId = companyA, userId = adminA) {
  return UnitOfWork.run(companyId, (tx) => ReceivableService.cancelReceivable(
    companyId,id,reason,userId,userId === adminA ? 'Finance R20 Admin A' : 'Finance R20 Admin B',tx
  ));
}

function cancelPayable(id: string, reason: string) {
  return UnitOfWork.run(companyA, (tx) => PayableService.cancelPayable(
    companyA,id,reason,adminA,'Finance R20 Admin A',tx
  ));
}

async function run(): Promise<void> {
  await seed();

  const ar = await cancelReceivable('r20-rec-manual','  Cliente desistiu do acordo  ');
  assert(ar.status === 'CANCELLED', 'AR status must be CANCELLED');
  const arDb = await row(sql`SELECT status,cancelled_at,cancel_reason,updated_at FROM account_receivables WHERE company_id=${companyA} AND id='r20-rec-manual'`);
  assert(arDb.cancel_reason === 'Cliente desistiu do acordo', 'AR cancelReason must be exact trimmed reason');
  assert(Boolean(arDb.cancelled_at), 'AR cancelledAt must be persisted');
  assert(new Date(arDb.cancelled_at).getTime() === new Date(arDb.updated_at).getTime(), 'AR cancelledAt and updatedAt must share authoritative timestamp');
  const arAudit = await row(sql`SELECT new_state FROM audit_logs WHERE company_id=${companyA} AND entity_id='r20-rec-manual' AND action='CANCEL' ORDER BY timestamp DESC LIMIT 1`);
  const arAuditState = typeof arAudit?.new_state === 'string' ? JSON.parse(arAudit.new_state) : arAudit?.new_state;
  assert(arAuditState?.cancelReason === 'Cliente desistiu do acordo' && Boolean(arAuditState?.cancelledAt), 'AR audit must contain cancellation metadata');

  const ap = await cancelPayable('r20-pay-manual','  Fornecedor cancelou a cobrança  ');
  assert(ap.status === 'CANCELLED', 'AP status must be CANCELLED');
  const apDb = await row(sql`SELECT status,cancelled_at,cancel_reason,updated_at FROM account_payables WHERE company_id=${companyA} AND id='r20-pay-manual'`);
  assert(apDb.cancel_reason === 'Fornecedor cancelou a cobrança', 'AP cancelReason must be exact trimmed reason');
  assert(Boolean(apDb.cancelled_at), 'AP cancelledAt must be persisted');
  assert(new Date(apDb.cancelled_at).getTime() === new Date(apDb.updated_at).getTime(), 'AP cancelledAt and updatedAt must share authoritative timestamp');
  const apAudit = await row(sql`SELECT new_state FROM audit_logs WHERE company_id=${companyA} AND entity_id='r20-pay-manual' AND action='CANCEL' ORDER BY timestamp DESC LIMIT 1`);
  const apAuditState = typeof apAudit?.new_state === 'string' ? JSON.parse(apAudit.new_state) : apAudit?.new_state;
  assert(apAuditState?.cancelReason === 'Fornecedor cancelou a cobrança' && Boolean(apAuditState?.cancelledAt), 'AP audit must contain cancellation metadata');

  await rejects(() => cancelReceivable('r20-rec-empty','   '), 'Motivo de cancelamento');
  const emptyDb = await row(sql`SELECT status,cancelled_at,cancel_reason FROM account_receivables WHERE company_id=${companyA} AND id='r20-rec-empty'`);
  assert(emptyDb.status === 'PENDING' && !emptyDb.cancelled_at && !emptyDb.cancel_reason, 'blank reason must not mutate AR');

  await rejects(() => cancelReceivable('r20-rec-partial','Tentativa inválida'), 'Não é possível cancelar');
  const partialDb = await row(sql`SELECT status,paid_amount,cancelled_at,cancel_reason FROM account_receivables WHERE company_id=${companyA} AND id='r20-rec-partial'`);
  assert(partialDb.status === 'PARTIALLY_PAID' && Number(partialDb.paid_amount) === 10 && !partialDb.cancelled_at, 'partial AR must remain unchanged');

  await rejects(() => cancelPayable('r20-pay-paid','Tentativa inválida'), 'Não é possível cancelar');
  const paidDb = await row(sql`SELECT status,paid_amount,cancelled_at,cancel_reason FROM account_payables WHERE company_id=${companyA} AND id='r20-pay-paid'`);
  assert(paidDb.status === 'PAID' && Number(paidDb.paid_amount) === 100 && !paidDb.cancelled_at, 'paid AP must remain unchanged');

  await rejects(() => cancelReceivable('r20-rec-already','Novo motivo indevido'), 'já se encontra cancelado');
  const alreadyDb = await row(sql`SELECT cancelled_at,cancel_reason FROM account_receivables WHERE company_id=${companyA} AND id='r20-rec-already'`);
  assert(alreadyDb.cancel_reason === 'Motivo original', 'already-cancelled retry must preserve original reason');
  assert(new Date(alreadyDb.cancelled_at).toISOString() === '2026-08-01T10:00:00.000Z', 'already-cancelled retry must preserve original timestamp');

  await rejects(() => cancelReceivable('r20-rec-foreign','Motivo A'), 'não encontrada');
  const foreignDb = await row(sql`SELECT status,cancelled_at,cancel_reason FROM account_receivables WHERE company_id=${companyB} AND id='r20-rec-foreign'`);
  assert(foreignDb.status === 'PENDING' && !foreignDb.cancelled_at, 'cross-tenant cancellation must not mutate foreign AR');

  await rejects(() => cancelPayable('r20-pay-reneg','Sobrescrever motivo'), 'já se encontra cancelado');
  const renegDb = await row(sql`SELECT cancelled_at,cancel_reason,renegotiation_id FROM account_payables WHERE company_id=${companyA} AND id='r20-pay-reneg'`);
  assert(renegDb.cancel_reason === 'Renegociado através do lote r20-reneg' && renegDb.renegotiation_id === 'r20-reneg', 'renegotiation metadata must remain intact');
  assert(new Date(renegDb.cancelled_at).toISOString() === '2026-08-02T10:00:00.000Z', 'renegotiation timestamp must remain intact');

  console.log('FINANCE-R20 cancellation metadata PostgreSQL integration: PASS');
}

run().then(() => process.exit(0)).catch((error) => { console.error(error); process.exit(1); });
'''
Path("src/server/__tests__/financeCancellationMetadataIntegration.ts").write_text(test_source)
print("FINANCE-R20 scoped patch V2 applied")
