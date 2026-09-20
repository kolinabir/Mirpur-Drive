# Metro repair — 19 September 2026

Implemented shared route data for platform signs, boarding and the station HUD. Mirpur 10 offers Mirpur 11 or the Agargaon district connection; Mirpur 11 offers Pallabi or Mirpur 10. Agargaon returns to Mirpur 10. End-of-service trains cannot board passengers for the fleet's off-map wrap.

Boarding now requires platform height and an actual open coach doorway. Screen doors aggregate berth state per platform. Coach movement accepts touch input and recalculates curved-car transforms after movement. Reverse trains use the correct interior door side. Same-station exit works; terminal arrivals alight automatically. Teleport cancels the ride cleanly.

Lifts offer explicit floors, animate the car/player together, hold movement during travel, and return passengers to a supported landing. Concourse walls leave the lift opening clear. Platform requires a ticket. Gates open visibly, permit exit without a ticket, and retain each station's collision/light state. Escalators check the rider's height and resolve conveyor movement against walls.

HUD uses compact monochrome controls, corner navigation, location text and contextual transit directions. Debug counters are hidden. Mobile touch remains automatic.

## Verification

- Production build passes; existing Three.js chunk-size warning remains.
- Modified JavaScript syntax checks and git diff whitespace checks pass.
- `npm run lint` and `npm run typecheck` attempted: scripts do not exist.
- Browser: Mirpur 10 directions visible; E opens Agargaon connection; Ride reloads with district=bijoy&arrive=Agargaon; arrival platform shows Bijoy Sarani and Mirpur 10 routes.
- Browser: positioned at Agargaon concourse lift through the existing coordinate-arrival URL, used E, selected Street, and reopened the menu at street level; selected Concourse to return. Platform button correctly disabled without a ticket.
- Browser: Mirpur 11 shows Mirpur 10 / Pallabi. At 390×844 with touch controls selected, station directions, map, joystick and action buttons remain clear of one another. No captured runtime errors. This is viewport verification, not physical-phone acceptance.
- Whole physical train journeys, all station entrances/escalators and physical-phone multitouch remain manual acceptance checks. No automated tests added.

## Manual acceptance

1. Refresh; start at Mirpur 10. On the platform check Agargaon versus Mirpur 11. Press E on the Agargaon side and Ride; confirm Agargaon arrival.
2. Travel to Mirpur 11; check Pallabi versus Mirpur 10. Wait beside a train doorway until open, board with E/Interact, walk inside, and exit through an open door. Try exiting at the boarding stop and a later stop.
3. Enter from street using stairs/escalator. Buy a ticket, open a gate, reach either platform, then return downstairs. Walk under an escalator at street level; it must not push you.
4. Use the lift: Street → Concourse, buy a ticket, Concourse → Platform → Concourse → Street. Try movement during travel and confirm the camera stays with the car.
5. On a phone, repeat boarding, joystick movement inside the coach, and Interact to exit. Check portrait and landscape HUD clearance.
