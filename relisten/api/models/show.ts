import { components } from '../schema';
import { Popularity } from './artist';

export type Show = components['schemas']['Show'] & {
  popularity?: Popularity;
};
export type ShowWithSources = components['schemas']['ShowWithSources'] & {
  popularity?: Popularity;
};
