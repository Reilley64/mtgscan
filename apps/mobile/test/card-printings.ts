import type { GalleryCardPrinting } from '../modules/card-recognizer';

function printing(
  printingId: string,
  name: string,
  setCode: string,
  collectorNumber: string,
  finishes: GalleryCardPrinting['finishes'],
  basicLand = false,
): GalleryCardPrinting {
  return { printingId, oracleId: `oracle-${name}`, name, setCode, collectorNumber, finishes, basicLand };
}

export const lightningBoltM10 = printing('bolt-m10', 'Lightning Bolt', 'm10', '146', ['nonfoil', 'foil']);
export const lightningBoltList = printing('bolt-plst', 'Lightning Bolt', 'plst', 'M10-146', ['nonfoil']);
export const lightningBolt2xm = printing('bolt-2xm', 'Lightning Bolt', '2xm', '117', ['nonfoil', 'foil']);
export const lightningBoltSld = printing('bolt-sld', 'Lightning Bolt', 'sld', '1001', ['foil', 'etched']);
export const shock = printing('shock-m19', 'Shock', 'm19', '156', ['nonfoil', 'foil']);
export const lightningAxe = printing('axe-tsp', 'Lightning Axe', 'tsp', '167', ['nonfoil', 'foil']);
export const solRingEtched = printing('sol-ring-cmm', 'Sol Ring', 'cmm', '700', ['etched']);
export const solRingCommander = printing('sol-ring-c21', 'Sol Ring', 'c21', '263', ['nonfoil', 'foil']);
export const plains = printing('plains-m21', 'Plains', 'm21', '260', ['nonfoil', 'foil'], true);
export const tamiyosJournal = printing('journal-soi', "Tamiyo's Journal", 'soi', '265', ['nonfoil', 'foil']);
export const tamiyosJournalPrerelease = printing('journal-psoi', "Tamiyo's Journal", 'psoi', '265s', ['foil']);
export const tamiyosJournalPromo = printing('journal-psoi-p', "Tamiyo's Journal", 'psoi', '265p', ['foil']);

export const galleryPrintings: GalleryCardPrinting[] = [
  lightningAxe,
  lightningBoltM10,
  lightningBoltList,
  shock,
  lightningBolt2xm,
  tamiyosJournal,
  tamiyosJournalPrerelease,
  tamiyosJournalPromo,
  lightningBoltSld,
  plains,
  solRingEtched,
  solRingCommander,
];

export function cardImageUri(printingId: string) {
  return `https://cards.scryfall.io/normal/front/${printingId}.jpg`;
}
