import { Repository } from '@/relisten/realm/repository';
import { Show } from '@/relisten/realm/models/show';

// Keep the Realm persistence primitive independent of the hooks and network
// behavior in show_repo. Background catalog hydration runs while root services
// are being constructed, so importing the hook module there creates a cycle.
export const showRepo = new Repository(Show);
