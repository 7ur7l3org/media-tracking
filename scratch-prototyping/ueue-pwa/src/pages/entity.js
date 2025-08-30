import { RatingPanel } from '../features/ratings/components/RatingPanel.js';
import { scheduleSync } from '../core/sync/service.js';

const qid = new URL(location.href).searchParams.get('id') || 'Q42';
document.body.innerHTML = `<h1>Entity ${qid}</h1>`;
document.body.appendChild( RatingPanel(qid) );

scheduleSync();   // kick off first (no-op) sync
