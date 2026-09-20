import { DISTRICTS } from './districts.js';

export function getPlatformRoute(metro, stationName, side, gateway = null) {
  const order = metro.stationOrder;
  const index = order.indexOf(stationName);
  const destination = index < 0 ? null : order[index + Math.sign(side)];
  if (destination) return { destination, gateway: false, available: true };
  const connection = gateway ?? Object.values(DISTRICTS).find((district) => district.gateway?.station === stationName)?.gateway;
  if (index >= 0 && connection?.station === stationName) {
    return { destination: connection.arrive ?? connection.label, gateway: true, available: true };
  }
  return { destination: 'End of service', gateway: false, available: false };
}
