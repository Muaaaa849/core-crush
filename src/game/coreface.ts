export interface CoreFace {
  expression: 'calm' | 'panic' | 'rage';
  cracked: boolean;
}

/** simの整数時刻で表情を決める。時計停止中はnull。 */
export function coreFace(elapsed: number | null, second: number): CoreFace {
  if (elapsed === null || elapsed < 3 * second) return { expression: 'calm', cracked: false };
  return { expression: elapsed < 5 * second ? 'panic' : 'rage', cracked: elapsed >= 7 * second };
}
