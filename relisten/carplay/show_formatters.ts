import { Show } from '@/relisten/realm/models/show';
import { Source } from '@/relisten/realm/models/source';
import { CarPlayScope } from '@/relisten/carplay/scope';
import { catalogObjectsForScope } from '@/relisten/carplay/catalog_scope';

export function formatShowDetail(show: Show, scope: CarPlayScope) {
  const scopedShow = catalogObjectsForScope(scope, [show], 'carplay.formatter.show')[0];
  if (!scopedShow) return '';

  const venueObject = scopedShow.venue
    ? catalogObjectsForScope(scope, [scopedShow.venue], 'carplay.formatter.venue')[0]
    : undefined;
  const venue = venueObject?.name;
  const location = venueObject?.location;
  const locationText = [venue, location].filter(Boolean).join(' • ');
  const rating = scopedShow.avgRating ? `${scopedShow.humanizedAvgRating()}★` : undefined;
  const duration = scopedShow.avgDuration ? scopedShow.humanizedAvgDuration() : undefined;
  const parts = [locationText, rating, duration].filter(Boolean);

  return parts.join(' • ');
}

export function formatSourceDetail(source: Source, scope: CarPlayScope) {
  const scopedSource = catalogObjectsForScope(scope, [source], 'carplay.formatter.source')[0];
  if (!scopedSource) return '';

  const rating = scopedSource.avgRating ? `${scopedSource.humanizedAvgRating()}★` : undefined;
  const duration = scopedSource.duration ? scopedSource.humanizedDuration() : undefined;
  const type = scopedSource.isSoundboard ? 'SBD' : undefined;
  const taper = scopedSource.taper;
  const transferrer = scopedSource.transferrer;
  const taperInfo = [taper, transferrer].filter(Boolean).join(' / ');

  return [type, rating, duration, taperInfo].filter(Boolean).join(' • ');
}
