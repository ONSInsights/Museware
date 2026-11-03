import { describe, expect, it } from 'vitest';
import { createProject } from '../store/useProject';
import { applyOps } from '../ops/apply';
import { DIRECTION_PALETTES } from './palettes';
import { MUSEWARE_DEFAULT_THEME } from './starter';
import {
  brandDirectionOps,
  canCreateBrandDirection,
  contrastRatio,
  brandContrastWarning,
} from './brandDirection';

describe('new project brand direction', () => {
  it('builds a coherent and legible pair of colour maps in one undoable batch', () => {
    const extra = [0, 0xffffff, 0xeab308].map((n) => `#${n.toString(16).padStart(6, '0')}`);
    const pairs = [
      ...DIRECTION_PALETTES.map((p) => [p.hexes[0], p.hexes[1]]),
      ...extra.map((c) => [c, c]),
    ];
    for (const [brand, secondary] of pairs) {
      const original = createProject();
      const result = applyOps(brandDirectionOps(brand, secondary), original, {
        source: 'user',
      });
      expect(result.errors).toEqual([]);
      expect(result.doc.opLog).toHaveLength(1);
      expect(original.tokens).toEqual(MUSEWARE_DEFAULT_THEME);
      for (const mode of ['light_colors', 'dark_colors'] as const) {
        const c = result.doc.tokens.openuiTheme[mode];
        expect(c.openui_accent).toBe(brand);
        expect(c.openui_secondary).toBe(secondary);
        expect(
          contrastRatio(c.openui_text_on_accent, c.openui_accent),
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrastRatio(c.openui_text_on_secondary, c.openui_secondary),
        ).toBeGreaterThanOrEqual(4.5);
        for (const background of [
          c.openui_bg,
          c.openui_fg,
          c.openui_elevated,
          c.openui_sunk,
          c.openui_accent_subtle,
        ]) {
          expect(contrastRatio(c.openui_text_brand, background)).toBeGreaterThanOrEqual(
            4.5,
          );
        }
        expect(contrastRatio(c.openui_text_primary, c.openui_bg)).toBeGreaterThanOrEqual(
          4.5,
        );
        expect(contrastRatio(c.openui_text_secondary, c.openui_bg)).toBeGreaterThanOrEqual(
          4.5,
        );
        expect(
          contrastRatio(c.openui_text_on_accent, c.openui_accent_pressed),
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrastRatio(c.openui_text_on_accent, c.openui_danger_text),
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrastRatio(c.openui_danger_text, c.openui_danger_bg),
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
  it('reports when the exact selected brand blends into surrounding surfaces', () => {
    const brand = `#${(0xffffff).toString(16)}`;
    const result = applyOps(brandDirectionOps(brand, brand), createProject(), {
      source: 'user',
    });
    expect(result.doc.tokens.openuiTheme.brand_color).toBe(brand);
    expect(brandContrastWarning(result.doc)).toContain('light');
  });

  it('only derives from an untouched new default project', () => {
    const doc = createProject();
    expect(canCreateBrandDirection(doc)).toBe(true);
    doc.tokens.openuiTheme.light_colors.openui_bg = DIRECTION_PALETTES[0].hexes[2];
    expect(canCreateBrandDirection(doc)).toBe(false);
    const decided = createProject();
    decided.rail.push({
      id: 'user_note',
      role: 'user',
      text: 'Use the supplied design system',
      at: Date.now(),
    });
    expect(canCreateBrandDirection(decided)).toBe(false);
    const requested = createProject();
    requested.rail.push({
      id: 'user_note',
      role: 'user',
      text: 'Create a design system for my shop',
      at: Date.now(),
    });
    expect(canCreateBrandDirection(requested)).toBe(true);
  });

  it('derives accessible accent family on direct setTokens without replace', () => {
    const doc = createProject();
    const gold = `#${(0xeab308).toString(16)}`;
    const black = `#${(0x000000).toString(16).padStart(6, '0')}`;
    const result = applyOps([{ op: 'setTokens', patch: { brand_color: gold } }], doc, {
      source: 'user',
    });
    const light = result.doc.tokens.openuiTheme.light_colors;
    expect(light.openui_accent).toBe(gold);
    expect(light.openui_accent_subtle).not.toBe(
      MUSEWARE_DEFAULT_THEME.openuiTheme.light_colors.openui_accent_subtle,
    );
    expect(contrastRatio(light.openui_text_on_accent, gold)).toBeGreaterThanOrEqual(4.5);
    expect(light.openui_text_on_accent).toBe(black);
    expect(light.openui_accent_pressed).not.toBe(gold);
  });
});
