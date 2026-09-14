import { resolveMaintenanceRule, type MaintenanceAlertRule } from '../maintenanceRuleAuthority';

function assert(condition:unknown,message:string):asserts condition{if(!condition)throw new Error(message);}

const base={companyId:'c1',warningKm:1000,urgentKm:500,warningDays:15,urgentDays:7,toleranceKm:0,toleranceDays:0,active:true,effectiveFrom:'2026-09-01',configured:true} as const;
const rule=(scopeType:MaintenanceAlertRule['scopeType'],scopeKey?:string,warningKm=1000):MaintenanceAlertRule=>({...base,scopeType,scopeKey,warningKm});

export function runMaintenanceRuleResolutionChecks():void{
  const rules=[
    rule('GLOBAL',undefined,1000),
    rule('CATEGORY','SUV',1200),
    rule('MODEL','CRETA',1400),
    rule('MAINTENANCE_TYPE','OIL',1600),
    rule('VEHICLE','v1',1800),
  ];
  const vehicle=resolveMaintenanceRule(rules,{vehicleId:'v1',maintenanceType:'OIL',model:'CRETA',category:'SUV'});
  assert(vehicle?.scopeType==='VEHICLE'&&vehicle.warningKm===1800,'vehicle rule must have highest precedence');
  const maintenanceType=resolveMaintenanceRule(rules,{vehicleId:'v2',maintenanceType:'oil',model:'CRETA',category:'SUV'});
  assert(maintenanceType?.scopeType==='MAINTENANCE_TYPE'&&maintenanceType.warningKm===1600,'maintenance type rule must precede model');
  const model=resolveMaintenanceRule(rules,{vehicleId:'v2',maintenanceType:'BRAKES',model:'creta',category:'SUV'});
  assert(model?.scopeType==='MODEL'&&model.warningKm===1400,'model rule must precede category');
  const category=resolveMaintenanceRule(rules,{vehicleId:'v2',maintenanceType:'BRAKES',model:'HB20',category:'suv'});
  assert(category?.scopeType==='CATEGORY'&&category.warningKm===1200,'category rule must precede global');
  const global=resolveMaintenanceRule(rules,{vehicleId:'v2',maintenanceType:'BRAKES',model:'HB20',category:'SEDAN'});
  assert(global?.scopeType==='GLOBAL'&&global.warningKm===1000,'global rule must be fallback');
  const none=resolveMaintenanceRule([],{vehicleId:'v2',maintenanceType:'BRAKES'});
  assert(none===undefined,'missing rules must preserve internal projection defaults');
}
