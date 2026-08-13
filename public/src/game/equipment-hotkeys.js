const SLOT_ORDER = Object.freeze(['primary', 'secondary', 'melee', 'grenade']);

export const EQUIPMENT_HOTKEYS = Object.freeze({
  primary: Object.freeze({ code: 'Digit1', label: '1' }),
  secondary: Object.freeze({ code: 'Digit2', label: '2' }),
  melee: Object.freeze({ code: 'Digit3', label: '3' }),
  grenade: Object.freeze({ code: 'Digit4', label: '4' }),
});

const SLOT_BY_CODE = Object.freeze(Object.fromEntries(
  SLOT_ORDER.map((slot) => [EQUIPMENT_HOTKEYS[slot].code, slot])
));

export function equipmentSlotForCode(code) {
  return SLOT_BY_CODE[code] || null;
}

export function pressedEquipmentSlot(input) {
  if (!input?.pressed) return null;
  return SLOT_ORDER.find((slot) => input.pressed(EQUIPMENT_HOTKEYS[slot].code)) || null;
}
