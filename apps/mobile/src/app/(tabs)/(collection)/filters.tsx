import { useCollectionSearchState } from '@/collection/collection-search-state';
import { useUserTags } from '@/collection/user-tags';
import { CollectionFilters } from '@/components/organisms/collection-filters';
import { DrawerSheet } from '@/components/templates/drawer-sheet';

export default function FiltersDrawer() {
  const { chips, replaceChips } = useCollectionSearchState();
  const { read } = useUserTags();

  return (
    <DrawerSheet title="Filters">
      <CollectionFilters
        chips={chips}
        userTagNames={read.status === 'loaded' ? read.userTags.map((userTag) => userTag.name) : []}
        onChange={replaceChips}
      />
    </DrawerSheet>
  );
}
