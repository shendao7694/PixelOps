import {
  LOADOUT_OPTIONS,
  PASSIVE_IDS,
  loadoutOption,
  loadoutSecondaryOption,
  loadoutStreakRequirement,
  sanitizeLoadout,
  setLoadoutSlot,
} from '../game/loadout.js';
import { createPassiveIcon } from './passive-icons.js';
import { createLoadoutModelOutline } from './loadout-previews.js';
import {
  hasSilhouetteAsset,
  silhouetteAssetUrl,
} from './silhouette-assets.js';
import { localizeText, normalizeLanguage } from '../core/i18n.js';

const EQUIPMENT_SLOTS = Object.freeze([
  { group: 'primary', label: 'PRIMARY WEAPON', code: '01' },
  { group: 'secondary', label: 'SECONDARY WEAPON', code: '02' },
  { group: 'grenade', label: 'LETHAL', code: '03' },
  { group: 'melee', label: 'MELEE WEAPON', code: '04' },
]);

const PICKER_TITLES = Object.freeze({
  primary: 'SELECT PRIMARY WEAPON',
  secondary: 'SELECT SECONDARY WEAPON',
  grenade: 'SELECT LETHAL',
  melee: 'SELECT MELEE WEAPON',
  passives: 'SELECT PASSIVE SKILL',
  streaks: 'SELECT KILLSTREAK',
});

function createEquipmentPreview(id, className) {
  if (!hasSilhouetteAsset(id)) {
    return createLoadoutModelOutline(id, `${className} loadout-model-outline`);
  }

  const image = document.createElement('img');
  image.className = `${className} loadout-generated-silhouette`;
  image.src = silhouetteAssetUrl(id);
  image.alt = '';
  image.decoding = 'async';
  image.draggable = false;
  image.setAttribute('aria-hidden', 'true');
  image.addEventListener('error', () => {
    image.replaceWith(createLoadoutModelOutline(
      id,
      `${className} loadout-model-outline`
    ));
  }, { once: true });
  return image;
}

function slotButton({ group, index = 0, label, code, value, loadout, language }) {
  const option = group === 'secondary'
    ? loadoutSecondaryOption(loadout)
    : loadoutOption(group, value);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'loadout-slot';
  if (group === 'passives') button.classList.add('passive-slot');
  button.dataset.group = group;
  button.dataset.index = String(index);
  button.dataset.option = option?.id || value;
  button.setAttribute(
    'aria-label',
    `${localizeText(label, language)}: ${localizeText(option?.name || value, language)}`
  );

  const preview = document.createElement('span');
  preview.className = 'loadout-slot-preview';
  if (group === 'passives') {
    preview.classList.add('loadout-passive-preview');
    preview.append(createPassiveIcon(
      option?.icon,
      'passive-icon loadout-slot-model loadout-passive-icon'
    ));
  } else {
    preview.append(createEquipmentPreview(
      option?.id || value,
      'loadout-slot-model'
    ));
  }

  // Main loadout tiles are deliberately icon-only. The complete slot and item
  // names remain exposed through aria-label and inside the item picker.
  button.append(preview);
  return button;
}

