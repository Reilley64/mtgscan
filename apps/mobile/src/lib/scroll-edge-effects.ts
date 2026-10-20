export const softTopScrollEdgeEffects = { top: 'soft', bottom: 'automatic', left: 'automatic', right: 'automatic' } as const;

export const hiddenTopScrollEdgeEffects = { ...softTopScrollEdgeEffects, top: 'hidden' } as const;
