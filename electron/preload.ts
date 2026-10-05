import { contextBridge, ipcRenderer } from 'electron';
async function invoke(name: string, ...args: unknown[]) { const r = await ipcRenderer.invoke(name, ...args); if (!r.ok) throw new Error(r.error); return r.value; }
contextBridge.exposeInMainWorld('walnut', {
  settings: () => invoke('settings'), saveSettings: (s: unknown) => invoke('save-settings', s),
  testConnection: () => invoke('test-connection'), analyze: (i: unknown) => invoke('analyze', i),
  cancel: () => invoke('cancel'), history: () => invoke('history'),
  exportReport: (id: string, format: string) => invoke('export-report', id, format),
  deleteReport: (id: string) => invoke('delete-report', id), sample: () => invoke('sample')
});
