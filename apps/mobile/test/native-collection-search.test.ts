import { nativeCollectionSearch } from '../src/collection/native-collection-search';

it('native collection search uses the existing exact and negated chip compiler', () => {
  const first = nativeCollectionSearch({ command: { kind: 'text', text: 'finish:foil ' } });
  const second = nativeCollectionSearch({ state: first.state, command: { kind: 'text', text: '-set:lea ' } });
  const third = nativeCollectionSearch({ state: second.state, command: { kind: 'text', text: 'land' } });
  expect(third.query).toEqual({ text: 'land', finishes: ['foil'], sets_exclude: ['lea'] });
});

it('native filter and sort controls use the same chips and default directions as collection search', () => {
  const free = nativeCollectionSearch({ command: { kind: 'filter', section: 0, index: 1 } });
  expect(free.query).toEqual({ is_free: true, is_protected: false });
  expect(free.filterCount).toBe(1);
  const priced = nativeCollectionSearch({ state: free.state, command: { kind: 'sort', sort: 'price' } });
  expect(priced.query).toMatchObject({ sort: 'price', sort_order: 'desc' });
  const reversed = nativeCollectionSearch({ state: priced.state, command: { kind: 'sort', sort: 'price' } });
  expect(reversed.query).toMatchObject({ sort: 'price', sort_order: 'asc' });
});

it('native submit, refusal, removal and cancel preserve the shared query field mapping', () => {
  const typed = nativeCollectionSearch({ command: { kind: 'text', text: 'set:zzz' } });
  expect(typed.query).toEqual({});
  const submitted = nativeCollectionSearch({ state: typed.state, command: { kind: 'submit' }, field: 'sets[0]' });
  expect(submitted.query).toEqual({ sets: ['zzz'] });
  expect(submitted.refusedIndex).toBe(0);
  expect(submitted.refusalMessage).toBe('No set named "zzz".');
  const removed = nativeCollectionSearch({ state: submitted.state, command: { kind: 'remove', index: 0 } });
  expect(removed.query).toEqual({});
  const cancelled = nativeCollectionSearch({ state: submitted.state, command: { kind: 'cancel' } });
  expect(cancelled.state.chips).toEqual([]);
  expect(cancelled.state.text).toBe('');
});

it('native deck chips resolve all exact names and preserve a picked deck identity', () => {
  const decks = [{ deck_id: 'first', name: 'Atraxa' }, { deck_id: 'second', name: 'Atraxa' }];
  const typed = nativeCollectionSearch({ decks, command: { kind: 'text', text: 'deck:"atraxa" ' } });
  expect(typed.query).toEqual({ deck_ids: ['first', 'second'] });
  const suggestions = nativeCollectionSearch({ decks, command: { kind: 'text', text: 'deck:atra' } });
  const picked = nativeCollectionSearch({ decks, state: suggestions.state, command: { kind: 'suggestion', index: 1 } });
  expect(picked.query).toEqual({ deck_ids: ['second'] });
});
