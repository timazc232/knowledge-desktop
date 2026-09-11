import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

type Unsub = () => void

const api = {
  version: '0.1.0-mvp',

  // Knowledge
  knowledgeCreate: (payload: unknown) => ipcRenderer.invoke('knowledge:create', payload),
  knowledgeUpdate: (payload: unknown) => ipcRenderer.invoke('knowledge:update', payload),
  knowledgeDelete: (payload: unknown) => ipcRenderer.invoke('knowledge:delete', payload),
  knowledgeGet: (payload: unknown) => ipcRenderer.invoke('knowledge:get', payload),
  knowledgeList: (payload?: unknown) => ipcRenderer.invoke('knowledge:list', payload ?? {}),
  knowledgeSearch: (payload: unknown) => ipcRenderer.invoke('knowledge:search', payload),
  knowledgeRetryEmbed: (payload: unknown) =>
    ipcRenderer.invoke('knowledge:retryEmbed', payload),
  onIngestProgress: (cb: (ev: unknown) => void): Unsub => {
    const listener = (_: IpcRendererEvent, data: unknown) => cb(data)
    ipcRenderer.on('knowledge:onIngestProgress', listener)
    return () => ipcRenderer.removeListener('knowledge:onIngestProgress', listener)
  },

  // Clip
  clipFromSelection: (payload: unknown) =>
    ipcRenderer.invoke('clip:fromSelection', payload),
  clipFromClipboard: () => ipcRenderer.invoke('clip:fromClipboard', {}),
  onClipDialog: (cb: (ev: unknown) => void): Unsub => {
    const listener = (_: IpcRendererEvent, data: unknown) => cb(data)
    ipcRenderer.on('clip:showDialog', listener)
    return () => ipcRenderer.removeListener('clip:showDialog', listener)
  },

  // Tabs
  tabsList: () => ipcRenderer.invoke('tabs:list'),
  tabsCreate: (payload?: unknown) => ipcRenderer.invoke('tabs:create', payload ?? {}),
  tabsClose: (payload: unknown) => ipcRenderer.invoke('tabs:close', payload),
  tabsActivate: (payload: unknown) => ipcRenderer.invoke('tabs:activate', payload),
  tabsNavigate: (payload: unknown) => ipcRenderer.invoke('tabs:navigate', payload),
  tabsBack: (payload: unknown) => ipcRenderer.invoke('tabs:back', payload),
  tabsForward: (payload: unknown) => ipcRenderer.invoke('tabs:forward', payload),
  tabsReload: (payload: unknown) => ipcRenderer.invoke('tabs:reload', payload),
  tabsSetBounds: (payload: unknown) => ipcRenderer.invoke('tabs:setBounds', payload),
  tabsHide: () => ipcRenderer.invoke('tabs:hide'),
  tabsShow: () => ipcRenderer.invoke('tabs:show'),
  tabsSetPinned: (payload: unknown) => ipcRenderer.invoke('tabs:setPinned', payload),
  tabsListPinned: () => ipcRenderer.invoke('tabs:listPinned'),
  onTabUpdated: (cb: (ev: unknown) => void): Unsub => {
    const listener = (_: IpcRendererEvent, data: unknown) => cb(data)
    ipcRenderer.on('tabs:onUpdated', listener)
    return () => ipcRenderer.removeListener('tabs:onUpdated', listener)
  },

  // Bookmarks
  bookmarksList: () => ipcRenderer.invoke('bookmarks:list'),
  bookmarksCreate: (payload: unknown) => ipcRenderer.invoke('bookmarks:create', payload),
  bookmarksUpdate: (payload: unknown) => ipcRenderer.invoke('bookmarks:update', payload),
  bookmarksDelete: (payload: unknown) => ipcRenderer.invoke('bookmarks:delete', payload),
  bookmarksReorder: (payload: unknown) => ipcRenderer.invoke('bookmarks:reorder', payload),

  // Backup
  backupExport: (payload?: unknown) => ipcRenderer.invoke('backup:export', payload ?? {}),
  backupImport: (payload?: unknown) => ipcRenderer.invoke('backup:import', payload ?? {}),

  // Settings
  settingsGet: () => ipcRenderer.invoke('settings:get'),
  settingsSet: (payload: unknown) => ipcRenderer.invoke('settings:set', payload),
  settingsTestEmbedding: () => ipcRenderer.invoke('settings:testEmbedding'),
}

contextBridge.exposeInMainWorld('api', api)

export type DesktopApi = typeof api
