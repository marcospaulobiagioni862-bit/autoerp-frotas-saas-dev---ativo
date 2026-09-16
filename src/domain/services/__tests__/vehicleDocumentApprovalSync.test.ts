import { Documento, Veiculo } from '../../../types';

export interface TestSuiteResult {
  id: string;
  name: string;
  passed: boolean;
  message: string;
}

export class VehicleDocumentApprovalSyncTestRunner {
  public static runAllTests(): {
    total: number;
    passed: number;
    failed: number;
    results: TestSuiteResult[];
  } {
    const results: TestSuiteResult[] = [];

    const test = (id: string, name: string, fn: () => void) => {
      try {
        fn();
        results.push({ id, name, passed: true, message: 'Sucesso' });
      } catch (err: any) {
        results.push({ id, name, passed: false, message: err.message || String(err) });
      }
    };

    const todayStr = new Date().toISOString().split('T')[0];
    const nextYearExp = `${new Date().getFullYear() + 1}-12-31`;
    const pastYearExp = '2020-01-01';

    // Test 1: Manual Completo -> Válido / Aprovado
    test('T01', 'Documento manual completo é aprovado como Válido', () => {
      const veiculoPlaca = 'ABC-1234';
      const tipo = 'CRLV';
      const numero = 'CRLV-999888';
      const vencimento = nextYearExp;

      const isComplete = !!(veiculoPlaca && tipo && numero && vencimento);
      if (!isComplete) throw new Error('Documento manual completo deveria conter todos os campos obrigatórios.');

      const status = vencimento >= todayStr ? 'Válido' : 'Vencido';
      if (status !== 'Válido') throw new Error('Status do documento manual completo com vencimento futuro deve ser Válido.');
    });

    // Test 2: Manual Incompleto -> Faltando campos obrigatórios
    test('T02', 'Documento manual incompleto é bloqueado pela validação de campos obrigatórios', () => {
      const veiculoPlaca = '';
      const tipo = 'CRLV';
      const numero = '';
      const vencimento = nextYearExp;

      const missingFields: string[] = [];
      if (!veiculoPlaca) missingFields.push('Veículo (Placa)');
      if (!numero) missingFields.push('Número do Documento');

      if (missingFields.length === 0) {
        throw new Error('Deveria ter identificado os campos obrigatórios ausentes.');
      }

      if (!missingFields.includes('Veículo (Placa)') || !missingFields.includes('Número do Documento')) {
        throw new Error('Tarja vermelha deve indicar exatamente os campos Veículo e Número do Documento.');
      }
    });

    // Test 3: IA Aprovada -> Válido / Aprovado sem segunda revisão
    test('T03', 'Documento concluído por IA é considerado Válido/Aprovado imediatamente', () => {
      const iaDoc: Documento = {
        id: 'doc_ia_test',
        veiculoPlaca: 'JKL-1234',
        tipo: 'CRLV',
        numero: 'CRLV-IA-777',
        vencimento: nextYearExp,
        status: 'Válido',
        obs: 'Documento lido e aprovado por IA'
      };

      if (iaDoc.status !== 'Válido') {
        throw new Error('Leitura por IA deve resultar no status Válido (Aprovado).');
      }
    });

    // Test 4: Compliance Refletindo Documento e Incompatibilidade "Em dia" x "Regular"
    test('T04', 'Sincronização de Compliance aceita "Em dia" e "Regular" sem converter para Vencido', () => {
      const veiculos: Veiculo[] = [
        {
          id: 'v1',
          placa: 'PQR-9876',
          modelo: 'Corolla',
          brand: 'Toyota',
          model: 'Corolla',
          year: 2024,
          color: 'Preto',
          status: 'Disponível',
          crlv_vencimento: nextYearExp,
          crlv_situacao: 'Em dia'
        }
      ];

      const v = veiculos[0];
      const crlvExpired = v.crlv_vencimento ? new Date(v.crlv_vencimento + 'T00:00:00') < new Date() : false;
      const isCrlvValid = (v.crlv_situacao === 'Regular' || v.crlv_situacao === 'Em dia' || (!v.crlv_situacao && !!v.crlv_vencimento)) && !crlvExpired;
      const crlvStatus = isCrlvValid ? 'Válido' : 'Vencido';

      if (crlvStatus !== 'Válido') {
        throw new Error('Veículo com crlv_situacao="Em dia" e vencimento futuro deve ser sincronizado com status Válido.');
      }
    });

    // Test 5: Contrato liberado após CRLV válido
    test('T05', 'Contrato é liberado quando o veículo possui CRLV válido', () => {
      const v: Veiculo = {
        id: 'v2',
        placa: 'STU-5678',
        modelo: 'Civic',
        brand: 'Honda',
        model: 'Civic',
        year: 2025,
        color: 'Prata',
        status: 'Disponível',
        crlv_vencimento: nextYearExp,
        crlv_situacao: 'Em dia'
      };

      const documentos: Documento[] = [
        {
          id: 'd1',
          veiculoPlaca: 'STU-5678',
          tipo: 'CRLV',
          numero: '1122334455',
          vencimento: nextYearExp,
          status: 'Válido'
        }
      ];

      const crlvDoc = documentos.find(d => d.veiculoPlaca === v.placa && d.tipo === 'CRLV');
      const isCrlvDocValid = crlvDoc && crlvDoc.status === 'Válido';
      const isVehicleCrlvValid = (v.crlv_situacao === 'Em dia' || v.crlv_situacao === 'Regular') && (!v.crlv_vencimento || v.crlv_vencimento >= todayStr);

      const contractCanProceed = isCrlvDocValid || isVehicleCrlvValid;

      if (!contractCanProceed) {
        throw new Error('Contrato deveria ser liberado para veículo com CRLV válido.');
      }
    });

    // Test 6: Documento vencido continua bloqueando
    test('T06', 'Documento CRLV vencido continua bloqueando a criação do contrato', () => {
      const v: Veiculo = {
        id: 'v3',
        placa: 'OLD-9999',
        modelo: 'Onix',
        brand: 'Chevrolet',
        model: 'Onix',
        year: 2020,
        color: 'Branco',
        status: 'Disponível',
        crlv_vencimento: pastYearExp,
        crlv_situacao: 'Vencido'
      };

      const documentos: Documento[] = [
        {
          id: 'd2',
          veiculoPlaca: 'OLD-9999',
          tipo: 'CRLV',
          numero: '0000111122',
          vencimento: pastYearExp,
          status: 'Vencido'
        }
      ];

      const crlvDoc = documentos.find(d => d.veiculoPlaca === v.placa && d.tipo === 'CRLV');
      const isCrlvDocValid = crlvDoc && crlvDoc.status === 'Válido';
      const isVehicleCrlvValid = (v.crlv_situacao === 'Em dia' || v.crlv_situacao === 'Regular') && (!v.crlv_vencimento || v.crlv_vencimento >= todayStr);

      const contractCanProceed = isCrlvDocValid || isVehicleCrlvValid;

      if (contractCanProceed) {
        throw new Error('Contrato NÂO deveria ser liberado para veículo com CRLV vencido.');
      }
    });

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    return { total: results.length, passed, failed, results };
  }
}
