import { ProblemManagementService } from './ProblemManagementService';

export async function runProblemManagementServiceTests(): Promise<{ passed: boolean; logs: string[] }> {
  const logs: string[] = [];
  let passed = true;

  const testCompany = 'company-test-prob-353';
  const userId = 'usr-sre-lead';

  logs.push('--- INICIANDO TESTES DO PROBLEM MANAGEMENT SERVICE (FASE 3.53) ---');

  try {
    // 1. Create Problem Record
    const createRes = await ProblemManagementService.createProblem({
      companyId: testCompany,
      title: 'Vazamento recorrente de conexões de banco de dados',
      description: 'Conexões não liberadas em requisições concorrentes',
      priority: 'P1',
      ownerId: userId,
      relatedIncidentIds: ['inc-101', 'inc-102'],
    });

    if (createRes.success && createRes.problem) {
      logs.push(`[OK] Problem Record criado com sucesso: ID ${createRes.problem.id}`);
    } else {
      logs.push(`[FAIL] Falha ao criar Problem Record: ${createRes.message}`);
      passed = false;
    }

    const problemId = createRes.problem?.id || '';

    // 2. Attempt Status Update to ROOT_CAUSE_IDENTIFIED without root cause (Must Fail)
    const failUpdate = await ProblemManagementService.updateProblemStatus({
      problemId,
      companyId: testCompany,
      status: 'ROOT_CAUSE_IDENTIFIED',
      userId,
    });

    if (!failUpdate.success) {
      logs.push('[OK] Bloqueou transição sem causa raiz declarada');
    } else {
      logs.push('[FAIL] Permitiu transição sem causa raiz');
      passed = false;
    }

    // 3. Update Status with Root Cause
    const successUpdate = await ProblemManagementService.updateProblemStatus({
      problemId,
      companyId: testCompany,
      status: 'ROOT_CAUSE_IDENTIFIED',
      userId,
      rootCause: 'Falta de bloco finally na lib de conexão HTTP',
      contributingFactors: ['Pool size insuficiente'],
      workaround: 'Aumentar temporariamente o limite de conexões',
    });

    if (successUpdate.success && successUpdate.problem?.status === 'ROOT_CAUSE_IDENTIFIED') {
      logs.push('[OK] Transição com causa raiz aprovada');
    } else {
      logs.push(`[FAIL] Falha na atualização do Problem Record: ${successUpdate.message}`);
      passed = false;
    }

    // 4. Resolve Problem Record
    const resolveRes = await ProblemManagementService.updateProblemStatus({
      problemId,
      companyId: testCompany,
      status: 'RESOLVED',
      userId,
      permanentSolution: 'Atualização da biblioteca para v2.4 com autoflush',
    });

    if (resolveRes.success && resolveRes.problem?.status === 'RESOLVED') {
      logs.push('[OK] Problem Record resolvido com solução permanente');
    } else {
      logs.push('[FAIL] Resolução de Problem Record falhou');
      passed = false;
    }

    // 5. Cross tenant check
    const crossCheck = await ProblemManagementService.getProblemById(problemId, 'other-company');
    if (!crossCheck) {
      logs.push('[OK] Isolamento multi-tenant de Problem Records verificado');
    } else {
      logs.push('[FAIL] Falha no isolamento multi-tenant de Problem Records');
      passed = false;
    }

  } catch (err: any) {
    logs.push(`[EXCEPTION] Erro ao executar testes de Problem Management: ${err.message}`);
    passed = false;
  }

  return { passed, logs };
}
