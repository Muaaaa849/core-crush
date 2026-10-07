import { expect, it } from 'vitest';
import { roomUrl } from '../../src/net/room';

it('T10-29 permits an unset URL, local HTTP and public HTTPS origins only', () => {
  expect(roomUrl(undefined)).toBeUndefined(); expect(roomUrl('')).toBeUndefined();
  expect(roomUrl('http://localhost:8787/')).toBe('http://localhost:8787');
  expect(roomUrl('https://rooms.example.test')).toBe('https://rooms.example.test');
  for (const value of ['http://rooms.example.test', 'https://user:password@rooms.example.test', 'https://rooms.example.test/rooms', 'https://rooms.example.test/?token=private']) expect(() => roomUrl(value)).toThrow();
});
