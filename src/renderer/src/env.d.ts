import type { ZebraApi } from '@shared/api'

declare global {
  interface Window {
    api: ZebraApi
  }
}

export {}
