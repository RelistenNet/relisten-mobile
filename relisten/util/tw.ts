// import { ClassValue, clsx } from 'clsx';
import { ClassNameValue, twMerge } from 'tailwind-merge';
import clsx from 'clsx';

export function tw(...inputs: ClassNameValue[]) {
  return clsx(inputs);
}
