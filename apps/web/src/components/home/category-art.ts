/** Studio photographs for homepage category tiles. Matched by category name; unknown categories keep their catalogue photo. */

const ART: { test: RegExp; src: string }[] = [
  { test: /phone|mobile|smartphone/i, src: "/images/home/volta-category-smartphones.webp" },
  { test: /audio|earbud|headphone|speaker/i, src: "/images/home/volta-category-audio.webp" },
  { test: /wear|watch/i, src: "/images/home/volta-category-wearables.webp" },
  { test: /tablet/i, src: "/images/home/volta-category-tablets.webp" },
  { test: /accessor|charg|cable|gadget/i, src: "/images/home/volta-category-accessories.webp" },
];

export function categoryVisual(label: string): string | undefined {
  return ART.find((item) => item.test.test(label))?.src;
}

