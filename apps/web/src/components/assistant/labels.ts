import type { AssistantLang } from "./types";

/**
 * Fixed UI labels. The Sinhala column is PROVISIONAL and needs native-speaker review (blocker B5):
 * it must not be presented as production-ready Sinhala.
 */
const EN = {
  mock: "Demo data",
  mockNote: "Demo catalogue, not live VOLTA.LK inventory",
  inStock: "In stock (demo)",
  outOfStock: "Out of stock (demo)",
  noImage: "No image",
  specs: "Specifications",
  unavailable: "Not available",
  compare: "Comparison",
  priceDifference: "Price difference",
  loading: "Looking that up",
  emptyTitle: "No matching products",
  emptyBody: "Try a different name, brand or budget.",
  errorTitle: "Something went wrong",
  errorBody: "The assistant could not answer just now. Please try again.",
  confirmTitle: "Please confirm this cart change",
  confirmNote: "Nothing changes in your cart until you confirm.",
  add: "Add to cart",
  setQuantity: "Change quantity",
  remove: "Remove from cart",
  quantity: "Quantity",
  confirm: "Confirm",
  cancel: "Cancel",
  done: "Done",
  dismissed: "Cancelled. Your cart was not changed.",
  retry: "Try again",
} as const;

const SI: Record<keyof typeof EN, string> = {
  mock: "ආදර්ශ දත්ත",
  mockNote: "ආදර්ශ නාමාවලියකි, සජීවී VOLTA.LK තොගයක් නොවේ",
  inStock: "තොගයේ ඇත (ආදර්ශ)",
  outOfStock: "තොග නැත (ආදර්ශ)",
  noImage: "රූපයක් නැත",
  specs: "විශේෂාංග",
  unavailable: "නොමැත",
  compare: "සංසන්දනය",
  priceDifference: "මිල වෙනස",
  loading: "සොයමින්",
  emptyTitle: "ගැළපෙන නිෂ්පාදන නැත",
  emptyBody: "වෙනත් නමක්, සන්නාමයක් හෝ අයවැයක් උත්සාහ කරන්න.",
  errorTitle: "යම් දෙයක් වැරදුණා",
  errorBody: "දැන් පිළිතුරු දීමට නොහැකි විය. නැවත උත්සාහ කරන්න.",
  confirmTitle: "කරුණාකර කූඩය වෙනස්කිරීම තහවුරු කරන්න",
  confirmNote: "ඔබ තහවුරු කරන තුරු කූඩයේ කිසිවක් වෙනස් නොවේ.",
  add: "කූඩයට එක් කරන්න",
  setQuantity: "ප්‍රමාණය වෙනස් කරන්න",
  remove: "කූඩයෙන් ඉවත් කරන්න",
  quantity: "ප්‍රමාණය",
  confirm: "තහවුරු කරන්න",
  cancel: "අවලංගු කරන්න",
  done: "සිදු විය",
  dismissed: "අවලංගු කළා. ඔබේ කූඩය වෙනස් වූයේ නැත.",
  retry: "නැවත උත්සාහ කරන්න",
};

export type LabelKey = keyof typeof EN;
export const labels = (lang: AssistantLang): Record<LabelKey, string> => (lang === "si" ? SI : EN);
