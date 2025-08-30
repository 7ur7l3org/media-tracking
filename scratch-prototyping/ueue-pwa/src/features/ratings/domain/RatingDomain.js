// Pure domain helper – no DOM, no LightningFS
import { mutate }      from '../../core/store/backend.js';
import { scheduleSync } from '../../core/sync/service.js';

/**
 * Persist a 1-to-5 star rating for the given media ID.
 * @param {string} id   arbitrary media key (Q-id or full URL)
 * @param {1|2|3|4|5} stars
 */
export async function setRating(id, stars) {
  if (![1, 2, 3, 4, 5].includes(stars))
    throw new Error('stars must be 1-5');

  await mutate(db => {
    const entry = db.media[id] ??= {};
    entry.rating = stars;
  });

  scheduleSync();      // queue pull-then-push (currently no-op)
}
