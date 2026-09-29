export type VehicleInspectionType='ENTRY'|'EXIT';
export type VehicleInspectionItemStatus='OK'|'ATTENTION'|'FAILED'|'NOT_APPLICABLE';
export type VehicleInspectionResult='APPROVED'|'APPROVED_WITH_RESERVATIONS'|'FAILED'|'BLOCKED_FOR_RENTAL';
export type VehicleInspectionTechnicalKey=
  'tires'|'glassMirrors'|'bodyPaint'|'interior'|'dashboard'|'lighting'|
  'brakes'|'suspension'|'steering'|'engine'|'transmission'|'safety';
export type VehicleInspectionTechnicalChecklist=Record<VehicleInspectionTechnicalKey,VehicleInspectionItemStatus>;
export interface VehicleInspectionEquipmentSnapshot{
  tireBrand:string;tireModel:string;tireMeasure:string;batteryBrand:string;batteryModel:string;
}

export interface VehicleInspectionChecklist{
  keyMain:boolean;keySpare:boolean;crlvPrinted:boolean;phoneHolder:boolean;jack:boolean;triangle:boolean;
  wheelWrench:boolean;spareTire:boolean;seatCover:boolean;ownerManual:boolean;floorMats:boolean;multimedia:boolean;
}
export interface VehicleInspection{
  id:string;companyId:string;vehicleId:string;driverId?:string;contractId?:string;
  inspectionType:VehicleInspectionType;inspectionDate:string;odometer:number;fuelLevel:number;
  checklist:VehicleInspectionChecklist;technicalChecklist?:VehicleInspectionTechnicalChecklist;equipmentSnapshot?:VehicleInspectionEquipmentSnapshot;result?:VehicleInspectionResult;
  notes?:string;createdBy:string;createdAt:string;updatedAt:string;
}
export interface VehicleInspectionCreateInput{
  inspectionType:VehicleInspectionType;odometer:number;fuelLevel:number;checklist:VehicleInspectionChecklist;
  technicalChecklist:VehicleInspectionTechnicalChecklist;equipmentSnapshot:VehicleInspectionEquipmentSnapshot;notes?:string;driverId?:string;contractId?:string;
}

function record(value:unknown):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid vehicle inspection payload');
  return value as Record<string,unknown>;
}
function validate(value:unknown):VehicleInspection{
  const item=record(value);
  if(
    typeof item.id!=='string'||typeof item.companyId!=='string'||typeof item.vehicleId!=='string'||
    (item.inspectionType!=='ENTRY'&&item.inspectionType!=='EXIT')||
    typeof item.inspectionDate!=='string'||!Number.isInteger(item.odometer)||!Number.isInteger(item.fuelLevel)||
    !item.checklist||typeof item.checklist!=='object'||Array.isArray(item.checklist)||
    typeof item.createdBy!=='string'||typeof item.createdAt!=='string'||typeof item.updatedAt!=='string'
  )throw new Error('Invalid vehicle inspection payload');
  return item as unknown as VehicleInspection;
}
async function fail(response:Response):Promise<Error>{
  let message=`Vehicle inspection request failed (${response.status})`;
  try{const p=record(await response.json());if(typeof p.error==='string')message=p.error;}catch{}
  return new Error(message);
}
export class VehicleInspectionClient{
  static async list(vehicleId:string):Promise<VehicleInspection[]>{
    const response=await fetch(`/api/fleet/vehicles/${encodeURIComponent(vehicleId)}/inspections`,{credentials:'include'});
    if(!response.ok)throw await fail(response);
    const payload=record(await response.json());
    if(!Array.isArray(payload.items))throw new Error('Invalid vehicle inspection list');
    return payload.items.map(validate);
  }
  static async create(vehicleId:string,input:VehicleInspectionCreateInput):Promise<VehicleInspection>{
    const response=await fetch(`/api/fleet/vehicles/${encodeURIComponent(vehicleId)}/inspections`,{
      method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify(input),
    });
    if(!response.ok)throw await fail(response);
    return validate(record(await response.json()).item);
  }
}
