import "server-only";
import { env } from "@/server/env";
import { StorageProvider } from "./types";
import { CloudinaryStorageProvider } from "./cloudinary";
import { MockStorageProvider } from "./mock";

export * from "./types";

let currentProvider: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (currentProvider) {
    return currentProvider;
  }

  if (
    env.CLOUDINARY_CLOUD_NAME &&
    env.CLOUDINARY_API_KEY &&
    env.CLOUDINARY_API_SECRET
  ) {
    currentProvider = new CloudinaryStorageProvider();
  } else {
    currentProvider = new MockStorageProvider();
  }

  return currentProvider;
}

export function setStorageProvider(provider: StorageProvider | null): void {
  currentProvider = provider;
}
