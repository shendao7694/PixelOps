import { PVP_MAP_OPTIONS } from '../net/map-vote.js';

export class MapVoteScreen {
  constructor(root, { onVote = () => {} } = {}) {
    this.root = root;
    this.onVote = onVote;
    this.selected = null;
    this.cards = new Map();
    this.root.className = 'map-vote-layer';
    this.root.setAttribute('aria-label', 'Map vote');
  }

  show({ counts = {}, selected = null } = {}) {
    this.selected = selected;
    this.root.replaceChildren();
    const grid = document.createElement('div');
    grid.className = 'map-vote-grid';
    for (const option of PVP_MAP_OPTIONS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'map-vote-card';
      button.dataset.mapId = option.id;
      button.setAttribute('aria-label', option.name);
      const image = document.createElement('img');
      image.src = option.thumbnail;
      image.alt = '';
      image.draggable = false;
      const name = document.createElement('strong');
      name.textContent = option.name;
      const votes = document.createElement('output');
      votes.className = 'map-vote-count';
      votes.value = String(counts[option.id] || 0);
      votes.textContent = String(counts[option.id] || 0);
      button.append(image, name, votes);
      button.addEventListener('click', () => {
        this.selected = option.id;
        this.update(counts, option.id);
        this.onVote(option.id);
      });
      grid.append(button);
      this.cards.set(option.id, { button, votes });
    }
    this.root.append(grid);
    this.root.hidden = false;
    this.update(counts, selected);
  }

  update(counts = {}, selected = this.selected) {
    this.selected = selected;
    for (const [mapId, card] of this.cards) {
      const count = Number(counts[mapId]) || 0;
      card.votes.value = String(count);
      card.votes.textContent = String(count);
      const active = mapId === selected;
      card.button.classList.toggle('selected', active);
      card.button.setAttribute('aria-pressed', String(active));
    }
  }

  hide() {
    this.root.hidden = true;
    this.root.replaceChildren();
    this.cards.clear();
    this.selected = null;
  }
}
