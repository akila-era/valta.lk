export * from "./types";
export * from "./input";
export * from "./audit";
export * from "./render";
export { recommendationGate, BLOCKING_CODES, type CategoryStats, type GateDecision, type ProductAudit, type ShopStats } from "./readiness";
export { CATEGORY_TREE, classify, inferKind } from "./categories";
export { isCardable, productSlug } from "./checks-identity";
