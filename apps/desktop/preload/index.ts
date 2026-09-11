import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('knowledgeDesktop', {
  version: '0.1.0-m0',
  ping: () => 'pong',
})
