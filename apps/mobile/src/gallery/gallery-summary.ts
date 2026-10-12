import { type GalleryDelivery, useGallery } from './gallery-state';

const galleryDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

function deliveryLabel(delivery: GalleryDelivery): string | null {
  switch (delivery.kind) {
    case 'up_to_date':
      return 'Up to date';
    case 'downloading':
      return 'Downloading';
    case 'waiting_for_wifi':
    case 'paused':
    case 'failed':
    case 'not_enough_space':
      return 'Paused';
    case 'checking':
      return null;
  }
}

export function useGallerySummary() {
  const { installed, delivery } = useGallery();
  return {
    date: installed ? galleryDate.format(new Date(installed.builtAt)) : null,
    status: deliveryLabel(delivery),
  };
}
