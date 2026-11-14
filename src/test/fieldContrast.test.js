import { describe, expect, it } from 'vitest';
import tailwind from '../../tailwind.config.js';
import { FIELD_BORDER } from '../domains/orders/presentation/fieldStyles';

const { colors } = tailwind.theme.extend;
const channel = (v) => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => channel(Number.parseInt(hex.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe('form field border contrast (WCAG 1.4.11)', () => {
  it('is at least 3:1 against the forest-950 input background', () => {
    const border = colors[FIELD_BORDER.palette][FIELD_BORDER.shade];
    expect(contrast(border, colors.forest[950])).toBeGreaterThanOrEqual(3);
  });

  it('would fail with the old moss-700 border (control for the check)', () => {
    expect(contrast(colors.moss[700], colors.forest[950])).toBeLessThan(3);
  });

  it('keeps the class name in sync with the palette token', () => {
    expect(FIELD_BORDER.className).toBe(`border-${FIELD_BORDER.palette}-${FIELD_BORDER.shade}`);
  });
});
