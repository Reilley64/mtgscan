type PrimitiveCatalogModule = typeof import('@/primitive-catalog/primitive-catalog');

const PrimitiveCatalog = __DEV__
  ? (require('@/primitive-catalog/primitive-catalog') as PrimitiveCatalogModule).PrimitiveCatalog
  : null;

export default function PrimitivesScreen() {
  return PrimitiveCatalog ? <PrimitiveCatalog /> : null;
}
