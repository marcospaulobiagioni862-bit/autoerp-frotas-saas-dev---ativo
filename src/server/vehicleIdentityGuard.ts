import { sql } from 'drizzle-orm';

export interface VehicleIdentityConflict {
  id:string;
  plate:string;
  renavam:string;
  brand:string;
  model:string;
  isArchived:boolean;
  status:string;
  plateMatch:boolean;
  renavamMatch:boolean;
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
  excludeVehicleId?:string,
):Promise<VehicleIdentityConflict|null>{
  const tx=context.getRawTransaction?.();
  if(!tx)throw new Error('Vehicle identity authority unavailable');
  const normalizedPlate=normalizeVehicleIdentity(plate);
  const normalizedRenavam=normalizeVehicleIdentity(renavam);
  const row=rows(await tx.execute(sql`
    SELECT id,plate,renavam,brand,model,is_archived,status
    FROM vehicles
    WHERE company_id=${companyId}
      AND (${excludeVehicleId || null}::text IS NULL OR id<>${excludeVehicleId || null})
      AND (
        upper(regexp_replace(trim(coalesce(plate,'')), '[^A-Z0-9]', '', 'g'))=${normalizedPlate}
        OR upper(regexp_replace(trim(coalesce(renavam,'')), '[^A-Z0-9]', '', 'g'))=${normalizedRenavam}
      )
    ORDER BY created_at,id
    LIMIT 1
  `))[0];
  if(!row)return null;
  const storedPlate=normalizeVehicleIdentity(row.plate);
  const storedRenavam=normalizeVehicleIdentity(row.renavam);
  return{
    id:String(row.id),
    plate:String(row.plate),
    renavam:String(row.renavam),
    brand:String(row.brand||''),
    model:String(row.model||''),
    isArchived:Boolean(row.is_archived),
    status:String(row.status||''),
    plateMatch:storedPlate===normalizedPlate,
    renavamMatch:storedRenavam===normalizedRenavam,
  };
}

export function vehicleIdentityConflictMessage(conflict:VehicleIdentityConflict):string {
  const matches=[
    conflict.plateMatch ? `Placa ${normalizeVehicleIdentity(conflict.plate)}` : '',
    conflict.renavamMatch ? `RENAVAM ${normalizeVehicleIdentity(conflict.renavam)}` : '',
  ].filter(Boolean).join(' e ');
  const terminal=conflict.isArchived||conflict.status==='SOLD'||conflict.status==='ARCHIVED'?' (registro histórico/arquivado)':'';
  return `Este veículo já possui cadastro no sistema: ${matches}. Cadastro existente ${normalizeVehicleIdentity(conflict.plate)} — ${conflict.brand} ${conflict.model}${terminal}.`;
}
