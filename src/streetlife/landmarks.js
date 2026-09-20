/**
 * streetlife/landmarks.js
 *
 * Famous places, as opposed to the generic named parks and markets world.js
 * derives from the scene file. Every position here was read from
 * OpenStreetMap, not estimated — see docs/ONFOOT-PASS-2026-09-20.md for the
 * feature ids. Coordinates are scene metres (+X east, +Z south).
 *
 * Not included: the Bangladesh National Zoo (OSM node 13252006737, scene
 * -2024, 164) and the National Botanical Garden lie 840 m and 670 m past the
 * last road in scene-north.json, which is culled to a band around the metro
 * corridor. They need a wider map build before they can be visited.
 */

export const LANDMARKS = {
  north: [
    {
      key: 'benarasi-palli', name: 'Benarasi Palli', bn: 'বেনারসি পল্লী', x: 300, z: 299, radius: 110,
      blurb: 'Mirpur’s Benarasi saree market: lane after lane of silk and wedding sarees.',
    },
    {
      key: 'mirpur-10-footbridge', name: 'Mirpur 10 Foot Over Bridge', bn: 'মিরপুর ১০ ফুট ওভার ব্রিজ', x: 185, z: 736, radius: 38,
      blurb: 'The foot over bridge at Mirpur 10 circle, above one of the busiest junctions in the city.',
    },
    {
      key: 'sher-e-bangla-stadium', name: 'Sher-e-Bangla National Cricket Stadium', bn: 'শের-ই-বাংলা জাতীয় ক্রিকেট স্টেডিয়াম', x: -330, z: 761, radius: 170,
      blurb: 'The home of Bangladesh cricket. On match days the whole of Mirpur 2 stops.',
    },
    {
      key: 'indoor-stadium', name: 'Shaheed Suhrawardi Indoor Stadium', bn: 'শহীদ সোহরাওয়ার্দী ইনডোর স্টেডিয়াম', x: -48, z: 224, radius: 85,
      blurb: 'Mirpur’s indoor stadium, a short walk from the metro line.',
    },
    {
      key: 'mirpur-1-footbridge', name: 'Mirpur 1 Foot Over Bridge', bn: 'মিরপুর-১ ফুটওভার ব্রিজ', x: -1385, z: 1706, radius: 42,
      blurb: 'The foot over bridge across Darus Salam Road at Mirpur 1.',
    },
    {
      key: 'zoo-road', name: 'Zoo Road', bn: 'চিড়িয়াখানা সড়ক', x: -1554, z: 858, radius: 45,
      blurb: 'Follow this road west and it ends at the gate of the Bangladesh National Zoo, just beyond the mapped area.',
    },
  ],
};
