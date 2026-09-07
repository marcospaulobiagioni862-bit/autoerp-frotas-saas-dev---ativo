export type KmReadingScheduleFrequency = 'WEEKLY' | 'MONTHLY';

export interface KmReadingScheduleRule {
  frequency: KmReadingScheduleFrequency;
  weekday?: number | null; // ISO weekday: Monday=1 ... Sunday=7
  dayOfMonth?: number | null; // 1..31; clamps to the month's last valid day
}

function parseDateOnly(value:string):Date {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Invalid KM schedule date');
  const date=new Date(`${value}T00:00:00Z`);
  if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value) throw new Error('Invalid KM schedule date');
  return date;
}

function dateOnly(value:Date):string { return value.toISOString().slice(0,10); }
function isoWeekday(value:Date):number { const day=value.getUTCDay(); return day===0?7:day; }
function daysInUtcMonth(year:number,monthZeroBased:number):number {
  return new Date(Date.UTC(year,monthZeroBased+1,0)).getUTCDate();
}

export function validateKmReadingScheduleRule(rule:KmReadingScheduleRule):void {
  if(rule.frequency==='WEEKLY'){
    if(!Number.isInteger(rule.weekday)||Number(rule.weekday)<1||Number(rule.weekday)>7||rule.dayOfMonth!==undefined&&rule.dayOfMonth!==null){
      throw new Error('Invalid weekly KM schedule');
    }
    return;
  }
  if(rule.frequency==='MONTHLY'){
    if(!Number.isInteger(rule.dayOfMonth)||Number(rule.dayOfMonth)<1||Number(rule.dayOfMonth)>31||rule.weekday!==undefined&&rule.weekday!==null){
      throw new Error('Invalid monthly KM schedule');
    }
    return;
  }
  throw new Error('Invalid KM schedule frequency');
}

export function calculateNextKmReadingDate(
  referenceDate:string,
  rule:KmReadingScheduleRule,
  includeReference:boolean,
):string {
  validateKmReadingScheduleRule(rule);
  const reference=parseDateOnly(referenceDate);

  if(rule.frequency==='WEEKLY'){
    const target=Number(rule.weekday);
    let delta=(target-isoWeekday(reference)+7)%7;
    if(delta===0&&!includeReference)delta=7;
    const next=new Date(reference.getTime());
    next.setUTCDate(next.getUTCDate()+delta);
    return dateOnly(next);
  }

  const targetDay=Number(rule.dayOfMonth);
  let year=reference.getUTCFullYear();
  let month=reference.getUTCMonth();
  const candidateFor=(y:number,m:number)=>{
    const day=Math.min(targetDay,daysInUtcMonth(y,m));
    return new Date(Date.UTC(y,m,day));
  };

  let candidate=candidateFor(year,month);
  if(candidate.getTime()<reference.getTime()||(!includeReference&&candidate.getTime()===reference.getTime())){
    month+=1;
    if(month>11){month=0;year+=1;}
    candidate=candidateFor(year,month);
  }
  return dateOnly(candidate);
}
