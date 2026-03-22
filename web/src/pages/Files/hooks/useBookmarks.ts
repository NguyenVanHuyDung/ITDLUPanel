import { useState, useRef, useCallback } from 'react';
import { message } from 'antd';
import type { Bookmark } from '../types';
import { BOOKMARK_KEY, DEFAULT_BOOKMARKS } from '../utils/constants';

function loadBookmarks(): Bookmark[] {
  try {
    const stored = localStorage.getItem(BOOKMARK_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return DEFAULT_BOOKMARKS;
}

function saveBookmarks(bookmarks: Bookmark[]) {
  localStorage.setItem(BOOKMARK_KEY, JSON.stringify(bookmarks));
}

export function useBookmarks() {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>(loadBookmarks);
  const bookmarkBarRef = useRef<HTMLDivElement>(null);

  const addBookmark = useCallback((path: string) => {
    setBookmarks(prev => {
      if (prev.some(b => b.path === path)) {
        message.info('Already bookmarked');
        return prev;
      }
      const label = path.split('/').filter(Boolean).pop() || path;
      const next = [...prev, { path, label }];
      saveBookmarks(next);
      message.success('Bookmark added');
      return next;
    });
  }, []);

  const removeBookmark = useCallback((path: string) => {
    setBookmarks(prev => {
      const next = prev.filter(b => b.path !== path);
      saveBookmarks(next);
      message.success('Bookmark removed');
      return next;
    });
  }, []);

  const scrollBookmarks = useCallback((dir: 'left' | 'right') => {
    bookmarkBarRef.current?.scrollBy({
      left: dir === 'left' ? -200 : 200,
      behavior: 'smooth',
    });
  }, []);

  return {
    bookmarks,
    addBookmark,
    removeBookmark,
    bookmarkBarRef,
    scrollBookmarks,
  };
}
