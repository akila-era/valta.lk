import { CatalogueImage } from "./catalogue-image";

export function ProductImage({
  src,
  alt,
  sizes,
  priority,
  contain = true,
  padding,
  onError,
}: {
  src?: string;
  alt: string;
  sizes: string;
  priority?: boolean;
  contain?: boolean;
  padding?: string;
  onError?: () => void;
}) {
  return (
    <CatalogueImage
      src={src}
      alt={alt}
      sizes={sizes}
      priority={priority}
      contain={contain}
      padding={padding}
      onError={onError}
    />
  );
}