export class LoadoutScreen {
  constructor(root, handlers = {}, language = 'en') {
    this.root = root;
    this.handlers = handlers;
    this.language = normalizeLanguage(language);
    this.loadout = sanitizeLoadout(null);
    this.picker = null;
    this.visible = false;
    if (!root) return;

    root.className = 'loadout-layer';
    root.hidden = true;
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = `
      <section class="loadout-shell" aria-labelledby="loadout-title">
        <h1 id="loadout-title" class="loadout-visually-hidden">SELECT COMBAT KIT</h1>
        <div id="loadout-current-match" class="loadout-visually-hidden" aria-label="Current match">
          <span id="loadout-mode">PVE</span>
          <strong id="loadout-map">BLACKSITE</strong>
        </div>
        <div id="loadout-slot-grid" class="loadout-grid" aria-label="Combat kit slots">
          <div id="loadout-equipment" class="loadout-equipment"></div>
          <div id="loadout-passives" class="loadout-rail"></div>
          <div id="loadout-streaks" class="loadout-rail"></div>
        </div>
        <aside id="loadout-picker" class="loadout-picker" hidden aria-labelledby="loadout-picker-title">
          <h2 id="loadout-picker-title" class="loadout-visually-hidden">SELECT ITEM</h2>
          <div id="loadout-options" class="loadout-options"></div>
        </aside>
        <footer class="loadout-footer">
          <p id="loadout-status" class="loadout-visually-hidden" aria-live="polite">LOADOUT READY</p>
          <div>
            <button id="loadout-exit" class="loadout-exit" type="button">EXIT</button>
            <button id="loadout-deploy" class="loadout-deploy" type="button">DEPLOY</button>
          </div>
        </footer>
      </section>`;

    this.equipment = root.querySelector('#loadout-equipment');
    this.passives = root.querySelector('#loadout-passives');
    this.streaks = root.querySelector('#loadout-streaks');
    this.pickerPanel = root.querySelector('#loadout-picker');
    this.pickerTitle = root.querySelector('#loadout-picker-title');
    this.options = root.querySelector('#loadout-options');
    this.modeLabel = root.querySelector('#loadout-mode');
    this.mapLabel = root.querySelector('#loadout-map');
    this.status = root.querySelector('#loadout-status');
    this.deployButton = root.querySelector('#loadout-deploy');
    this.exitButton = root.querySelector('#loadout-exit');
    this.title = root.querySelector('#loadout-title');
    this.currentMatch = root.querySelector('#loadout-current-match');
    this.slotGrid = root.querySelector('#loadout-slot-grid');

    root.addEventListener('mousedown', (event) => event.stopPropagation());
    root.addEventListener('click', (event) => this.handleClick(event));
    root.addEventListener('keydown', (event) => {
      if (event.code === 'Escape' && this.picker) {
        event.preventDefault();
        event.stopPropagation();
        this.closePicker();
      }
    });
    this.applyLanguage();
  }

  show({ loadout, gameType, mapName, roomNumber, initial = false } = {}) {
    if (!this.root) return;
    this.loadout = sanitizeLoadout(loadout);
    this.visible = true;
    this.root.hidden = false;
    this.root.setAttribute('aria-hidden', 'false');
    this.modeLabel.textContent = localizeText(
      gameType === 'pvp' ? 'PVP // MATCH LIVE' : 'PVE // LOCAL',
      this.language
    );
    const mapLabel = gameType === 'pvp' && roomNumber
      ? `ROOM ${roomNumber} // ${mapName || 'BLACKSITE'}`
      : mapName || 'BLACKSITE';
    this.mapLabel.textContent = localizeText(mapLabel, this.language);
    this.exitButton.textContent = localizeText(
      gameType === 'pvp' ? 'LEAVE ROOM' : initial ? 'MAIN MENU' : 'BACK',
      this.language
    );
    this.closePicker();
    this.renderSlots();
    this.root.querySelector('.loadout-slot')?.focus({ preventScroll: true });
  }

  hide() {
    if (!this.root) return;
    this.visible = false;
    this.closePicker();
    this.root.hidden = true;
    this.root.setAttribute('aria-hidden', 'true');
  }

  setLanguage(language) {
    this.language = normalizeLanguage(language);
    this.applyLanguage();
    if (this.visible) {
      this.renderSlots();
      if (this.picker) {
        const { group, index } = this.picker;
        this.openPicker(group, index);
      }
    }
  }

  applyLanguage() {
    if (!this.root) return;
    this.root.lang = this.language;
    this.title.textContent = localizeText('SELECT COMBAT KIT', this.language);
    this.currentMatch.setAttribute(
      'aria-label',
      localizeText('Current match', this.language)
    );
    this.slotGrid.setAttribute(
      'aria-label',
      localizeText('Combat kit slots', this.language)
    );
    if (!this.picker) {
      this.pickerTitle.textContent = localizeText('SELECT ITEM', this.language);
    }
    this.status.textContent = localizeText('LOADOUT READY', this.language);
    this.deployButton.textContent = localizeText('DEPLOY', this.language);
    if (!this.visible) this.exitButton.textContent = localizeText('EXIT', this.language);
  }

  renderSlots() {
    if (!this.root) return;
    const weaponMaster = this.loadout.passives[0] === PASSIVE_IDS.WEAPON_MASTER;
    this.equipment.replaceChildren(...EQUIPMENT_SLOTS.map((slot) => {
      const secondary = slot.group === 'secondary' && weaponMaster;
      return slotButton({
        ...slot,
        label: secondary ? 'SECOND PRIMARY' : slot.label,
        value: this.loadout[slot.group],
        loadout: this.loadout,
        language: this.language,
      });
    }));
    this.passives.replaceChildren(...this.loadout.passives.map((value, index) => slotButton({
      group: 'passives',
      index,
      label: 'ACTIVE PASSIVE',
      code: 'P1',
      value,
      loadout: this.loadout,
      language: this.language,
    })));
    this.streaks.replaceChildren(...this.loadout.streaks.map((value, index) => slotButton({
      group: 'streaks',
      index,
      label: `KILLSTREAK ${index + 1}`,
      code: String(index + 5),
      value,
      loadout: this.loadout,
      language: this.language,
    })));
  }

