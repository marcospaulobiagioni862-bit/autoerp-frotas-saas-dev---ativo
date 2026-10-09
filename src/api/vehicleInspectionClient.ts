export type VehicleInspectionType='ENTRY'|'EXIT';
export type VehicleInspectionItemStatus='OK'|'ATTENTION'|'FAILED'|'NOT_APPLICABLE';
export type VehicleInspectionResult='APPROVED'|'APPROVED_WITH_RESERVATIONS'|'FAILED'|'BLOCKED_FOR_RENTAL';
export type VehicleInspectionTechnicalKey=
  'tires'|'glassMirrors'|'bodyPaint'|'interior'|'dashboard'|'lighting'|
  'brakes'|'suspension'|'steering'|'engine'|'transmission'|'safety';
export type VehicleInspectionTechnicalChecklist=Record<VehicleInspectionTechnicalKey,VehicleInspectionItemStatus>;

export interface VehicleInspectionEquipmentSnapshot{
  tireBrand:string;tireModel:string;tireMeasure:string;batteryBrand:string;batteryModel:string;
  frontRightTireBrand?:string;frontLeftTireBrand?:string;rearRightTireBrand?:string;rearLeftTireBrand?:string;spareTireBrand?:string;
}

export interface VehicleInspectionChecklist{
  keyMain:boolean;keySpare:boolean;crlvPrinted:boolean;phoneHolder:boolean;jack:boolean;triangle:boolean;
  wheelWrench:boolean;spareTire:boolean;seatCover:boolean;ownerManual:boolean;floorMats:boolean;multimedia:boolean;
}

export type InspectionPhotoSlotKey='DASHBOARD'|'FRONT'|'REAR'|'RIGHT'|'LEFT'|'SPARE_TIRE';

export interface InspectionPhotoSlot{
  slot:InspectionPhotoSlotKey;
  label:string;
  url?:string;
  storageKey?:string;
  timestamp?:string;
  lat?:number;
  lng?:number;
}

export interface InspectionDamageItem{
  id:string;
  part:string;
  description:string;
  severity:'LOW'|'MEDIUM'|'HIGH';
  photoUrl?:string;
  estimatedCost?:number;
  isPreExisting?:boolean;
  x?:number; // Coordenada X relativa (0 a 100%) no diagrama da carroceria
  y?:number; // Coordenada Y relativa (0 a 100%) no diagrama da carroceria
}

export type InspectionWashType='NONE'|'STANDARD'|'HEAVY'|'ODOR_SMOKE';

export interface InspectionSettlement{
  excessKm:number;
  excessKmCost:number;
  fuelDeltaPercent:number;
  fuelDeltaLiters:number;
  fuelDeltaCost:number;
  damagesCost:number;
  washType:InspectionWashType;
  washCost:number;
  missingAccessoriesCost:number;
  totalDeviations:number;
  securityDepositAvailable:number;
  securityDepositDeducted:number;
  remainingDepositRefund:number;
  receivableAmount:number;
  receivableId?:string;
  status:'SETTLED'|'PENDING_QUOTE'|'DISPUTED';
  disputeReason?:string;
}

export interface VehicleInspection{
  id:string;companyId:string;vehicleId:string;driverId?:string;contractId?:string;
  inspectionType:VehicleInspectionType;inspectionDate:string;odometer:number;fuelLevel:number;
  checklist:VehicleInspectionChecklist;technicalChecklist?:VehicleInspectionTechnicalChecklist;equipmentSnapshot?:VehicleInspectionEquipmentSnapshot;result?:VehicleInspectionResult;
  notes?:string;createdBy:string;createdAt:string;updatedAt:string;
  // Campos operacionais e evidências do Passo 5
  photos?:InspectionPhotoSlot[];
  damages?:InspectionDamageItem[];
  settlement?:InspectionSettlement;
  signedAt?:string;
  driverSignatureUrl?:string;
  signatureRefused?:boolean;
  signatureRefusalReason?:string;
  isRemoteDropoff?:boolean;
  washType?:InspectionWashType;
  washCost?:number;
  insuranceClaimRequired?:boolean;
  policeReportUrl?:string;
  geolocation?:{lat:number;lng:number;accuracy?:number};
}

export interface VehicleInspectionCreateInput{
  inspectionType:VehicleInspectionType;odometer:number;fuelLevel:number;checklist:VehicleInspectionChecklist;
  technicalChecklist:VehicleInspectionTechnicalChecklist;equipmentSnapshot:VehicleInspectionEquipmentSnapshot;notes?:string;driverId?:string;contractId?:string;
  photos?:InspectionPhotoSlot[];
  damages?:InspectionDamageItem[];
  settlement?:Partial<InspectionSettlement>;
  signedAt?:string;
  driverSignatureUrl?:string;
  signatureRefused?:boolean;
  signatureRefusalReason?:string;
  isRemoteDropoff?:boolean;
  washType?:InspectionWashType;
  washCost?:number;
  insuranceClaimRequired?:boolean;
  policeReportUrl?:string;
  geolocation?:{lat:number;lng:number;accuracy?:number};
}

export interface InspectionComparisonPair{
  contractId:string;
  vehicle:{id:string;plate:string;model:string;brand:string;currentKm:number};
  driver:{id:string;name:string;cpf:string;phone?:string};
  exitInspection?:VehicleInspection;
  entryInspection?:VehicleInspection;
  deltaKm:number;
  excessKm:number;
  excessKmRate:number;
  excessKmCost:number;
  deltaFuel:number;
  fuelCost:number;
  preExistingDamages:InspectionDamageItem[];
  newDamages:InspectionDamageItem[];
  photoPairs:Array<{slot:InspectionPhotoSlotKey;label:string;exitPhotoUrl?:string;entryPhotoUrl?:string}>;
  settlement?:InspectionSettlement;
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
  if(item.equipmentSnapshot!==undefined){
    const equipment=record(item.equipmentSnapshot);
    for(const key of ['tireBrand','tireModel','tireMeasure','batteryBrand','batteryModel'] as const){
      if(typeof equipment[key]!=='string'||!String(equipment[key]).trim())throw new Error('Invalid vehicle inspection equipment snapshot');
    }
  }
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

  static async getComparison(contractId:string):Promise<InspectionComparisonPair>{
    const response=await fetch(`/api/fleet/contracts/${encodeURIComponent(contractId)}/inspection-comparison`,{credentials:'include'});
    if(!response.ok)throw await fail(response);
    return (await response.json()) as InspectionComparisonPair;
  }

  static async settle(inspectionId:string,settlement:Partial<InspectionSettlement>):Promise<{success:boolean;settlement:InspectionSettlement}>{
    const response=await fetch(`/api/fleet/inspections/${encodeURIComponent(inspectionId)}/settlement`,{
      method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({settlement}),
    });
    if(!response.ok)throw await fail(response);
    return (await response.json()) as {success:boolean;settlement:InspectionSettlement};
  }
}
