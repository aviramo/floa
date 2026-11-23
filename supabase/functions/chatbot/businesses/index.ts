import type { Business } from '../types.ts';
import { harpatka } from './harpatka/index.ts';

// A new business is one folder next to harpatka/ and one line here.
export const BUSINESSES: Record<string, Business<any>> = { harpatka };
