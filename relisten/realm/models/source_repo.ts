import { Repository } from '../repository';
import { Source } from './source';

export const sourceRepo = new Repository(Source);

// TODO: add endpoint to Relisten to fetch a FullShow by the source id
// Store last N API request URLs statically and request times to prevent refetching
