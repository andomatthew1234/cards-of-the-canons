export const BRAND_NAME = 'Doxa'
export const HEADER_BRAND_NAME = 'Doxa Cards'
export const LEGACY_BRAND_NAME = 'Cards of the Canons'

/**
 * Keeps already-published Firestore content consistent with the current brand
 * without mutating historical order snapshots or infrastructure identifiers.
 */
export function replaceLegacyBrand(value: string) {
  return value.replace(/Cards of the Canons/gi, BRAND_NAME)
}
