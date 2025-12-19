import { Show } from '@/relisten/realm/models/show';
import { Source } from '@/relisten/realm/models/source';

export function formatShowDetail(show: Show) {
  const venue = show.venue?.name;
  const location = show.venue?.location;
  const locationText = [venue, location].filter(Boolean).join(' • ');
  const rating = show.avgRating ? `${show.humanizedAvgRating()}★` : undefined;
  const duration = show.avgDuration ? show.humanizedAvgDuration() : undefined;
  const parts = [locationText, rating, duration].filter(Boolean);

  return parts.join(' • ');
}

export function formatSourceDetail(source: Source) {
  const rating = source.avgRating ? `${source.humanizedAvgRating()}★` : undefined;
  const duration = source.duration ? source.humanizedDuration() : undefined;
  const type = source.isSoundboard ? 'SBD' : undefined;
  const taper = source.taper;
  const transferrer = source.transferrer;
  const taperInfo = [taper, transferrer].filter(Boolean).join(' / ');

  return [type, rating, duration, taperInfo].filter(Boolean).join(' • ');
}
