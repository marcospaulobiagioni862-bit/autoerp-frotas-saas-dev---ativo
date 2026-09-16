import { OriginType } from '../types/enums';

export function manualPayableOrigin(requestedOrigin: unknown): OriginType.MANUAL {
  if (requestedOrigin !== OriginType.MANUAL) {
    throw new Error('Origem operacional não autorizada nesta rota');
  }
  return OriginType.MANUAL;
}
