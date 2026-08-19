import { DocumentStatus } from '../../../types/enums';
import { alertStageForDays, evaluateDocumentCompliance } from '../documentPolicy';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export class DocumentPolicyTestRunner {
  static runAllTests(): void {
    const boundaries: Array<[number, string]> = [
      [-1, 'POST_DUE'],
      [0, 'DUE_TODAY'],
      [1, 'D7'],
      [7, 'D7'],
      [8, 'D15'],
      [15, 'D15'],
      [16, 'D30'],
      [30, 'D30'],
      [31, 'D60'],
      [60, 'D60'],
      [61, 'D90'],
      [90, 'D90'],
      [91, 'NONE'],
    ];
    for (const [days, expected] of boundaries) {
      assert(alertStageForDays(days) === expected, `alert boundary ${days} expected ${expected}`);
    }

    const now = new Date('2026-08-19T12:00:00Z');
    const noAttachment = evaluateDocumentCompliance('2026-12-31', false, now);
    assert(noAttachment.complianceStatus === DocumentStatus.PENDING, 'missing attachment must be PENDING');

    const expired = evaluateDocumentCompliance('2026-08-18', true, now);
    assert(expired.complianceStatus === DocumentStatus.EXPIRED && expired.alertStage === 'POST_DUE', 'expired status');

    const dueToday = evaluateDocumentCompliance('2026-08-19', true, now);
    assert(dueToday.complianceStatus === DocumentStatus.EXPIRING_SOON && dueToday.alertStage === 'DUE_TODAY', 'due today status');

    const expiring = evaluateDocumentCompliance('2026-09-18', true, now);
    assert(expiring.complianceStatus === DocumentStatus.EXPIRING_SOON && expiring.alertStage === 'D30', '30-day status');

    const valid = evaluateDocumentCompliance('2026-11-18', true, now);
    assert(valid.complianceStatus === DocumentStatus.VALID && valid.alertStage === 'NONE', '91-day valid status');
  }
}

if (process.argv[1]?.includes('documentPolicyTestRunner')) {
  try {
    DocumentPolicyTestRunner.runAllTests();
    console.log('Document policy PASS');
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
