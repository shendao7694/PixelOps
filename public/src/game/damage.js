export const ARMOR_ABSORB = 0.8;

/**
 * Split incoming damage between armor and health. Armor absorbs up to 80% of
 * each hit; if it cannot cover that share, the overflow also reaches health.
 */
export function applyArmorDamage(target, amount) {
  const damage = Math.max(0, amount);
  const armorBefore = Math.max(0, target.armor || 0);
  const absorbed = Math.min(armorBefore, damage * ARMOR_ABSORB);
  target.armor = Math.max(0, armorBefore - absorbed);
  const healthDamage = damage - absorbed;
  target.health -= healthDamage;
  return {
    absorbed,
    healthDamage,
    armorBroke: armorBefore > 0 && target.armor <= 0,
  };
}
