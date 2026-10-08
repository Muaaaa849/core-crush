import { CHARACTERS, skillLines, type CharacterId, type Roster } from '../game/characters';
import type { PlayerId, Side } from '../sim/types';

export const portraitUrl = (id: CharacterId): string =>
  `${import.meta.env.BASE_URL}assets/portrait_${id}.webp?v=${__ASSET_VERSIONS__[`portrait_${id}`]}`;
const badge = (side: Side) => `<span class="team-badge team-${side}">${side.toUpperCase()}</span>`;

export function characterCards(): HTMLElement[] {
  return Object.entries(CHARACTERS).map(([id, character], index) => {
    const label = document.createElement('label'); label.className = 'character-card';
    label.style.setProperty('--character-color', character.colors.emissive);
    label.innerHTML = `<input type="radio" name="character" value="${id}"${index === 0 ? ' checked' : ''}><span class="selected-label">選択中</span>
      <img class="portrait" src="${portraitUrl(id as CharacterId)}" alt=""><h3>${character.name}</h3>
      <div class="character-stats">${(['attack', 'defense', 'agility'] as const).map((stat, i) => `<div><span>${['攻撃', '防御', '敏捷'][i]}</span><span class="meter"><i style="width:${character.stats[stat] * 10}%"></i></span><b>${character.stats[stat]}</b></div>`).join('')}</div>
      <div class="character-skills">${skillLines(id as CharacterId).map(line => `<span>${line}</span>`).join('')}</div>`;
    return label;
  });
}

export function renderLocalRoster(element: HTMLElement, roster: Roster): void {
  element.innerHTML = roster.map(entry => `<span class="roster-chip">${entry.id.toUpperCase()} ${badge(entry.side)} ${CHARACTERS[entry.characterId].name}${entry.id === 'p1' ? ' / あなた' : ' / Bot'}</span>`).join('');
}

export function renderRoomRoster(element: HTMLElement, players: readonly { id: PlayerId; side: Side; characterId: CharacterId; loaded: boolean; confirmed: boolean }[], local: PlayerId): void {
  element.innerHTML = (['p1', 'p2', 'p3', 'p4'] as const).map(id => {
    const player = players.find(p => p.id === id);
    return player ? `<div class="room-player"><b>${id.toUpperCase()}</b>${badge(player.side)}<img src="${portraitUrl(player.characterId)}" alt=""><strong>${CHARACTERS[player.characterId].name}</strong><small>${id === 'p1' ? 'ホスト' : ''}${id === local ? ' / あなた' : ''}</small><span>${player.confirmed ? '結果確認済み' : player.loaded ? '✓ ロード済み' : 'ロード待ち'}</span></div>`
      : `<div class="room-player vacant"><b>${id.toUpperCase()}</b><span>空き枠</span></div>`;
  }).join('');
}
