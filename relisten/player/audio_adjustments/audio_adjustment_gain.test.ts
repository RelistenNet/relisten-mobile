/// <reference types="node" />
import { afterEach, describe, expect, it, vi } from 'vitest';
import Realm from 'realm';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  AudioAdjustmentSettings,
  AudioAdjustmentPresetModel,
} from '@/relisten/realm/models/audio_adjustment_settings';
import { AudioAdjustmentStore } from './audio_adjustment_store';
import { normalizeAudioAdjustmentConfiguration } from './audio_adjustment_types';
import {
  decibelsToSliderPosition,
  sliderPositionToDecibels,
} from './audio_adjustment_slider_scale';

vi.mock('expo-crypto', () => ({ randomUUID: () => 'gain-test-preset' }));

describe('signed volume gain', () => {
  it('keeps existing attenuation, defaults to neutral, and bounds boost', () => {
    for (const [input, expected] of [
      [-30, -30],
      [-12, -12],
      [0, 0],
      [6, 6],
      [12, 12],
      [20, 12],
      [-50, -30],
      [NaN, 0],
      [Infinity, 0],
    ]) {
      expect(
        normalizeAudioAdjustmentConfiguration({ extraVolumeReductionDb: input })
          .extraVolumeReductionDb
      ).toBe(expected);
    }
    expect(normalizeAudioAdjustmentConfiguration({}).extraVolumeReductionDb).toBe(0);
  });

  it('centers zero and round-trips every integer gain across unequal ranges', () => {
    expect(decibelsToSliderPosition(0, -30, 12, true)).toBe(0.5);
    expect(sliderPositionToDecibels(0, -30, 12, true)).toBe(-30);
    expect(sliderPositionToDecibels(1, -30, 12, true)).toBe(12);
    for (let gain = -30; gain <= 12; gain++) {
      expect(
        sliderPositionToDecibels(decibelsToSliderPosition(gain, -30, 12, true), -30, 12, true)
      ).toBe(gain);
    }
    expect(sliderPositionToDecibels(-1, -30, 12, true)).toBe(-30);
    expect(sliderPositionToDecibels(2, -30, 12, true)).toBe(12);
  });

  it('preserves the linear EQ band scale', () => {
    for (let gain = -12; gain <= 12; gain++) {
      expect(sliderPositionToDecibels(decibelsToSliderPosition(gain, -12, 12), -12, 12)).toBe(gain);
    }
  });
});

describe('gain persistence and presets', () => {
  let realm: Realm;
  let directory: string;
  afterEach(() => {
    realm?.close();
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  it('round-trips legacy cuts and new boosts in Realm, and resets to neutral without turning EQ off', () => {
    directory = mkdtempSync(join(tmpdir(), 'relisten-gain-test-'));
    realm = new Realm({
      inMemory: true,
      path: join(directory, 'settings.realm'),
      schema: [AudioAdjustmentSettings, AudioAdjustmentPresetModel],
    });
    const store = new AudioAdjustmentStore(realm);
    store.setConfiguration(
      normalizeAudioAdjustmentConfiguration({
        enabled: true,
        extraVolumeReductionDb: -18,
      })
    );
    expect(new AudioAdjustmentStore(realm).currentConfiguration().extraVolumeReductionDb).toBe(-18);
    const boosted = normalizeAudioAdjustmentConfiguration({
      enabled: true,
      extraVolumeReductionDb: 6,
    });
    const preset = store.savePreset('Quiet recording', boosted);
    expect(store.preset(preset.id)?.extraVolumeReductionDb).toBe(6);
    store.reset();
    expect(store.currentConfiguration()).toMatchObject({
      enabled: true,
      extraVolumeReductionDb: 0,
      bandGainsDb: Array(10).fill(0),
    });
    store.selectPreset(preset);
    expect(new AudioAdjustmentStore(realm).currentConfiguration().extraVolumeReductionDb).toBe(6);
    store.updatePreset(preset.id, { ...boosted, extraVolumeReductionDb: 12 });
    expect(store.preset(preset.id)?.extraVolumeReductionDb).toBe(12);
  });
});
