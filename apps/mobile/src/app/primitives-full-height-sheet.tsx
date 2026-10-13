type DrawerSheetSampleModule = typeof import('@/primitive-catalog/drawer-sheet-sample');

const DrawerSheetSample = __DEV__
  ? (require('@/primitive-catalog/drawer-sheet-sample') as DrawerSheetSampleModule).DrawerSheetSample
  : null;

export default function PrimitivesFullHeightSheet() {
  return DrawerSheetSample ? <DrawerSheetSample fullHeight /> : null;
}
