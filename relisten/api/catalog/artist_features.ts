// Generated from RelistenNet/RelistenApi OpenAPI ArtistResource.features.x-feature-flags.
// Regenerate there: dotnet run --project tools/generate-artist-features; format after copying.

export const ArtistFeature = {
  Descriptions: '1',
  Eras: '2',
  MultipleSources: '4',
  Reviews: '8',
  Ratings: '16',
  Tours: '32',
  TaperNotes: '64',
  SourceInformation: '128',
  Sets: '256',
  PerShowVenues: '512',
  PerSourceVenues: '1024',
  VenueCoords: '2048',
  Songs: '4096',
  Years: '8192',
  TrackMd5s: '16384',
  ReviewTitles: '32768',
  JamCharts: '65536',
  SetlistDataIncomplete: '131072',
  TrackNames: '262144',
  VenuePastNames: '524288',
  ReviewsHaveRatings: '1048576',
  TrackDurations: '2097152',
  CanHaveFlac: '4194304',
  Normalization: '8388608',
} as const;

export type ArtistFeature = (typeof ArtistFeature)[keyof typeof ArtistFeature];

/** Checks one named feature without losing precision or expanding the wire mask. */
export function hasArtistFeature(
  artist: { readonly features: string },
  feature: ArtistFeature
): boolean {
  return (BigInt(artist.features) & BigInt(feature)) !== BigInt(0);
}
