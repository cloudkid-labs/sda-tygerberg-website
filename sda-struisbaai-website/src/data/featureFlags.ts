/**
 * Central feature-flag adapter while Cloudflare Flagship integration is pending.
 * Replace these defaults with Flagship evaluations when its Worker integration
 * is implemented; keep every disabled Struisbaai feature behind this adapter.
 */
export const FEATURE_FLAGS = {
  youtubeSection: false,
  departmentHeads: false,
  weekEvents: false,
  bloodBankCard: false,
} as const;
