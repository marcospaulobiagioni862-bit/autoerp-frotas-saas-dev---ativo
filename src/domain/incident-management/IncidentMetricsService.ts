import { SREMetrics, ProductionIncident } from './types';
import { IncidentManagementService } from './IncidentManagementService';

export class IncidentMetricsService {
  /**
   * Computes comprehensive SRE and Incident metrics for a company safely (0/NaN protection).
   */
  public static async calculateMetrics(companyId: string): Promise<SREMetrics> {
    if (!companyId) {
      return this.getEmptyMetrics();
    }

    const incidents: ProductionIncident[] = await IncidentManagementService.getIncidents(companyId);

    if (incidents.length === 0) {
      return this.getEmptyMetrics();
    }

    let totalMttdMs = 0;
    let mttdCount = 0;

    let totalMttaMs = 0;
    let mttaCount = 0;

    let totalMttrMs = 0;
    let mttrCount = 0;

    let reopenedCount = 0;
    let escalatedCount = 0;
    let slaBreachedCount = 0;

    let p0Count = 0;
    let p1Count = 0;
    let p2Count = 0;
    let p3Count = 0;

    let sev0Count = 0;
    let sev1Count = 0;
    let sev2Count = 0;
    let sev3Count = 0;
    let sev4Count = 0;

    let majorIncidentsCount = 0;

    for (const inc of incidents) {
      if (inc.priority === 'P0') p0Count++;
      if (inc.priority === 'P1') p1Count++;
      if (inc.priority === 'P2') p2Count++;
      if (inc.priority === 'P3') p3Count++;

      if (inc.severity === 'SEV0') { sev0Count++; majorIncidentsCount++; }
      if (inc.severity === 'SEV1') { sev1Count++; majorIncidentsCount++; }
      if (inc.severity === 'SEV2') { sev2Count++; majorIncidentsCount++; }
      if (inc.severity === 'SEV3') sev3Count++;
      if (inc.severity === 'SEV4') sev4Count++;

      // MTTD
      const created = new Date(inc.createdAt).getTime();
      const detected = new Date(inc.detectedAt).getTime();
      if (!isNaN(created) && !isNaN(detected) && detected >= created) {
        totalMttdMs += (detected - created);
        mttdCount++;
      }

      // MTTA
      if (inc.acknowledgedAt) {
        const ack = new Date(inc.acknowledgedAt).getTime();
        if (!isNaN(ack) && ack >= detected) {
          totalMttaMs += (ack - detected);
          mttaCount++;
        }
      }

      // MTTR
      if (inc.resolvedAt) {
        const res = new Date(inc.resolvedAt).getTime();
        if (!isNaN(res) && res >= detected) {
          totalMttrMs += (res - detected);
          mttrCount++;
        }
      }

      if (inc.status === 'REOPENED') {
        reopenedCount++;
      }
      if (inc.status === 'ESCALATED') {
        escalatedCount++;
      }

      if (inc.slaStatus === 'BREACHED') {
        slaBreachedCount++;
      }
    }

    const totalIncidents = incidents.length;
    const activeIncidents = incidents.filter(
      (i) => i.status !== 'CLOSED' && i.status !== 'RESOLVED' && i.status !== 'CANCELLED'
    ).length;
    const resolvedIncidents = incidents.filter(
      (i) => i.status === 'RESOLVED' || i.status === 'CLOSED'
    ).length;

    // Safe mathematical calculations
    const mttdMinutes = mttdCount > 0 ? Math.round((totalMttdMs / mttdCount) / 60000) : 0;
    const mttaMinutes = mttaCount > 0 ? Math.round((totalMttaMs / mttaCount) / 60000) : 0;
    const mttrMinutes = mttrCount > 0 ? Math.round((totalMttrMs / mttrCount) / 60000) : 0;

    // MTBF Calculation: Operational hours (e.g. 720 hours/month) divided by major incidents
    const operationalHours = 720;
    const mtbfHours = majorIncidentsCount > 0 ? Math.round(operationalHours / majorIncidentsCount) : operationalHours;

    const reopenRate = totalIncidents > 0 ? Number(((reopenedCount / totalIncidents) * 100).toFixed(1)) : 0;
    const escalationRate = totalIncidents > 0 ? Number(((escalatedCount / totalIncidents) * 100).toFixed(1)) : 0;
    const slaComplianceRate = totalIncidents > 0 ? Number((((totalIncidents - slaBreachedCount) / totalIncidents) * 100).toFixed(1)) : 100;

    return {
      mttdMinutes,
      mttaMinutes,
      mttrMinutes,
      mtbfHours,
      incidentRate: totalIncidents,
      reopenRate,
      escalationRate,
      slaComplianceRate,
      totalIncidents,
      activeIncidents,
      resolvedIncidents,
      p0Count,
      p1Count,
      p2Count,
      p3Count,
      sev0Count,
      sev1Count,
      sev2Count,
      sev3Count,
      sev4Count,
    };
  }

  private static getEmptyMetrics(): SREMetrics {
    return {
      mttdMinutes: 0,
      mttaMinutes: 0,
      mttrMinutes: 0,
      mtbfHours: 720,
      incidentRate: 0,
      reopenRate: 0,
      escalationRate: 0,
      slaComplianceRate: 100,
      totalIncidents: 0,
      activeIncidents: 0,
      resolvedIncidents: 0,
      p0Count: 0,
      p1Count: 0,
      p2Count: 0,
      p3Count: 0,
      sev0Count: 0,
      sev1Count: 0,
      sev2Count: 0,
      sev3Count: 0,
      sev4Count: 0,
    };
  }
}
