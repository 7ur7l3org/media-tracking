// View layer – creates HTML, listens to backend:changed
import { read }        from '../../core/store/backend.js';
import { setRating }   from '../domain/RatingDomain.js';

/**
 * A DOM element that shows / updates the rating for `id`.
 * @param {string} id
 * @returns {HTMLElement}
 */
export function RatingPanel(id) {
  const root = document.createElement('div');
  root.className = 'rating-panel';

  async function render() {
    const db = await read();  // deep-clone, read-only
    const value = db.media[id]?.rating || 0;

    root.innerHTML = '';
    for (let i = 1; i <= 5; i++) {
      const btn = document.createElement('button');
      btn.textContent = i <= value ? '★' : '☆';
      btn.onclick = () => setRating(id, i).catch(alert);
      root.appendChild(btn);
    }
  }

  render();                                  // initial paint
  window.addEventListener('backend:changed', render);
  return root;
}
