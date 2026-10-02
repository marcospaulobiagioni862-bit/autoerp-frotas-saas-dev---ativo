import assert from 'node:assert/strict';
import { ReceivableService } from '../ReceivableService';
import { PayableService } from '../PayableService';
import { DREService } from '../DREService';
import { AccountingRegime, OriginType, ObligationStatus } from '../../../types/enums';
import type { ITransactionContext } from '../ITransactionContext';
import { installmentCompetences } from '../../../shared/utils/installmentCompetence';

assert.deepEqual(installmentCompetences({ competenceMode: 'PER_INSTALLMENT', competenceDate: '2026-01-31' }, ['2026-01-31','2026-03-03','2026-03-31']), ['2026-01-31','2026-02-28','2026-03-31']);
assert.throws(() => installmentCompetences({ competenceMode: 'PER_INSTALLMENT', installmentCompetenceDates: ['2026-02-30'] }, ['2026-02-28']));
assert.throws(() => installmentCompetences({ competenceMode: 'SINGLE_EVENT', installmentCompetenceDates: ['2026-09-01'] }, ['2026-09-01']));

function context(closed = false) {
  const records: any[] = [], audits: any[] = [];
  const repo = { findByIdempotencyKey: async (key: string) => records.find(item => item.idempotencyKey === key) || null, create: async (item: any) => { records.push(item); return item; } };
  return { records, audits, tx: {
    getPayableRepo: () => repo, getReceivableRepo: () => repo,
    getUserRepo: () => ({ findById: async () => ({ id: 'u', companyId: 'c', active: true, role: 'ADMIN' }) }),
    getFinancialPeriodRepo: () => ({ findAll: async () => closed ? [{ companyId:'c', status:'CLOSED', startDate:'2026-10-01',endDate:'2026-10-31' }] : [] }),
    getAuditLogRepo: () => ({ create: async (item: any) => { audits.push(item); return item; } }),
  } as unknown as ITransactionContext };
}
const base = { companyId:'c',originType:OriginType.ADMINISTRATIVE,originId:'fixture',categoryId:'cat',description:'Operação parcelada',totalAmount:100,dueDate:'2026-09-15',competenceDate:'2026-09-10',installmentsCount:3,userId:'u',userName:'Tester' };
for (const service of [PayableService, ReceivableService]) {
  const single = context();
  const shared = await service.create({ ...base, competenceMode:'SINGLE_EVENT' }, single.tx);
  assert.deepEqual(shared.map(item => item.competenceDate), ['2026-09-10','2026-09-10','2026-09-10']);
  assert.equal(Math.round(shared.reduce((sum,item) => sum + item.originalAmount,0)*100),10000);
  assert.deepEqual(shared.map(item => item.originalAmount), [33.33,33.33,33.34]);
  assert.equal((await service.create({ ...base, competenceMode:'SINGLE_EVENT' }, single.tx)).length,3);
  assert.equal(single.records.length,3,'retry must reuse titles');
  const monthly = context();
  assert.deepEqual((await service.create({ ...base, competenceMode:'PER_INSTALLMENT' },monthly.tx)).map(item => item.competenceDate), ['2026-09-10','2026-10-10','2026-11-10']);
  const custom = context();
  assert.deepEqual((await service.create({ ...base, competenceMode:'PER_INSTALLMENT',installmentCompetenceDates:['2026-09-01','2026-11-01','2026-12-20'] }, custom.tx)).map(item=>item.competenceDate), ['2026-09-01','2026-11-01','2026-12-20']);
  const closed = context(true);
  await assert.rejects(service.create({ ...base, competenceMode:'PER_INSTALLMENT' }, closed.tx), /fechado/i);
  assert.equal(closed.records.length,0,'whole schedule must validate before creating the first title');
  const legacy = context();
  assert.deepEqual((await service.create(base,legacy.tx)).map(item => item.competenceDate), ['2026-09-10','2026-09-10','2026-09-10']);
}

const contractSchedule = context();
(contractSchedule.tx as any).getContractRepo = () => ({findByIdForCompanyWithLock:async()=>({id:'contract',startDate:'2026-09-01',endDate:'2026-10-31',createdAt:'2026-09-01'})});
await assert.rejects(ReceivableService.create({...base,originType:OriginType.CONTRACT_RENT,contractId:'contract',competenceMode:'PER_INSTALLMENT'},contractSchedule.tx),/contratual/);
assert.equal(contractSchedule.records.length,0,'every explicit competence must be within the contract');

const title = { companyId:'c', status:ObligationStatus.PENDING, competenceDate:'2026-09-10', dueDate:'2027-01-10', description:'Título', originalAmount:100, discountAmount:0, fineAmount:0, interestAmount:0, additionalAmount:0, originType:OriginType.MANUAL };
const cats = [
  {id:'parts',companyId:'c',name:'Nome sem informação contábil',dreGroup:'MAINTENANCE'},
  {id:'misleading',companyId:'c',name:'Multas de trânsito'},
  {id:'payroll',companyId:'c',name:'Outro nome',dreGroup:'PAYROLL'},
  {id:'deposit',companyId:'c',name:'Garantia contratual',dreGroup:'SECURITY_DEPOSIT'},
];
function reportContext(recs:any[],pays:any[],categories:any[]=cats):ITransactionContext {
  return { getReceivableRepo:()=>({findAll:async()=>recs}), getPayableRepo:()=>({findAll:async()=>pays}),getFinancialCategories:async()=>categories } as unknown as ITransactionContext;
}
const rent = {...title,id:'rent',interestAmount:350,categoryId:'rent'};
const part = {...title,id:'part',interestAmount:5.05,categoryId:'parts'};
const september = await DREService.getDREReport('c','2026-09-01','2026-09-30',AccountingRegime.ACCRUAL,reportContext([rent],[part]));
assert.equal(september.financialResult.amount,344.95);
assert.equal(september.breakdown?.maintenanceCosts,100);
const adjusted = await DREService.getDREReport('c','2026-09-01','2026-09-30',AccountingRegime.ACCRUAL,reportContext(
  [{...rent,additionalAmount:10.25}, {...rent,id:'future',competenceDate:'2026-10-01'}, {...rent,id:'cancel',status:ObligationStatus.CANCELLED}],
  [{...part,additionalAmount:2.20},{...title,id:'name',categoryId:'misleading'},{...title,id:'payroll',categoryId:'payroll'},{...title,id:'deposit',categoryId:'deposit',interestAmount:999}]
));
assert.equal(adjusted.financialResult.amount,353);
assert.equal(adjusted.breakdown?.trafficTicketCosts,0,'name must never infer DRE classification');
assert.equal(adjusted.breakdown?.otherCosts,100);
assert.equal(adjusted.directCosts.amount,200);
assert.equal(adjusted.operatingExpenses.amount,100);
assert.equal(adjusted.grossRevenue.amount,100);
assert.equal(adjusted.netProfit,153);
console.log('V2 competence, atomic preflight, replay, cent rounding and structured DRE: PASS');
