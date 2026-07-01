import Flex from '@/relisten/components/flex';
import { RelistenButton } from '@/relisten/components/relisten_button';
import { RowWithAction } from '@/relisten/components/row_with_action';
import { SectionHeader } from '@/relisten/components/section_header';
import { audioAdjustmentNative } from '@/relisten/player/audio_adjustments/audio_adjustment_native';
import { Link } from 'expo-router';

export function AudioAdjustmentsSettingsSection() {
  if (!audioAdjustmentNative.capabilities().supported) {
    return null;
  }

  return (
    <Flex column>
      <SectionHeader title="Audio" />
      <Flex column className="gap-4 p-4 pr-8">
        <RowWithAction
          title="Audio Adjustments"
          subtitle="Use equalizer presets or make Relisten quieter than the system volume allows."
        >
          <Link href="/relisten/audio-adjustments" asChild>
            <RelistenButton intent="outline">Open</RelistenButton>
          </Link>
        </RowWithAction>
      </Flex>
    </Flex>
  );
}
