import type { TelemetryEventSummary } from '../../api/trackerClient';

export const TELEMETRY_EVENT_FILTERS=['ALL','PENDING','COMPLETED','ACCEPTED'] as const;
export type TelemetryEventFilter=(typeof TELEMETRY_EVENT_FILTERS)[number];
export type TelemetryEventCounts=Record<TelemetryEventFilter,number>;

const isPending=(event:TelemetryEventSummary):boolean=>event.status==='QUARANTINED'&&event.reviewStatus==='PENDING';
const isCompleted=(event:TelemetryEventSummary):boolean=>event.status==='QUARANTINED'&&(event.reviewStatus==='ACKNOWLEDGED'||event.reviewStatus==='DISMISSED');

export function createTelemetryEventCounts(events:readonly TelemetryEventSummary[]):TelemetryEventCounts{
  return events.reduce<TelemetryEventCounts>((counts,event)=>{
    counts.ALL+=1;
    if(isPending(event))counts.PENDING+=1;
    else if(isCompleted(event))counts.COMPLETED+=1;
    else if(event.status==='ACCEPTED')counts.ACCEPTED+=1;
    return counts;
  },{ALL:0,PENDING:0,COMPLETED:0,ACCEPTED:0});
}

export function filterTelemetryEvents(events:readonly TelemetryEventSummary[],filter:TelemetryEventFilter):TelemetryEventSummary[]{
  const filtered=filter==='ALL'?[...events]:filter==='PENDING'?events.filter(isPending):filter==='COMPLETED'?events.filter(isCompleted):events.filter(event=>event.status==='ACCEPTED');
  if(filter!=='PENDING')return filtered;
  return [...filtered].sort((left,right)=>Date.parse(left.receivedAt)-Date.parse(right.receivedAt)||left.id.localeCompare(right.id));
}
