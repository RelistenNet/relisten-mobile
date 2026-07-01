import { audioAdjustmentNative } from '@/relisten/player/audio_adjustments/audio_adjustment_native';
import { useAudioAdjustmentConfiguration } from '@/relisten/player/audio_adjustments/audio_adjustment_repo';
import { useAudioAdjustmentStore } from '@/relisten/realm/root_services';
import {
  normalizeAudioAdjustmentConfiguration,
  type AudioAdjustmentConfiguration,
  type AudioAdjustmentPreset,
} from '@/relisten/player/audio_adjustments/audio_adjustment_types';
import { router } from 'expo-router';
import { AppState, Alert, type AppStateStatus } from 'react-native';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

const PREVIEW_INTERVAL_MS = 50;
const PERSISTENCE_DEBOUNCE_MS = 250;

type AudioAdjustmentEditingContextValue = {
  activePresetId?: string;
  configuration: AudioAdjustmentConfiguration;
  deletePreset: (id: string) => void;
  dirty: boolean;
  finishAdjustment: () => void;
  requestClose: () => void;
  reset: () => void;
  selectPreset: (preset: AudioAdjustmentPreset) => void;
  setBandGain: (index: number, gainDb: number) => void;
  setEnabled: (enabled: boolean) => void;
  setExtraVolumeReduction: (reductionDb: number) => void;
};

const AudioAdjustmentEditingContext = createContext<AudioAdjustmentEditingContextValue | null>(
  null
);

