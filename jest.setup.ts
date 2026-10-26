import '@testing-library/jest-dom'
import { TextEncoder, TextDecoder } from 'util'

if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = TextEncoder
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  global.TextDecoder = TextDecoder as any
}

if (typeof global.Request === 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  global.Request = (globalThis as any).Request
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  global.Response = (globalThis as any).Response
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  global.Headers = (globalThis as any).Headers
}

jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
  revalidateTag: jest.fn(),
}))
