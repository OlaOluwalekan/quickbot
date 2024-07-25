"use client";

export const addToLocalStorage = (key: string, item: any) => {
  if (typeof window !== "undefined") {
    localStorage.setItem(key, item);
  }
};

export const getFromLocalStorage = (key: string) => {
  if (typeof window !== "undefined") {
    const result = localStorage.getItem(key);
    return result || null;
  }
  return null;
};

export const removeFromLocalStorage = (key: string) => {
  if (typeof window !== "undefined") {
    localStorage.removeItem(key);
  }
};
