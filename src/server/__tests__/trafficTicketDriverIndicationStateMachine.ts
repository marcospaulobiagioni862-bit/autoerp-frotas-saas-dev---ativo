import { TrafficTicketDriverIndicationStatus as S } from '../../types/enums';
import { canTransitionTrafficTicketDriverIndication } from '../trafficTicketDriverIndicationAuthority';

function assert(condition:unknown,message:string):asserts condition{if(!condition)throw new Error(message);}

const happyPath:[S,S][]=[
  [S.PENDING,S.COMMUNICATED],
  [S.COMMUNICATED,S.DOCUMENTS_SENT],
  [S.DOCUMENTS_SENT,S.SIGNED],
  [S.SIGNED,S.INDICATED],
  [S.INDICATED,S.COMPLETED],
];
for(const [from,to] of happyPath)assert(canTransitionTrafficTicketDriverIndication(from,to),`expected ${from} -> ${to}`);

assert(canTransitionTrafficTicketDriverIndication(S.PENDING,S.APPEAL),'pending must allow appeal');
assert(canTransitionTrafficTicketDriverIndication(S.COMMUNICATED,S.CANCELLED),'active workflow must allow cancellation');
assert(canTransitionTrafficTicketDriverIndication(S.SIGNED,S.SIGNED),'same-state update must be idempotent');
assert(!canTransitionTrafficTicketDriverIndication(S.PENDING,S.INDICATED),'workflow must not skip directly to indicated');
assert(!canTransitionTrafficTicketDriverIndication(S.COMPLETED,S.PENDING),'completed indication must not reopen implicitly');
assert(!canTransitionTrafficTicketDriverIndication(S.CANCELLED,S.COMMUNICATED),'cancelled indication must remain terminal');

console.log('Traffic ticket driver indication state machine: PASS');
