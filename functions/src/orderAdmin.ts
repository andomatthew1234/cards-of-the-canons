export function isSandboxOrder(paymentEnvironment: unknown) {
  return paymentEnvironment === 'test'
}

/**
 * Sandbox orders (Batch B, S5) never debit operational stock, so dismissing
 * them must not hand stock back. Orders written before scope bookkeeping
 * existed have no `inventoryScope` and keep the legacy restore behaviour.
 */
export function shouldRestoreDismissedOrderInventory(
  paymentEnvironment: unknown,
  inventoryState: unknown,
  inventoryScope: unknown = undefined,
) {
  if (inventoryScope === 'sandbox') return false
  return isSandboxOrder(paymentEnvironment) && (inventoryState === 'reserved' || inventoryState === 'committed')
}
