export type GalleryObjectFit = "contain" | "cover";
export type GalleryDisplayMode = "masonry" | "grid" | "carousel";

export interface GalleryConfig {
  version: 1;
  mode: GalleryDisplayMode;
  itemWidth: number;
  itemHeight: number;
  gap: number;
  objectFit: GalleryObjectFit;
  background: string;
  borderRadius: number;
}

export const DEFAULT_GALLERY_CONFIG: GalleryConfig = {
  version: 1,
  mode: "masonry",
  itemWidth: 220,
  itemHeight: 160,
  gap: 8,
  objectFit: "contain",
  background: "#00000000",
  borderRadius: 4,
};
