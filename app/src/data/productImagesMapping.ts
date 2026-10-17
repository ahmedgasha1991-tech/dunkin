import productImagesJson from "./product_images_mapping.json";

export const PRODUCT_UPLOADED_IMAGES: Record<string, string> = productImagesJson;

export function getUploadedProductImage(code?: string): string | null {
  if (!code) return null;
  return PRODUCT_UPLOADED_IMAGES[code] || null;
}
