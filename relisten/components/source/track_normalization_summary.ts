interface TrackNormalizationSummarySong {
  name: string;
}

interface TrackNormalizationSummaryPart {
  text?: string | null;
  state: string;
  segueAfter: boolean;
  song?: TrackNormalizationSummarySong | null;
}

interface TrackNormalizationSummaryInput {
  state: string;
  parts: Iterable<TrackNormalizationSummaryPart>;
}

function partLabel(part: TrackNormalizationSummaryPart) {
  if (part.state === 'matched' && part.song) {
    return part.song.name;
  }

  const text = part.text?.trim() || 'Unlabeled part';
  if (part.state === 'non_song') {
    return `${text} (non-song)`;
  }

  return `${text} (unresolved)`;
}

/** A compact, ordered interpretation that never replaces the imported track title. */
export function trackNormalizationSummary(
  normalization?: TrackNormalizationSummaryInput | null
): string | null {
  if (!normalization || normalization.state === 'unavailable') {
    return null;
  }

  const parts = Array.from(normalization.parts);
  if (parts.length === 0) return null;

  let summary = partLabel(parts[0]);
  for (let index = 1; index < parts.length; index += 1) {
    const previousPart = parts[index - 1];
    summary += previousPart.segueAfter ? ' → ' : ' · ';
    summary += partLabel(parts[index]);
  }

  const label = normalization.state === 'partial' ? 'Partial interpretation' : 'Interpreted';
  return `${label}: ${summary}`;
}
