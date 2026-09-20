// Hand-written content for the static pages tools/build-site-pages.mjs emits.
//
// Rules for anything added here (docs/SEO.md):
//  - every place page must say something only true of THAT place: what it is
//    in the real city, what exactly is modelled in the game, how to reach it.
//    No page is a template with the name swapped.
//  - real-world facts are limited to ones that are well established; when
//    unsure, leave it out rather than guess.
//  - `near` lists sibling slugs, so every page links to its neighbours and no
//    page is an orphan.

export const SITE = {
  url: 'https://mirpurdrive.recalfy.com',
  name: 'Mirpur Drive',
  repo: 'https://github.com/kolinabir/Mirpur-Drive',
  author: 'Abir Kolin',
  authorUrl: 'https://github.com/kolinabir',
  tagline: 'Walk, drive and ride the metro through a 3D Mirpur, Dhaka — free, in your browser.',
};

/**
 * id -> the teleport catalogue entry in src/districts.js the deep link uses.
 * district: 'north' | 'bijoy' picks which map the game boots.
 */
export const PLACES = [
  {
    slug: 'mirpur-10-metro-station',
    id: 'st-mirpur10',
    kind: 'station',
    title: 'Mirpur 10 Metro Station',
    bn: 'মিরপুর ১০ মেট্রো স্টেশন',
    img: 'mirpur-10',
    imgAlt: 'Street-level approach to Mirpur 10 metro station under the MRT Line 6 viaduct in Mirpur Drive',
    summary: 'The elevated MRT Line 6 station above Mirpur 10 circle, modelled with walkable entrances, concourse, ticket gates and platforms.',
    real: [
      'Mirpur 10 is one of the busiest stops on MRT Line 6, Dhaka\'s first metro line. The station sits directly above the Mirpur 10 golchokkor (roundabout) on Begum Rokeya Avenue, the junction where the roads to Mirpur 1, Mirpur 14, Pallabi and Agargaon meet.',
      'Like every Line 6 station it is fully elevated: street-level entrance buildings on the footpaths lead up by stairs, escalators and lifts to a concourse level with ticket machines and fare gates, and from there up again to two side platforms with platform screen doors.',
    ],
    game: [
      'This is the most detailed station in the game. You can walk in from the street, climb the stairs or take the escalator or lift, cross the concourse, pass the gates and stand on the platform while trains arrive, open their doors at the screen-door bays and leave.',
      'Press E at the platform edge to board. The train interior is modelled too, and the ride continues through Mirpur 11 and Pallabi to Uttara South, or south across the unmodelled Kazipara–Shewrapara gap to Agargaon, Bijoy Sarani and Farmgate.',
    ],
    how: 'Press 5 for a direct jump, or O and choose Mirpur 10 Station. Press 3 when nearby to land straight on the platform deck.',
    near: ['mirpur-10-golchokkor', 'mirpur-10-foot-over-bridge', 'benarasi-palli', 'sher-e-bangla-cricket-stadium', 'mirpur-11-metro-station'],
  },
  {
    slug: 'mirpur-11-metro-station',
    id: 'st-mirpur11',
    kind: 'station',
    title: 'Mirpur 11 Metro Station',
    bn: 'মিরপুর ১১ মেট্রো স্টেশন',
    img: 'mirpur-11',
    imgAlt: 'MRT Line 6 viaduct, piers and Mirpur 11 station seen from the road in Mirpur Drive',
    summary: 'Mirpur 11 station and the long straight of Begum Rokeya Avenue beneath the viaduct — the best stretch in the game for driving.',
    real: [
      'Mirpur 11 is the MRT Line 6 stop between Pallabi and Mirpur 10, on Begum Rokeya Avenue. The avenue here is a dense commercial strip: multi-storey buildings with shops at street level, banks and clinics above, and the metro viaduct running down the median.',
    ],
    game: [
      'The station has the same walkable interior as Mirpur 10, reached from entrances on both footpaths. South of it the road runs almost dead straight for several hundred metres under the viaduct, with the tapered concrete piers and precast girder segments overhead, which makes it the natural place to open the car up.',
      'Building footprints along this stretch come from OpenStreetMap and their heights from Google\'s Open Buildings dataset, so the street wall rises and falls the way the real one does instead of at a uniform height.',
    ],
    how: 'Press 2 for a direct jump, or O and choose Mirpur 11 Station. Press V to get in the car.',
    near: ['mirpur-10-metro-station', 'pallabi-metro-station', 'mirpur-10-golchokkor'],
  },
  {
    slug: 'pallabi-metro-station',
    id: 'st-pallabi',
    kind: 'station',
    title: 'Pallabi Metro Station',
    bn: 'পল্লবী মেট্রো স্টেশন',
    img: 'pallabi',
    imgAlt: 'Looking down Begum Rokeya Avenue at Pallabi with the metro viaduct overhead in Mirpur Drive',
    summary: 'Where every new game starts: Pallabi station and the Mirpur 12 shopping frontage, rebuilt sign by sign.',
    real: [
      'Pallabi is the MRT Line 6 station serving Pallabi and Mirpur 12 in north Mirpur, next to the Mirpur 12 bus stand. North of here the line leaves the dense city and runs on towards the Uttara stations and the depot.',
    ],
    game: [
      'Pallabi is the spawn point. The street around it is the most closely observed in the game: the building massing on the frontage, the colour grammar of the shop signs (pharmacy green, mobile-banking pink, telecom orange) and the density of each kind of shop follow what is actually mapped and photographed there.',
      'From the spawn you can walk into the station, hail a rickshaw, CNG or bus with E, stop at a cha stall, or take the car south towards Mirpur 11 and Mirpur 10.',
    ],
    how: 'You start here. Press 1 to come back at any time, or O and choose Pallabi Station.',
    near: ['pallabi-mirpur-12-street', 'mirpur-11-metro-station', 'uttara-south-metro-station'],
  },
  {
    slug: 'uttara-south-metro-station',
    id: 'st-uttara-south',
    kind: 'station',
    title: 'Uttara South Metro Station',
    bn: 'উত্তরা দক্ষিণ মেট্রো স্টেশন',
    img: 'uttara-south',
    imgAlt: 'Uttara South station on the MRT Line 6 viaduct with open ground around it in Mirpur Drive',
    summary: 'The northern end of the playable map, where the city thins out and the viaduct crosses open land.',
    real: [
      'Uttara South is the next MRT Line 6 station north of Pallabi. Unlike the Mirpur stops it stands in the newer, planned Uttara extension, so the surroundings are far more open: wide roads, empty plots and a big sky rather than a continuous street wall.',
    ],
    game: [
      'It is the northern limit of the north map, a little over two kilometres up the line from Pallabi. The run between the two is the longest uninterrupted stretch of viaduct in the game and the clearest place to see its structure: tapered piers, segmental girders, parapets and the conductor rail.',
      'It is also the best demonstration of the streaming world: buildings load in tiles around you as you travel, and the map here is visibly sparser because the real place is.',
    ],
    how: 'Press 6 for a direct jump, or ride the metro north from Pallabi and get off at the last stop.',
    near: ['pallabi-metro-station', 'pallabi-mirpur-12-street'],
  },
  {
    slug: 'agargaon-metro-station',
    id: 'st-agargaon',
    kind: 'station',
    title: 'Agargaon Metro Station',
    bn: 'আগারগাঁও মেট্রো স্টেশন',
    img: 'agargaon',
    imgAlt: 'Agargaon station and the MRT Line 6 viaduct in the Bijoy Sarani district of Mirpur Drive',
    summary: 'The first station of the second district, among the wide roads and government offices of Agargaon.',
    real: [
      'Agargaon was the southern terminus when MRT Line 6 first opened to passengers at the end of 2022, running from Uttara North to here before the line was extended to Motijheel. The area is Dhaka\'s administrative quarter: broad roads lined with government offices and institutions rather than shops.',
    ],
    game: [
      'Agargaon is the northern station of the game\'s second district, a separate map covering Agargaon, Bijoy Sarani and Farmgate. The character changes completely from Mirpur: wider carriageways, bigger setbacks and far fewer shopfronts.',
      'Travelling between districts is done the way the real city does it. Choose a destination in the other district from the teleport menu and the game puts you on a through train rather than cutting instantly.',
    ],
    how: 'Press O and choose Agargaon Station, or ride the metro south from Mirpur 10.',
    near: ['bijoy-sarani-metro-station', 'farmgate-metro-station', 'jatiya-sangsad-bhaban'],
  },
  {
    slug: 'bijoy-sarani-metro-station',
    id: 'st-bijoy-sarani',
    kind: 'station',
    title: 'Bijoy Sarani Metro Station',
    bn: 'বিজয় সরণি মেট্রো স্টেশন',
    img: 'bijoy-sarani',
    imgAlt: 'Bijoy Sarani station with open parade-ground space beside the MRT Line 6 viaduct in Mirpur Drive',
    summary: 'The station for Parliament: Bijoy Sarani, beside the open ground north of Jatiya Sangsad Bhaban.',
    real: [
      'Bijoy Sarani station stands on the avenue of the same name, between Agargaon and Farmgate. It is the closest metro stop to the National Parliament complex at Sher-e-Bangla Nagar, and the surroundings are unusually open for central Dhaka, with large grounds on either side of the road.',
    ],
    game: [
      'This is the primary station of the second district and where you arrive if you take a through train from Mirpur. The open ground beside it is modelled as open ground, which gives long views that the Mirpur streets never allow, including across to the Parliament building.',
    ],
    how: 'Press O and choose Bijoy Sarani Station. From here press 7 to jump to the Parliament viewpoint.',
    near: ['jatiya-sangsad-bhaban', 'manik-mia-avenue', 'agargaon-metro-station', 'farmgate-metro-station'],
  },
  {
    slug: 'farmgate-metro-station',
    id: 'st-farmgate',
    kind: 'station',
    title: 'Farmgate Metro Station',
    bn: 'ফার্মগেট মেট্রো স্টেশন',
    img: 'farmgate',
    imgAlt: 'Farmgate station on the MRT Line 6 viaduct with mid-rise buildings around it in Mirpur Drive',
    summary: 'The southern edge of the game world, where the metro corridor meets central Dhaka.',
    real: [
      'Farmgate is one of central Dhaka\'s great interchanges, a junction of bus routes, footbridges, coaching centres and markets. The MRT Line 6 station here came with the extension of the line south from Agargaon towards Motijheel.',
    ],
    game: [
      'Farmgate is the southernmost station that is modelled. South of it the line continues in reality to Karwan Bazar, Shahbagh, Dhaka University, the Secretariat and Motijheel, which the platform signage in the game lists, but the playable map ends here.',
      'The street wall returns after the openness of Bijoy Sarani, so it is a good place to compare how differently the same procedural facade system reads in a denser setting.',
    ],
    how: 'Press O and choose Farmgate Station, or stay on the southbound train to the end of the line.',
    near: ['bijoy-sarani-metro-station', 'manik-mia-avenue', 'agargaon-metro-station'],
  },
  {
    slug: 'mirpur-10-golchokkor',
    id: 'lm-mirpur10-circle',
    kind: 'landmark',
    title: 'Mirpur 10 Golchokkor',
    bn: 'মিরপুর ১০ গোলচত্বর',
    img: 'golchokkor',
    imgAlt: 'Brick station entrance buildings under the metro concourse at Mirpur 10 golchokkor in Mirpur Drive',
    summary: 'The roundabout at the heart of Mirpur, under the station, where four roads and a footbridge meet.',
    real: [
      'Golchokkor means roundabout, and Mirpur 10\'s is the reference point for the whole area: addresses, bus routes and directions are given relative to it. Begum Rokeya Avenue runs north–south through it and the roads to Mirpur 1/2 and Mirpur 14/Kachukhet cross it east–west, with the metro station directly overhead.',
    ],
    game: [
      'At street level you stand beneath the station concourse, between the red-brick entrance buildings with their sloped roofs and bilingual station signs. The west arm towards Mirpur 2 and the east arm towards Kachukhet are both drivable, which makes this the one true crossroads on the north map.',
      'It is also where the game is busiest, and the spot used as the performance yardstick during development: if the frame rate holds here in daylight with traffic, it holds everywhere.',
    ],
    how: 'Press O and choose Mirpur 10 Golchokkor.',
    near: ['mirpur-10-metro-station', 'mirpur-10-foot-over-bridge', 'benarasi-palli', 'sher-e-bangla-cricket-stadium'],
  },
  {
    slug: 'mirpur-10-foot-over-bridge',
    id: 'lm-mirpur10-fob',
    kind: 'landmark',
    title: 'Mirpur 10 Foot Over Bridge',
    bn: 'মিরপুর ১০ ফুট ওভার ব্রিজ',
    img: 'footbridge',
    imgAlt: 'Walking across the red steel Mirpur 10 foot over bridge beneath the metro viaduct in Mirpur Drive',
    summary: 'The four-armed red steel footbridge over Mirpur 10 circle, walkable end to end beneath the viaduct.',
    real: [
      'Pedestrians cross Mirpur 10 circle on a large foot over bridge whose arms reach each corner of the junction, passing under the metro viaduct. It is one of the most recognisable structures in Mirpur and, for many people, the view they associate with the place.',
    ],
    game: [
      'The bridge is modelled from photographs as a real walkable structure rather than scenery: stairs at each corner, red steel railings and trusses, a yellow centre line on the deck, and the viaduct passing close overhead. The teleport drops you on the deck itself, about five and a half metres above the road.',
      'From up here you get the clearest look at the underside of the station and the traffic circulating below.',
    ],
    how: 'Press O and choose Mirpur 10 Foot Over Bridge; you land on the deck.',
    near: ['mirpur-10-golchokkor', 'mirpur-10-metro-station', 'benarasi-palli'],
  },
  {
    slug: 'sher-e-bangla-cricket-stadium',
    id: 'lm-stadium',
    kind: 'landmark',
    title: 'Sher-e-Bangla National Cricket Stadium',
    bn: 'শের-ই-বাংলা জাতীয় ক্রিকেট স্টেডিয়াম',
    img: 'stadium',
    imgAlt: 'Aerial view of Sher-e-Bangla National Cricket Stadium among the buildings of Mirpur in Mirpur Drive',
    summary: 'The home of Bangladesh cricket, modelled as a full bowl with stands, floodlight towers and a pitch you can walk onto.',
    real: [
      'Sher-e-Bangla National Cricket Stadium in Mirpur is the home ground of the Bangladesh national cricket team and the headquarters of the Bangladesh Cricket Board. It seats roughly 25,000 and has hosted matches at the 2011 Cricket World Cup and the final of the 2014 ICC World Twenty20.',
    ],
    game: [
      'The stadium stands a few hundred metres west of Mirpur 10 circle, as it does in reality. It is built as a complete bowl: tiered green stands, a red roof line, floodlight towers at the corners, the outfield and a pitch strip in the middle.',
      'The teleport puts you on the outfield facing the stand. Turn on fly mode with F and rise above it to see how the ground sits inside the surrounding housing, which is the view that best shows the real building footprints around it.',
    ],
    how: 'Press O and choose Sher-e-Bangla Cricket Stadium. Press F to fly for the aerial view.',
    near: ['mirpur-10-golchokkor', 'mirpur-10-metro-station', 'benarasi-palli'],
  },
  {
    slug: 'benarasi-palli',
    id: 'lm-benarasi',
    kind: 'landmark',
    title: 'Mirpur Benarasi Palli',
    bn: 'মিরপুর বেনারশী পল্লী',
    img: null,
    summary: 'The Benarasi saree market of Mirpur Section 10: the maroon gate across the road and the banded colonnade of saree shops.',
    real: [
      'Benarasi Palli is a market of saree shops in Mirpur Section 10, Block A, a short walk from Mirpur 10 circle. It grew up around weavers who came to Dhaka from Varanasi (Benares) in the 1960s, and it remains the place the city goes for wedding sarees.',
      'Its entrance is marked by a gate that is a beam rather than an arch: a wide maroon signboard spanning the whole road on red-and-white banded columns, lettered in white Bangla.',
    ],
    game: [
      'The gate is reproduced from photographs, with the Bangla name মিরপুর বেনারশী পল্লী across the beam. Behind it the shopfronts share a continuous colonnade over the footpath in the same red-and-white banding, with a red fascia of shop names above the canopy.',
      'The shop names used are the saree shops OpenStreetMap records on the Benaroshi Polli roads, set as plain text signs.',
    ],
    how: 'Press O and choose Benarasi Palli Gate.',
    near: ['mirpur-10-golchokkor', 'mirpur-10-foot-over-bridge', 'mirpur-10-metro-station'],
  },
  {
    slug: 'pallabi-mirpur-12-street',
    id: 'lm-bfc',
    kind: 'landmark',
    title: 'Pallabi & Mirpur 12 Street Frontage',
    bn: 'পল্লবী ও মিরপুর ১২',
    img: 'pallabi-shops',
    imgAlt: 'Shopfronts and coloured sign bands under the viaduct on the Pallabi stretch in Mirpur Drive',
    summary: 'A real street corner rebuilt sign for sign: the food tower, the school and the shopping plaza on the Pallabi stretch.',
    real: [
      'The stretch of Begum Rokeya Avenue around Pallabi and Mirpur 12 is ordinary Dhaka at full density: a fast-food tower, a school and college, a shopping plaza, pharmacies, mobile-banking agents and phone shops stacked along the footpath under the metro viaduct.',
    ],
    game: [
      'Most buildings in the game are generated from their real footprint and height. Here, 28 frontage buildings use their actual footprints and three are modelled by hand against street-level reference: a seven-storey food tower, a school and college, and a retail plaza, each with its signs in the right place and the right colours.',
      'Business names appear as plain text in the sign\'s real colours. Logos are not redrawn. It is the part of the game that shows what the whole corridor could look like with enough local knowledge, and the part where contributions from people who know the street are most useful.',
    ],
    how: 'Press O and choose BFC & KFC Food Tower, South Point School & College or Regal & Best Buy Plaza. All three are within a short walk of the Pallabi spawn.',
    near: ['pallabi-metro-station', 'uttara-south-metro-station', 'mirpur-11-metro-station'],
  },
  {
    slug: 'jatiya-sangsad-bhaban',
    id: 'lm-sangsad',
    kind: 'landmark',
    title: 'Jatiya Sangsad Bhaban (National Parliament)',
    bn: 'জাতীয় সংসদ ভবন',
    img: 'sangsad',
    imgAlt: 'Jatiya Sangsad Bhaban seen across its lake in Mirpur Drive',
    summary: 'Louis Kahn\'s National Parliament House, rising from its lake at Sher-e-Bangla Nagar.',
    real: [
      'Jatiya Sangsad Bhaban, the National Parliament House of Bangladesh, was designed by the American architect Louis Kahn and completed in 1982. It is regarded as one of the major works of twentieth-century architecture: monumental concrete volumes cut with huge circular and triangular openings, set in an artificial lake.',
    ],
    game: [
      'The building is generated from its real OpenStreetMap outline, a ring of 177 points with 14 interior voids, and then given Kahn\'s banded concrete, the large geometric cut-outs, the surrounding lake and the long south steps. A dedicated test (npm run smoke) guards it, because a shape that complex is exactly what silently produces broken geometry.',
      'You arrive on the avenue to the south, which is the classic view of it across the open ground.',
    ],
    how: 'Press O and choose Jatiya Sangsad Bhaban, or press 7 when you are in the Bijoy Sarani district.',
    near: ['manik-mia-avenue', 'bijoy-sarani-metro-station', 'farmgate-metro-station'],
  },
  {
    slug: 'manik-mia-avenue',
    id: 'lm-manik-mia',
    kind: 'landmark',
    title: 'Manik Mia Avenue',
    bn: 'মানিক মিয়া এভিনিউ',
    img: 'manik-mia',
    imgAlt: 'The open ground of Manik Mia Avenue with the Parliament building in the distance in Mirpur Drive',
    summary: 'The broad ceremonial avenue along the south side of the Parliament grounds.',
    real: [
      'Manik Mia Avenue runs along the southern edge of the Parliament complex at Sher-e-Bangla Nagar. It is one of the widest roads in Dhaka, and the open lawns on its north side give the city one of its few long, uninterrupted views.',
    ],
    game: [
      'In a game that is mostly narrow streets under a viaduct, this is the opposite: a wide, straight avenue with open ground and the Parliament building on the horizon. It is the best place in the second district to drive fast, and the clearest view of how the Sangsad complex sits in its landscape.',
    ],
    how: 'Press O and choose Manik Mia Avenue.',
    near: ['jatiya-sangsad-bhaban', 'bijoy-sarani-metro-station', 'farmgate-metro-station'],
  },
];
