delete process.env.DEV_DEFAULT_PLAN;
delete process.env.SUPPORT_EMAIL;
delete process.env.PRIVACY_EMAIL;
delete process.env.ABUSE_EMAIL;
delete process.env.LEGAL_EMAIL;
delete process.env.BILLING_EMAIL;
delete process.env.COMPANY_LEGAL_NAME;
delete process.env.COMPANY_ADDRESS;
delete process.env.COMPANY_COUNTRY;
delete process.env.COMPANY_REG_NUMBER;
delete process.env.COMPANY_WEBSITE;
delete process.env.SOCIAL_X_URL;
delete process.env.SOCIAL_GITHUB_URL;
delete process.env.BILLING_ENABLED;
process.env.CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || 'test_cloudinary_cloud';
process.env.CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || 'test_cloudinary_key';
process.env.CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || 'test_cloudinary_secret';

import '@testing-library/jest-dom'
import { TextEncoder, TextDecoder } from 'util'
import nodeCrypto from 'crypto'

if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = TextEncoder
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  global.TextDecoder = TextDecoder as any
}

if (typeof globalThis.crypto === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(globalThis as any).crypto = nodeCrypto.webcrypto
} else if (typeof globalThis.crypto.randomUUID !== 'function') {
  globalThis.crypto.randomUUID = () => nodeCrypto.randomUUID()
}

if (typeof global.Request === 'undefined') {
  class MockHeaders {
    private map = new Map<string, string>()
    constructor(init?: any) {
      if (init) {
        if (typeof init[Symbol.iterator] === 'function') {
          for (const [k, v] of init) this.map.set(k.toLowerCase(), String(v))
        } else if (typeof init === 'object') {
          for (const [k, v] of Object.entries(init)) {
            this.map.set(k.toLowerCase(), String(v))
          }
        }
      }
    }
    get(name: string) {
      return this.map.get(name.toLowerCase()) ?? null
    }
    set(name: string, value: string) {
      this.map.set(name.toLowerCase(), value)
    }
    append(name: string, value: string) {
      const key = name.toLowerCase()
      const existing = this.map.get(key)
      this.map.set(key, existing ? `${existing}, ${value}` : value)
    }
    delete(name: string) {
      this.map.delete(name.toLowerCase())
    }
    has(name: string) {
      return this.map.has(name.toLowerCase())
    }
    getSetCookie() {
      const setCookie = this.map.get('set-cookie')
      return setCookie ? [setCookie] : []
    }
    forEach(callback: any) {
      this.map.forEach((v, k) => callback(v, k, this))
    }
    entries() {
      return this.map.entries()
    }
    keys() {
      return this.map.keys()
    }
    values() {
      return this.map.values()
    }
    [Symbol.iterator]() {
      return this.map.entries()
    }
  }

  class MockRequest {
    private _url: string
    headers: MockHeaders
    constructor(input: any, init?: any) {
      this._url = typeof input === 'string' ? input : input?.url || ''
      this.headers = new MockHeaders(init?.headers)
    }
    get url() {
      return this._url
    }
  }
  class MockResponse {
    body: any
    headers: MockHeaders
    status: number
    statusText: string
    ok: boolean
    constructor(body?: any, init?: any) {
      this.body = body
      this.status = init?.status ?? 200
      this.statusText = init?.statusText ?? 'OK'
      this.ok = this.status >= 200 && this.status < 300
      this.headers = new MockHeaders(init?.headers)
    }
    async json() {
      return typeof this.body === 'string' ? JSON.parse(this.body) : this.body
    }
    async text() {
      return typeof this.body === 'string' ? this.body : JSON.stringify(this.body ?? '')
    }
    static json(data: any, init?: any) {
      const headers = new MockHeaders(init?.headers)
      if (!headers.has('content-type')) {
        headers.set('content-type', 'application/json')
      }
      return new MockResponse(JSON.stringify(data), { ...init, headers })
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  global.Request = (globalThis as any).Request || (MockRequest as any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  global.Response = (globalThis as any).Response || (MockResponse as any)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  global.Headers = (globalThis as any).Headers || (MockHeaders as any)
}

if (typeof (globalThis as any).Headers !== 'undefined' && typeof (globalThis as any).Headers.prototype.getSetCookie === 'undefined') {
  (globalThis as any).Headers.prototype.getSetCookie = function () {
    const val = this.get('set-cookie')
    return val ? [val] : []
  }
}

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
  revalidateTag: jest.fn(),
}))
