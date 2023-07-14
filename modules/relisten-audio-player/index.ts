import { EventEmitter, NativeModulesProxy, Subscription } from 'expo-modules-core';

// Import the native module. On web, it will be resolved to RelistenAudioPlayer.web.ts
// and on native platforms to RelistenAudioPlayer.ts
import RelistenAudioPlayerModule from './src/RelistenAudioPlayerModule';
import { ChangeEventPayload, RelistenAudioPlayerViewProps } from './src/RelistenAudioPlayer.types';

export async function play() {
  return RelistenAudioPlayerModule.play();
}

export async function setValueAsync(value: string) {
  return await RelistenAudioPlayerModule.setValueAsync(value);
}

const emitter = new EventEmitter(
  RelistenAudioPlayerModule ?? NativeModulesProxy.RelistenAudioPlayer
);

export function addChangeListener(listener: (event: ChangeEventPayload) => void): Subscription {
  return emitter.addListener<ChangeEventPayload>('onChange', listener);
}

export { RelistenAudioPlayerViewProps, ChangeEventPayload };
