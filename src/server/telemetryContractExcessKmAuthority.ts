import { sql } from 'drizzle-orm';
import { UnitOfWork } from '../db/uow';
import { TelemetryKmDivergenceAuthority } from './telemetryKmDivergenceAuthority';

export type TelemetryContractExcessKmState='UNAVAILABLE'|'WITHIN_LIMIT'|'NEAR_LIMIT'|'EXCEEDED';

export interface TelemetryContractExcessKmSummary {
  trackerId:string;
  vehicleId:string;
  contractId:string|null;
  contractNumber:string|null;
  referenceKm:number|null;
  telemetryOdometerKm:number|null;
  franchiseKm:number|null;
  telemetryTravelledKm:number|null;
  telemetryRemainingKm:number|null;
  telemetryExcessKm:number|null;
  nearLimitThresholdKm:number;
  state:TelemetryContractExcessKmState;
}

export const TELEMETRY_CONTRACT_NEAR_LIMIT_KM=100;

function rows(result:any):any[]{return Array.isArray(result?.rows)?result.rows:[];}
function km(value:unknown,label:string):number{
  const parsed=Number(value);
  if(!Number.isFinite(parsed)||parsed<0||parsed>9_999_999)throw new Error(`Invalid ${label}`);
  return Math.round(parsed*1000)/1000;
}
function rounded(value:number):number{return Math.round(value*1000)/1000;}

export function deriveTelemetryContractExcessKm(
  referenceKm:number|null,
  telemetryOdometerKm:number|null,
  franchiseKm:number|null,
  nearLimitThresholdKm=TELEMETRY_CONTRACT_NEAR_LIMIT_KM,
):Pick<TelemetryContractExcessKmSummary,'referenceKm'|'telemetryOdometerKm'|'franchiseKm'|'telemetryTravelledKm'|'telemetryRemainingKm'|'telemetryExcessKm'|'nearLimitThresholdKm'|'state'>{
  if(!Number.isFinite(nearLimitThresholdKm)||nearLimitThresholdKm<0)throw new Error('Invalid telemetry contract near-limit threshold');
  const threshold=rounded(nearLimitThresholdKm);
  const reference=referenceKm===null?null:km(referenceKm,'contract reference KM');
  const telemetry=telemetryOdometerKm===null?null:km(telemetryOdometerKm,'telemetry odometer');
  const franchise=franchiseKm===null?null:km(franchiseKm,'contract franchise KM');
  if(reference===null||telemetry===null||franchise===null||franchise<=0||telemetry<reference){
    return{referenceKm:reference,telemetryOdometerKm:telemetry,franchiseKm:franchise,telemetryTravelledKm:null,telemetryRemainingKm:null,telemetryExcessKm:null,nearLimitThresholdKm:threshold,state:'UNAVAILABLE'};
  }
  const travelled=rounded(telemetry-reference);
  const remaining=rounded(franchise-travelled);
  const excess=rounded(Math.max(0,travelled-franchise));
  const state:TelemetryContractExcessKmState=excess>0?'EXCEEDED':remaining<=threshold?'NEAR_LIMIT':'WITHIN_LIMIT';
  return{referenceKm:reference,telemetryOdometerKm:telemetry,franchiseKm:franchise,telemetryTravelledKm:travelled,telemetryRemainingKm:remaining,telemetryExcessKm:excess,nearLimitThresholdKm:threshold,state};
}

export class TelemetryContractExcessKmAuthority {
  static async get(companyId:string,trackerId:string):Promise<TelemetryContractExcessKmSummary>{
    const divergence=await TelemetryKmDivergenceAuthority.get(companyId,trackerId);
    return await UnitOfWork.run(companyId,async tx=>{
      const contract=await tx.getContractRepo().findActiveByVehicle(companyId,divergence.vehicleId);
      if(!contract){
        return{trackerId:divergence.trackerId,vehicleId:divergence.vehicleId,contractId:null,contractNumber:null,...deriveTelemetryContractExcessKm(null,divergence.telemetryOdometerKm,null)};
      }
      const raw=tx.getRawTransaction?.();
      if(!raw)throw new Error('Contract KM persistence unavailable');
      const referenceRow=rows(await raw.execute(sql`
        SELECT km_value
        FROM vehicle_km_records
        WHERE company_id=${companyId}
          AND vehicle_id=${divergence.vehicleId}
          AND contract_id=${contract.id}
        ORDER BY record_date ASC,created_at ASC,id ASC
        LIMIT 1
      `))[0];
      const referenceKm=referenceRow?.km_value===null||referenceRow?.km_value===undefined?null:km(referenceRow.km_value,'persisted contract reference KM');
      return{
        trackerId:divergence.trackerId,
        vehicleId:divergence.vehicleId,
        contractId:contract.id,
        contractNumber:contract.contractNumber||null,
        ...deriveTelemetryContractExcessKm(referenceKm,divergence.telemetryOdometerKm,contract.franchiseKm),
      };
    });
  }
}
