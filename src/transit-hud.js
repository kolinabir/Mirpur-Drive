import { METRO } from './metro.js';
import { getPlatformRoute } from './metro-routes.js';
import './hud.css';

export function createTransitHud(metro, player, stationlife) {
  const panel = document.createElement('div');
  panel.id = 'transit-status';
  document.getElementById('hud').append(panel);
  let previous = '';
  return () => {
    const station = metro.stations.find((item) => Math.hypot(item.x - player.position.x, item.z - player.position.z) < 95);
    const riding = stationlife.state.riding;
    let content = '';
    if (riding) content = `MRT LINE 6\nNext stop · ${stationlife.state.nextStopName || 'Arriving'}\nWait for the doors to open to exit`;
    else if (station && player.feetY > 1) {
      const platform = Math.abs(player.feetY - METRO.PLATFORM_Y) < 1;
      const dx = player.position.x - station.x;
      const dz = player.position.z - station.z;
      const side = Math.cos(station.heading) * dx - Math.sin(station.heading) * dz < 0 ? -1 : 1;
      const routes = [-1, 1].map((direction) => {
        const route = getPlatformRoute(metro, station.name, direction);
        return `${platform && side === direction ? '▸ ' : ''}${direction < 0 ? '1' : '2'}  ${route.destination}${route.gateway ? ' · connection' : ''}`;
      });
      content = `${station.name.toUpperCase()}\n${platform ? 'Platform' : 'Concourse · tickets & exits'}\n${routes.join('\n')}`;
    }
    if (content !== previous) { panel.textContent = content; previous = content; }
    panel.hidden = !content;
  };
}
