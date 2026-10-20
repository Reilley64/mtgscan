export const trainingCropsBucket = 'training-crops';

export function cropObjectName(cropId: string): string {
  return `${cropId}.webp`;
}
