/// <reference types="vite/client" />

type Unsub = () => void

interface DesktopApi {
  version: string
  knowledgeCreate: (payload: unknown) => Promise<any>
  knowledgeUpdate: (payload: unknown) => Promise<any>
  knowledgeDelete: (payload: unknown) => Promise<any>
  knowledgeGet: (payload: unknown) => Promise<any>
  knowledgeList: (payload?: unknown) => Promise<any[]>
  knowledgeSearch: (payload: unknown) => Promise<{ items: any[]; mode: string }>
  knowledgeRetryEmbed: (payload: unknown) => Promise<number>
  onIngestProgress: (cb: (ev: unknown) => void) => Unsub
  clipFromSelection: (payload: unknown) => Promise<any>
  clipFromClipboard: () => Promise<any>
  onClipDialog: (cb: (ev: unknown) => void) => Unsub
  tabsList: () => Promise<any[]>
  tabsCreate: (payload?: unknown) => Promise<any>
  tabsClose: (payload: unknown) => Promise<any>
  tabsActivate: (payload: unknown) => Promise<any>
  tabsNavigate: (payload: unknown) => Promise<any>
  tabsBack: (payload: unknown) => Promise<void>
  tabsForward: (payload: unknown) => Promise<void>
  tabsReload: (payload: unknown) => Promise<void>
  tabsSetBounds: (payload: unknown) => Promise<void>
  tabsHide: () => Promise<void>
  tabsShow: () => Promise<void>
  tabsSetPinned: (payload: unknown) => Promise<{ ok: boolean; tab?: any; error?: string }>
  tabsListPinned: () => Promise<any[]>
  onTabUpdated: (cb: (ev: unknown) => void) => Unsub
  bookmarksList: () => Promise<any[]>
  bookmarksCreate: (payload: unknown) => Promise<any>
  bookmarksUpdate: (payload: unknown) => Promise<any>
  bookmarksDelete: (payload: unknown) => Promise<any>
  bookmarksReorder: (payload: unknown) => Promise<any[]>
  backupExport: (payload?: unknown) => Promise<any>
  backupImport: (payload?: unknown) => Promise<any>
  settingsGet: () => Promise<any>
  settingsSet: (payload: unknown) => Promise<any>
  settingsTestEmbedding: () => Promise<{ ok: boolean; dim?: number; error?: string }>
}

interface Window {
  api: DesktopApi
}
