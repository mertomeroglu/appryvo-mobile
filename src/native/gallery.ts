import { nativeCamera } from './camera';

export const nativeGallery = {
  async selectPhotos(limit = 6): Promise<string[]> {
    const photos = await nativeCamera.pickImages();
    return photos.slice(0, limit);
  },
};
