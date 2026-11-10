"use client";

import * as React from "react";
import Logo from "@/components/logo/Logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api/client";

export interface MentionItem {
  kind: "klecx" | "user";
  id?: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string | null;
}

export interface MentionTextareaProps extends Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  "onChange"
> {
  value: string;
  onChange: (value: string) => void;
  workspaceId?: string;
  canAskOrGenerate?: boolean;
  onEnterSubmit?: () => void;
  onCancel?: () => void;
  hint?: React.ReactNode;
}

export const MentionTextarea = React.forwardRef<
  HTMLTextAreaElement,
  MentionTextareaProps
>(
  (
    {
      value,
      onChange,
      workspaceId,
      canAskOrGenerate = true,
      onEnterSubmit,
      onCancel,
      hint,
      className,
      placeholder,
      disabled,
      rows = 3,
      ...props
    },
    forwardedRef
  ) => {
    const internalRef = React.useRef<HTMLTextAreaElement | null>(null);
    const textareaRef =
      (forwardedRef as React.MutableRefObject<HTMLTextAreaElement | null>) ||
      internalRef;

    const [isOpen, setIsOpen] = React.useState(false);
    const [query, setQuery] = React.useState("");
    const [matchIndex, setMatchIndex] = React.useState(0);
    const [items, setItems] = React.useState<MentionItem[]>([]);
    const [selectedIndex, setSelectedIndex] = React.useState(0);
    const [isLoading, setIsLoading] = React.useState(false);

    // Detect mention trigger on text change or cursor movement
    const detectMention = React.useCallback(
      (text: string, cursorPos: number) => {
        const textBeforeCursor = text.slice(0, cursorPos);
        const match = /(?:^|\s)@([a-zA-Z0-9_\-\.]*)$/.exec(textBeforeCursor);

        if (match) {
          const atIndex = match.index + (match[0].startsWith("@") ? 0 : 1);
          setMatchIndex(atIndex);
          setQuery(match[1] ?? "");
          setIsOpen(true);
          setIsLoading(true);
        } else {
          setIsOpen(false);
          setIsLoading(false);
          setQuery("");
        }
      },
      []
    );

    // Debounced fetch of mentionables
    React.useEffect(() => {
      if (!isOpen) {
        setItems([]);
        return;
      }

      let active = true;
      setIsLoading(true);

      const timer = setTimeout(async () => {
        try {
          if (workspaceId) {
            const data = await api<MentionItem[]>(
              `/api/v1/workspaces/${workspaceId}/mentionables?q=${encodeURIComponent(query)}`
            );
            if (active) {
              setItems(data || []);
              setSelectedIndex(0);
            }
          } else {
            // Default/mock fallback when workspaceId is not supplied
            const mockList: MentionItem[] = [];
            if (
              canAskOrGenerate &&
              (!query || "klecx".startsWith(query.toLowerCase()))
            ) {
              mockList.push({ kind: "klecx" });
            }
            if (active) {
              setItems(mockList);
              setSelectedIndex(0);
            }
          }
        } catch {
          if (active) {
            const fallback: MentionItem[] = [];
            if (
              canAskOrGenerate &&
              (!query || "klecx".startsWith(query.toLowerCase()))
            ) {
              fallback.push({ kind: "klecx" });
            }
            setItems(fallback);
          }
        } finally {
          if (active) setIsLoading(false);
        }
      }, 150);

      return () => {
        active = false;
        clearTimeout(timer);
      };
    }, [isOpen, query, workspaceId, canAskOrGenerate]);

    const insertMention = React.useCallback(
      (item: MentionItem) => {
        const insertText =
          item.kind === "klecx" ? "@klecx " : `@${item.username} `;
        const textarea = textareaRef.current;
        const currentCursor = textarea?.selectionStart ?? value.length;
        const after = value.slice(currentCursor);
        const newValue = value.slice(0, matchIndex) + insertText + after;

        onChange(newValue);
        setIsOpen(false);

        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus();
            const newPos = matchIndex + insertText.length;
            textareaRef.current.setSelectionRange(newPos, newPos);
          }
        }, 10);
      },
      [matchIndex, onChange, textareaRef, value]
    );

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (isOpen && items.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % items.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + items.length) % items.length);
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          const selected = items[selectedIndex];
          if (selected) {
            insertMention(selected);
          }
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setIsOpen(false);
          return;
        }
      }

      if (!isOpen) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          onEnterSubmit?.();
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          onCancel?.();
          return;
        }
      }
    };

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const nextVal = e.target.value;
      onChange(nextVal);
      const cursor =
        typeof e.target.selectionStart === "number" &&
        e.target.selectionStart > 0
          ? e.target.selectionStart
          : nextVal.length;
      detectMention(nextVal, cursor);
    };

    const handleFocus = (e: React.FocusEvent<HTMLTextAreaElement>) => {
      detectMention(
        e.target.value,
        e.target.selectionStart || e.target.value.length
      );
    };

    const handleSelect = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
      const target = e.target as HTMLTextAreaElement;
      detectMention(target.value, target.selectionStart || target.value.length);
    };

    return (
      <div className="relative w-full">
        <textarea
          ref={(node) => {
            internalRef.current = node;
            if (typeof forwardedRef === "function") {
              forwardedRef(node);
            } else if (forwardedRef) {
              forwardedRef.current = node;
            }
          }}
          value={value}
          onChange={handleChange}
          onFocus={handleFocus}
          onSelect={handleSelect}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          rows={rows}
          className={cn(
            "border-border bg-surface-2 text-fg placeholder:text-fg-muted focus:ring-accent w-full resize-none rounded-lg border p-2 text-xs focus:ring-1 focus:outline-none",
            className
          )}
          {...props}
        />

        {/* Mention hint below textarea */}
        {hint && (
          <p className="text-fg-muted mt-1 px-0.5 text-[11px] leading-snug select-none">
            {hint}
          </p>
        )}

        {/* Mention autocomplete dropdown */}
        {isOpen && (
          <div
            role="listbox"
            aria-label="Mention options"
            data-testid="mention-autocomplete-menu"
            className="border-border bg-surface absolute bottom-full left-0 z-50 mb-1 max-h-56 w-full overflow-y-auto rounded-lg border px-1 py-1 shadow-lg"
          >
            {isLoading && items.length === 0 ? (
              <div className="text-fg-muted px-3 py-2 text-xs">
                Searching members...
              </div>
            ) : items.length === 0 ? (
              <div className="text-fg-muted px-3 py-2 text-xs">
                No members found
              </div>
            ) : (
              items.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                const testId =
                  item.kind === "klecx"
                    ? "mention-item-klecx"
                    : `mention-item-${item.username}`;

                return (
                  <button
                    key={
                      item.kind === "klecx" ? "klecx" : item.id || item.username
                    }
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    data-selected={isSelected ? "true" : undefined}
                    data-testid={testId}
                    onMouseDown={(e) => {
                      // Prevent textarea blur before insert
                      e.preventDefault();
                      insertMention(item);
                    }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-2.5 rounded-md px-3 py-1.5 text-left text-xs transition-colors",
                      isSelected
                        ? "bg-surface-2 text-fg"
                        : "text-fg-muted hover:bg-surface-2"
                    )}
                  >
                    {item.kind === "klecx" ? (
                      <>
                        <div className="flex h-5 w-5 shrink-0 items-center justify-center">
                          <Logo size="small" collapsed />
                        </div>
                        <div className="flex min-w-0 flex-col">
                          <span className="text-fg flex items-center gap-1.5 font-medium">
                            Klecx
                            <span className="py-0.2 bg-accent/15 text-accent rounded px-1 text-[10px] font-normal">
                              AI
                            </span>
                          </span>
                          <span
                            className="text-fg-muted truncate text-[11px]"
                            title="AI assistant · remembers this for future answers"
                          >
                            AI assistant · remembers this for future answers
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <Avatar className="h-5 w-5">
                          {item.avatarUrl && (
                            <AvatarImage
                              src={item.avatarUrl}
                              alt={item.displayName}
                            />
                          )}
                          <AvatarFallback className="text-[10px]">
                            {(item.displayName || item.username || "U")
                              .charAt(0)
                              .toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="text-fg truncate font-medium">
                            {item.displayName || item.username}
                          </span>
                          {item.username && (
                            <span className="text-fg-muted truncate text-[11px]">
                              @{item.username}
                            </span>
                          )}
                        </div>
                      </>
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    );
  }
);

MentionTextarea.displayName = "MentionTextarea";

/**
 * Renders plain text with mention tokens converted into rich spans/chips.
 * - `@klecx` -> accent chip "Klecx noted this"
 * - `@username` -> highlighted span
 */
export function renderMentions(text: string): React.ReactNode {
  if (!text) return null;

  const parts = text.split(/(@klecx|@[a-zA-Z0-9_\-\.]+)/gi);

  return parts.map((part, index) => {
    if (part.toLowerCase() === "@klecx") {
      return (
        <span
          key={index}
          data-mention="klecx"
          className="bg-accent/15 text-accent border-accent/25 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-medium select-none"
        >
          Klecx noted this
        </span>
      );
    }

    if (part.startsWith("@")) {
      const username = part.slice(1);
      return (
        <span
          key={index}
          data-mention={username}
          className="text-accent inline-flex cursor-pointer items-center font-medium hover:underline"
        >
          {part}
        </span>
      );
    }

    return part;
  });
}

export function RenderMentions({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return <span className={className}>{renderMentions(text)}</span>;
}
