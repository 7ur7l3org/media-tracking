import LightningFS from 'lightning-fs';

export const fs = new LightningFS('repoFS');
export const pfs = fs.promises;
export const repoDir = '/repo';
