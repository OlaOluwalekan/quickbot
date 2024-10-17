"use client";

/**
 * Adds an item to the local storage under the specified key.
 *
 * @param {string} key - The key under which the item will be stored in local storage.
 * @param {any} item - The item to be stored. It will be converted to a string.
 *
 */
export const addToLocalStorage = (key: string, item: any) => {
  if (typeof window !== "undefined") {
    localStorage.setItem(key, item);
  }
};

/**
 * Retrieves an item from the local storage by the specified key.
 *
 * @param {string} key - The key of the item to retrieve from local storage.
 *
 * @returns {string | null} - The item retrieved from local storage, or null if the item does not
 */
export const getFromLocalStorage = (key: string): string | null => {
  if (typeof window !== "undefined") {
    const result = localStorage.getItem(key);
    return result || null;
  }
  return null;
};

/**
 * Removes an item from the local storage under the specified key.
 *
 * @param {string} key - The key of the item to be removed from local storage.
 */
export const removeFromLocalStorage = (key: string) => {
  if (typeof window !== "undefined") {
    localStorage.removeItem(key);
  }
};
