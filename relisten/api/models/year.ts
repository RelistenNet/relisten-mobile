import { components } from '../schema';
import { Popularity } from './artist';

export type Year = components['schemas']['Year'] & { popularity?: Popularity };
export type YearWithShows = components['schemas']['YearWithShows'] & { popularity?: Popularity };
