import { sql } from 'drizzle-orm';

export interface VehicleIdentityConflict {
  id:string;
  plate:string;
  renavam:string;
  chassis:string;
  brand:string;
  model:string;
  isArchived:boolean;
  status:string;
  plateMatch:boolean;
  renavamMatch:boolean;
  chassisMatch:boolean;
}

export function normalizeVehicleIdentity(value:unknown):string {
  return value === undefined || value === null
    ? ''
    : String(value).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function rows(result:any):any[]{return Array.isArray(result?.rows)?result.rows:[];}

export async function findVehicleIdentityConflict(
  context:any,
  companyId:string,
  plate:string,
  renavam:string,
  chassis:string = '',
  excludeVehicleId?:string,
):Promise<VehicleIdentityConflict|null>{
  const tx=context.getRawTransaction?.();
  if(!tx)throw new Error('Vehicle identity authority unavailable');
  const normalizedPlate=normalizeVehicleIdentity(plate);
  const normalizedRenavam=normalizeVehicleIdentity(renavam);
  const normalizedChassis=normalizeVehicleIdentity(chassis);
  if(!normalizedPlate&&!normalizedRenavam&&!normalizedChassis)return null;
  const row=rows(await tx.execute(sql`
    SELECT id,plate,renavam,chassis,brand,model,is_archived,status
    FROM vehicles
    WHERE company_id=${companyId}
      AND (${excludeVehicleId || null}::text IS NULL OR id<>${excludeVehicleId || null})
      AND (
        (${normalizedPlate}<>'' AND regexp_replace(upper(trim(coalesce(plate,''))), '[^A-Z0-9]', '', 'g')=${normalizedPlate})
        OR (${normalizedRenavam}<>'' AND regexp_replace(upper(trim(coalesce(renavam,''))), '[^A-Z0-9]', '', 'g')=${normalizedRenavam})
        OR (${normalizedChassis}<>'' AND regexp_replace(upper(trim(coalesce(chassis,''))), '[^A-Z0-9]', '', 'g')=${normalizedChassis})
      )
    ORDER BY
      CASE WHEN is_archived OR status IN ('SOLD','ARCHIVED') THEN 1 ELSE 0 END,
      created_at,id
    LIMIT 1
  `))[0];
  if(!row)return null;
  const storedPlate=normalizeVehicleIdentity(row.plate);
  const storedRenavam=normalizeVehicleIdentity(row.renavam);
  const storedChassis=normalizeVehicleIdentity(row.chassis);
  return{
    id:String(row.id),
    plate:String(row.plate),
    renavam:String(row.renavam),
    chassis:String(row.chassis||''),
    brand:String(row.brand||''),
    model:String(row.model||''),
    isArchived:Boolean(row.is_archived),
    status:String(row.status||''),
    plateMatch:Boolean(normalizedPlate)&&storedPlate===normalizedPlate,
    renavamMatch:Boolean(normalizedRenavam)&&storedRenavam===normalizedRenavam,
    chassisMatch:Boolean(normalizedChassis)&&storedChassis===normalizedChassis,
  };
}

export function vehicleIdentityConflictMessage(conflict:VehicleIdentityConflict):string {
  const matches=[
    conflict.plateMatch ? `placa ${normalizeVehicleIdentity(conflict.plate)}` : '',
    conflict.renavamMatch ? `RENAVAM ${normalizeVehicleIdentity(conflict.renavam)}` : '',
    conflict.chassisMatch ? `chassi ${normalizeVehicleIdentity(conflict.chassis)}` : '',
  ].filter(Boolean).join(' e ');
  const terminal=conflict.isArchived||conflict.status==='SOLD'||conflict.status==='ARCHIVED'?' (registro histórico/arquivado)':'';
  return `Este veículo já possui cadastro no sistema: ${matches}. Cadastro existente ${normalizeVehicleIdentity(conflict.plate)} — ${conflict.brand} ${conflict.model}${terminal}.`;
}