export function AudioAdjustmentEditingProvider({ children }: PropsWithChildren) {
  const store = useAudioAdjustmentStore();
  const persistedConfiguration = useAudioAdjustmentConfiguration() ?? store.currentConfiguration();
  const initialPresetId = store.currentSettings().activePresetId;
  const [configuration, setConfiguration] = useState(persistedConfiguration);
  const [activePresetId, setActivePresetId] = useState<string | undefined>(initialPresetId);
  const [dirty, setDirty] = useState(false);
  const baseConfigurationRef = useRef(persistedConfiguration);
  const basePresetIdRef = useRef<string | undefined>(initialPresetId);
  const activePresetIdRef = useRef<string | undefined>(initialPresetId);
  const latestConfigurationRef = useRef(persistedConfiguration);
  const persistenceTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastPreviewAtRef = useRef(0);

  const cancelDraftPersistence = useCallback(() => {
    if (!persistenceTimerRef.current) {
      return;
    }

    clearTimeout(persistenceTimerRef.current);
    persistenceTimerRef.current = undefined;
  }, []);

  const applyNativePreview = useCallback((next: AudioAdjustmentConfiguration) => {
    if (!audioAdjustmentNative.capabilities().supported) {
      return;
    }

    const now = Date.now();
    const remaining = PREVIEW_INTERVAL_MS - (now - lastPreviewAtRef.current);
    if (remaining <= 0) {
      if (previewTimerRef.current) {
        clearTimeout(previewTimerRef.current);
        previewTimerRef.current = undefined;
      }
      lastPreviewAtRef.current = now;
      audioAdjustmentNative.setConfiguration(next);
      return;
    }

    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
    }
    previewTimerRef.current = setTimeout(() => {
      lastPreviewAtRef.current = Date.now();
      audioAdjustmentNative.setConfiguration(latestConfigurationRef.current);
      previewTimerRef.current = undefined;
    }, remaining);
  }, []);

  const persistDraft = useCallback(
    (next?: AudioAdjustmentConfiguration) => {
      cancelDraftPersistence();
      store.setConfiguration(next ?? latestConfigurationRef.current, activePresetIdRef.current);
    },
    [cancelDraftPersistence, store]
  );

  const scheduleDraftPersistence = useCallback(
    (next: AudioAdjustmentConfiguration) => {
      if (persistenceTimerRef.current) {
        clearTimeout(persistenceTimerRef.current);
      }
      persistenceTimerRef.current = setTimeout(() => {
        store.setConfiguration(next, null);
        persistenceTimerRef.current = undefined;
      }, PERSISTENCE_DEBOUNCE_MS);
    },
    [store]
  );

  const applyManualAdjustment = useCallback(
    (next: AudioAdjustmentConfiguration) => {
      const normalized = normalizeAudioAdjustmentConfiguration(next);
      latestConfigurationRef.current = normalized;
      activePresetIdRef.current = undefined;
      setConfiguration(normalized);
      setActivePresetId(undefined);
      setDirty(true);
      applyNativePreview(normalized);
      scheduleDraftPersistence(normalized);
    },
    [applyNativePreview, scheduleDraftPersistence]
  );

  const makePresetName = useCallback((onSave: (name: string) => void) => {
    Alert.prompt(
      'Save Preset',
      'Preset names may be reused.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: (name?: string) => {
            const presetName = name ?? '';
            try {
              onSave(presetName);
              router.back();
            } catch (error) {
              Alert.alert('Could Not Save Preset', String(error));
            }
          },
        },
      ],
      'plain-text'
    );
  }, []);

  const requestClose = useCallback(() => {
    if (!dirty) {
      persistDraft();
      router.back();
      return;
    }

    const basePresetId = basePresetIdRef.current;
    const basePreset = store.preset(basePresetId);
    const discard = () => {
      const restored = {
        ...baseConfigurationRef.current,
        enabled: latestConfigurationRef.current.enabled,
      };
      cancelDraftPersistence();
      latestConfigurationRef.current = restored;
      if (previewTimerRef.current) {
        clearTimeout(previewTimerRef.current);
        previewTimerRef.current = undefined;
      }
      store.setConfiguration(restored, basePresetId);
      audioAdjustmentNative.setConfiguration(restored);
      router.back();
    };
    const saveAsNew = () =>
      makePresetName((name) => {
        cancelDraftPersistence();
        store.savePreset(name, latestConfigurationRef.current);
      });

    if (basePresetId?.startsWith('custom:') && basePreset) {
      Alert.alert('Save Preset Changes?', `Save changes to “${basePreset.name}”?`, [
        { text: 'Discard', style: 'destructive', onPress: discard },
        { text: 'Save as New…', onPress: saveAsNew },
        {
          text: 'Update Preset',
          onPress: () => {
            cancelDraftPersistence();
            store.updatePreset(basePresetId, latestConfigurationRef.current);
            router.back();
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }

    Alert.alert('Keep Custom Adjustments?', 'Save these changes before closing?', [
      { text: 'Discard', style: 'destructive', onPress: discard },
      {
        text: 'Keep as Custom',
        onPress: () => {
          cancelDraftPersistence();
          store.setConfiguration(latestConfigurationRef.current, null);
          router.back();
        },
      },
      { text: 'Save as New…', onPress: saveAsNew },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [cancelDraftPersistence, dirty, makePresetName, persistDraft, store]);

  const selectPreset = useCallback(
    (preset: AudioAdjustmentPreset) => {
      cancelDraftPersistence();
      const next = store.selectPreset(preset);
      latestConfigurationRef.current = next;
      baseConfigurationRef.current = next;
      basePresetIdRef.current = preset.id;
      activePresetIdRef.current = preset.id;
      setConfiguration(next);
      setActivePresetId(preset.id);
      setDirty(false);
      applyNativePreview(next);
    },
    [applyNativePreview, cancelDraftPersistence, store]
  );

  const setEnabled = useCallback(
    (enabled: boolean) => {
      const next = { ...latestConfigurationRef.current, enabled };
      latestConfigurationRef.current = next;
      baseConfigurationRef.current = { ...baseConfigurationRef.current, enabled };
      setConfiguration(next);
      persistDraft(next);
      applyNativePreview(next);
    },
    [applyNativePreview, persistDraft]
  );

  const reset = useCallback(() => {
    cancelDraftPersistence();
    const next = store.reset();
    const presetId = store.currentSettings().activePresetId;
    latestConfigurationRef.current = next;
    baseConfigurationRef.current = next;
    basePresetIdRef.current = presetId;
    activePresetIdRef.current = presetId;
    setConfiguration(next);
    setActivePresetId(presetId);
    setDirty(false);
    applyNativePreview(next);
  }, [applyNativePreview, cancelDraftPersistence, store]);

  const finishAdjustment = useCallback(() => {
    persistDraft(latestConfigurationRef.current);
  }, [persistDraft]);

  const deletePreset = useCallback(
    (id: string) => {
      store.deletePreset(id);
      if (basePresetIdRef.current === id) {
        basePresetIdRef.current = undefined;
      }
      if (activePresetIdRef.current !== id) {
        return;
      }

      activePresetIdRef.current = undefined;
      basePresetIdRef.current = undefined;
      setActivePresetId(undefined);
    },
    [store]
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state !== 'active') {
        persistDraft(latestConfigurationRef.current);
      }
    });

    return () => {
      subscription.remove();
      if (persistenceTimerRef.current) clearTimeout(persistenceTimerRef.current);
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    };
  }, [persistDraft]);

  const value = useMemo<AudioAdjustmentEditingContextValue>(
    () => ({
      activePresetId,
      configuration,
      deletePreset,
      dirty,
      finishAdjustment,
      requestClose,
      reset,
      selectPreset,
      setBandGain: (index, gainDb) => {
        const gains = [...latestConfigurationRef.current.bandGainsDb];
        gains[index] = gainDb;
        applyManualAdjustment({
          ...latestConfigurationRef.current,
          bandGainsDb: gains as AudioAdjustmentConfiguration['bandGainsDb'],
        });
      },
      setEnabled,
      setExtraVolumeReduction: (extraVolumeReductionDb) =>
        applyManualAdjustment({ ...latestConfigurationRef.current, extraVolumeReductionDb }),
    }),
    [
      activePresetId,
      applyManualAdjustment,
      configuration,
      deletePreset,
      dirty,
      finishAdjustment,
      requestClose,
      reset,
      selectPreset,
      setEnabled,
    ]
  );

  return (
    <AudioAdjustmentEditingContext.Provider value={value}>
      {children}
    </AudioAdjustmentEditingContext.Provider>
  );
}

export function useAudioAdjustmentEditing() {
  const context = useContext(AudioAdjustmentEditingContext);
  if (!context) {
    throw new Error('AudioAdjustmentEditingProvider is required');
  }
  return context;
}
