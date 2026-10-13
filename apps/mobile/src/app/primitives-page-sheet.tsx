type PageSheetSampleModule = typeof import('@/primitive-catalog/page-sheet-sample');

const PageSheetSample = __DEV__
  ? (require('@/primitive-catalog/page-sheet-sample') as PageSheetSampleModule).PageSheetSample
  : null;

export default function PrimitivesPageSheet() {
  return PageSheetSample ? <PageSheetSample /> : null;
}
