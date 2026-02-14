import { CarPlay, TabBarTemplate, TabBarTemplates } from '@g4rb4g3/react-native-carplay';
import { Realm } from '@realm/react';
import { RelistenApiClient } from '@/relisten/api/client';
import { RelistenCarPlayContext } from '@/relisten/carplay/relisten_car_play_context';
import { carplay_logger } from '@/relisten/carplay/carplay_logger';
import { createArtistsListTemplate } from '@/relisten/carplay/artists';
import { createNowPlayingTemplate, createQueueListTemplate } from '@/relisten/carplay/queue';
import { RelistenPlayer } from '@/relisten/player/relisten_player';
import { createLibraryTemplate, createRecentTemplate } from '@/relisten/carplay/library';

export function setupCarPlay(realm: Realm, apiClient: RelistenApiClient) {
  carplay_logger.info('Setting up CarPlay');

  const player = RelistenPlayer.DEFAULT_INSTANCE;
  const ctx = new RelistenCarPlayContext(realm, apiClient, player);
  carplay_logger.info('CarPlay context initialized');

  const queueTemplateBuilder = () =>
    createQueueListTemplate(ctx, {
      title: 'Now Playing',
      tabTitle: 'Queue',
      includeNowPlayingRow: true,
    });

  const nowPlayingTemplate = createNowPlayingTemplate(ctx, queueTemplateBuilder);
  let showNowPlayingInFlight: Promise<void> | null = null;

  const ensureNowPlayingVisible = () => {
    if (showNowPlayingInFlight) {
      return;
    }

    showNowPlayingInFlight = (async () => {
      const topTemplateId = await CarPlay.getTopTemplate();

      if (topTemplateId === nowPlayingTemplate.id || ctx.nowPlayingVisible) {
        carplay_logger.info('Now Playing already visible');
        return;
      }

      carplay_logger.info('Pushing Now Playing template', { topTemplateId });
      CarPlay.pushTemplate(nowPlayingTemplate, true);
    })()
      .catch((error) => {
        carplay_logger.error('Failed to show Now Playing template', error);
      })
      .finally(() => {
        showNowPlayingInFlight = null;
      });
  };
  ctx.showNowPlaying = ensureNowPlayingVisible;

  CarPlay.enableNowPlaying();
  carplay_logger.info('Enabled system Now Playing');

  const browseTemplate = createArtistsListTemplate(ctx, 'browse');
  const libraryTemplate = createLibraryTemplate(ctx);
  const recentTemplate = createRecentTemplate(ctx);
  const queueTemplate = queueTemplateBuilder();

  const tabBar = new TabBarTemplate({
    title: 'Relisten',
    templates: [browseTemplate, recentTemplate, libraryTemplate, queueTemplate],
    onTemplateSelect(
      template: TabBarTemplates | undefined,
      e: { templateId: string; selectedTemplateId: string }
    ) {
      carplay_logger.info('onTemplateSelect', e, template?.id);
    },
  });

  CarPlay.setRootTemplate(tabBar, true);

  const disconnectHandler = () => ctx.tearDown();
  CarPlay.registerOnDisconnect(disconnectHandler);

  return () => {
    CarPlay.unregisterOnDisconnect(disconnectHandler);
    ctx.tearDown();
  };
}