  handleClick(event) {
    const slot = event.target.closest('.loadout-slot');
    if (slot) {
      this.openPicker(slot.dataset.group, Number(slot.dataset.index) || 0);
      return;
    }
    const option = event.target.closest('.loadout-option');
    if (option && this.picker) {
      const { group, index } = this.picker;
      this.loadout = setLoadoutSlot(
        this.loadout,
        group,
        index,
        option.dataset.option
      );
      this.handlers.change?.(sanitizeLoadout(this.loadout));
      this.renderSlots();
      this.closePicker();
      this.root.querySelector(
        `.loadout-slot[data-group="${group}"][data-index="${index}"]`
      )?.focus({ preventScroll: true });
      return;
    }
    if (event.target.closest('#loadout-deploy')) {
      if (!this.deployButton.disabled) this.handlers.deploy?.(sanitizeLoadout(this.loadout));
      return;
    }
    if (event.target.closest('#loadout-exit')) this.handlers.exit?.();
  }

  openPicker(group, index) {
    const weaponMasterSecondary = group === 'secondary'
      && this.loadout.passives[0] === PASSIVE_IDS.WEAPON_MASTER;
    const options = weaponMasterSecondary
      ? LOADOUT_OPTIONS.primary.filter((option) =>
        option.live && option.id !== this.loadout.primary)
      : LOADOUT_OPTIONS[group]?.filter((option) => option.live);
    if (!options?.length) return;
    this.picker = { group, index };
    this.pickerTitle.textContent = localizeText(weaponMasterSecondary
      ? 'SELECT SECOND PRIMARY WEAPON'
      : PICKER_TITLES[group] || 'SELECT ITEM', this.language);
    const current = group === 'passives' || group === 'streaks'
      ? this.loadout[group][index]
      : this.loadout[group];
    this.options.replaceChildren(...options.map((item) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'loadout-option';
      button.dataset.option = item.id;
      button.setAttribute('aria-pressed', String(item.id === current));
      if (item.id === current) button.classList.add('selected');

      if (group === 'passives') {
        button.classList.add('passive-option');
        button.append(createPassiveIcon(item.icon, 'passive-icon loadout-option-icon'));
      } else {
        button.classList.add('equipment-option');
        const preview = document.createElement('span');
        preview.className = 'loadout-option-preview';
        preview.append(createEquipmentPreview(item.id, 'loadout-option-model'));
        button.append(preview);
      }
      const copy = document.createElement('span');
      copy.className = 'loadout-option-copy';
      const name = document.createElement('strong');
      name.textContent = localizeText(item.name, this.language);
      const meta = document.createElement('span');
      meta.textContent = localizeText(group === 'streaks'
        ? `${loadoutStreakRequirement(this.loadout, item.id)} KILLSTREAK`
        : item.type, this.language);
      const description = document.createElement('small');
      description.textContent = localizeText(item.description, this.language);
      copy.append(name, meta, description);
      const badge = document.createElement('em');
      badge.textContent = localizeText('COMBAT READY', this.language);
      button.append(copy, badge);
      return button;
    }));
    this.pickerPanel.hidden = false;
    this.options.querySelector('.selected')?.focus({ preventScroll: true });
  }

  closePicker() {
    this.picker = null;
    if (this.pickerPanel) this.pickerPanel.hidden = true;
  }

  setDeploymentState({ remaining = 0, pending = false } = {}) {
    if (!this.deployButton) return;
    const seconds = Math.max(0, Math.ceil(Number(remaining) || 0));
    this.deployButton.disabled = pending || seconds > 0;
    this.deployButton.textContent = localizeText(pending
      ? 'DEPLOYING...'
      : seconds > 0
        ? `AVAILABLE IN ${seconds}`
        : 'DEPLOY', this.language);
    this.status.textContent = localizeText(pending
      ? 'SENDING LOADOUT TO AUTHORITY'
      : seconds > 0
        ? `REINFORCEMENT WINDOW // ${seconds} SEC`
        : 'LOADOUT VALID // READY TO DEPLOY', this.language);
  }
}
