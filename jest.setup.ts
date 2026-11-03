process.env.CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || 'test_cloudinary_cloud';
process.env.CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || 'test_cloudinary_key';
process.env.CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || 'test_cloudinary_secret';

import '@testing-library/jest-dom'
import { TextEncoder, TextDecoder } from 'util'

if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = TextEncoder
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  global.TextDecoder = TextDecoder as any
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
    headers: MockHeaders
    status: number
    statusText: string
    constructor(body?: any, init?: any) {
      this.status = init?.status ?? 200
      this.statusText = init?.statusText ?? 'OK'
      this.headers = new MockHeaders(init?.headers)
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
