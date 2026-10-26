/**
 * The service cards a request can ask for. The MVP has exactly one (brief section 6); each
 * further card is a product decision, not a configuration value.
 */
export const SERVICE_CARDS = ['nonroot-runtime-review'] as const;
export type ServiceCardId = (typeof SERVICE_CARDS)[number];

export function isServiceCard(value: unknown): value is ServiceCardId {
  return typeof value === 'string' && (SERVICE_CARDS as readonly string[]).includes(value);
}
