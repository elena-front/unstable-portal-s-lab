import type { NumberRange } from '../config/gameBalance';
import type { RandomSource } from './types';

export function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

export function normalizedRandom(random: RandomSource): number {
  return clamp(random(), 0, 1 - Number.EPSILON);
}

export function randomFloat(
  random: RandomSource,
  [minimum, maximum]: NumberRange,
): number {
  const low = Math.min(minimum, maximum);
  const high = Math.max(minimum, maximum);
  return low + (high - low) * normalizedRandom(random);
}

export function randomInteger(
  random: RandomSource,
  [minimum, maximum]: NumberRange,
): number {
  const low = Math.ceil(Math.min(minimum, maximum));
  const high = Math.floor(Math.max(minimum, maximum));
  return low + Math.floor(normalizedRandom(random) * (high - low + 1));
}

export function randomItem<T>(random: RandomSource, items: readonly T[]): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(normalizedRandom(random) * items.length)] ?? null;
}
