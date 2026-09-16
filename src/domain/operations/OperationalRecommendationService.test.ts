// Unit tests for OperationalRecommendationService (Phase 3.58)

import { OperationalRecommendationService } from './OperationalRecommendationService';

export class OperationalRecommendationTestRunner {
  public static runTests(): { total: number; passed: number; failed: number; errors: string[] } {
    let passed = 0;
    let failed = 0;
    const errors: string[] = [];

    // Test 1: Generate recommendations
    try {
      const companyId = 'company-test-rec-uuid';
      const mockKPIs: any = {
        openTasks: 5,
        completedTasks: 10,
        blockedTasks: 2,
        backlogCount: 7,
        overdueActivitiesCount: 1,
        todayActivitiesCount: 3,

        slaCompliancePercent: 80,
        slaAtRiskCount: 2,
        slaBreachedCount: 1,
        avgCompletionTimeHours: 4,

        activeUsersCount: 3,
        availableUsersCount: 2,
        overloadedUsersCount: 1,
        avgProductivityPercent: 85,

        totalVehicles: 10,
        availableVehiclesCount: 4,
        rentedVehiclesCount: 4,
        maintenanceVehiclesCount: 2,
        unavailableVehiclesCount: 2,
        fleetUtilizationPercent: 40,
        vehiclesWithIssuesCount: 4,

        activeContractsCount: 4,
        expiringContractsCount: 1,
        contractsWithIssuesCount: 0,
        contractsWithIncidentsCount: 0,

        activeIncidentsCount: 1,
        criticalIncidentsCount: 1,
        recurringIncidentsCount: 0,
        mttrMinutes: 30,
        mttdMinutes: 5,
      };

      const recs = OperationalRecommendationService.generateRecommendations(companyId, mockKPIs, [], []);
      if (Array.isArray(recs) && recs.length > 0) {
        passed++;
      } else {
        failed++;
        errors.push('Expected recommendations array');
      }
    } catch (e: any) {
      failed++;
      errors.push(`Test 1 threw error: ${e.message}`);
    }

    return { total: passed + failed, passed, failed, errors };
  }
}
