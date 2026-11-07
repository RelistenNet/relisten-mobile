import { type ComponentType } from 'react';

// Audio spectrum capture and rendering are currently implemented only on iOS.
export const PlayerAudioVisualizer: ComponentType<{ active?: boolean; compact?: boolean }> = () =>
  null;
