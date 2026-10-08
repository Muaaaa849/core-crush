import { expect, it } from 'vitest';
import { backScreen } from '../../src/ui/screens';

it('returns from preparation to menu, from menu to title, and settings to its entry', () => {
  expect(backScreen('local', 'menu')).toBe('menu');
  expect(backScreen('online', 'menu')).toBe('menu');
  expect(backScreen('menu', 'title')).toBe('title');
  expect(backScreen('settings', 'pause')).toBe('pause');
  expect(backScreen('settings', 'online')).toBe('online');
});
