import type { Lang } from './site';

/** Fixed labels of the standard page template (Template artboard). */
export type PageCopy = {
  backHome: string;
  whereLabel: string;
  slotsLabel: string;
  formLoading: string;
};

export const pageCopy: Record<Lang, PageCopy> = {
  af: { backHome: 'Terug na Tuisblad', whereLabel: 'Waar', slotsLabel: 'Tydgleuwe', formLoading: 'Vorm laai…' },
  en: { backHome: 'Back to Homepage', whereLabel: 'Where', slotsLabel: 'Time slots', formLoading: 'Loading form…' },
};
