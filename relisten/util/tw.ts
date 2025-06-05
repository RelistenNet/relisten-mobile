import { ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function tw(...inputs: ClassValue[]) {
  return clsx(inputs);
}
