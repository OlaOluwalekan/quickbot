"use client";

import { Search as SearchIcon } from "lucide-react";
import { ChangeEvent, useEffect, useState } from "react";
import { ChatProps, ResponseProps } from "@/types/chats";
import { ChatSearchResult, ResponseSearchResult } from "./SearchResult";
import { usePathname } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "@/store";
import { setSearchResultIsOpen } from "@/features/generalSlice";
import { useTranslations } from "next-intl";

const Search = ({ userId }: { userId: string }) => {
  const t = useTranslations("Chat");
  const [searchText, setSearchText] = useState("");
  const [results, setResults] = useState<(ChatProps | ResponseProps)[]>([]);
  const pathname = usePathname() || "/workspaces";
  const path = pathname.split("/");
  const { searchResultIsOpen } = useSelector(
    (store: RootState) => store.general
  );
  const dispatch = useDispatch();

  const lastPath = path[path.length - 1] || "";
  let workspaceId = "";
  if (
    lastPath.toLowerCase() !== "chat" &&
    lastPath.toLowerCase() !== "workspaces"
  ) {
    workspaceId = lastPath;
  }
  const [searchOption, setSearchOption] = useState(
    workspaceId ? "this chat" : "all chats"
  );

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearchText(e.target.value);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
  };

  const search = async () => {
    if (!searchText.trim()) {
      dispatch(setSearchResultIsOpen(false));
      setResults([]);
      return;
    }

    dispatch(setSearchResultIsOpen(true));
    try {
      const params = new URLSearchParams({
        q: searchText.trim(),
        scope: searchOption,
      });

      if (searchOption === "this chat" && workspaceId) {
        params.set("workspaceId", workspaceId);
        params.set("chatId", workspaceId);
      }

      const res = await fetch(`/api/v1/workspaces/search?${params.toString()}`);
      const json = await res.json();
      if (Array.isArray(json.data?.results)) {
        setResults(json.data.results);
      } else if (Array.isArray(json.data?.items)) {
        setResults(json.data.items);
      } else {
        setResults([]);
      }
    } catch {
      setResults([]);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      search();
    }, 200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText, searchOption, userId]);

  return (
    <div className="relative">
      <form
        className="a-modal flex items-center rounded-xl border border-border bg-surface-2 overflow-hidden"
        onSubmit={handleSubmit}
      >
        <label className="flex items-center gap-2 px-3 py-1.5 flex-1 min-w-0">
          <span className="text-accent text-xs shrink-0">
            <SearchIcon className="h-3.5 w-3.5" strokeWidth={1.5} />
          </span>
          <input
            type="text"
            className="w-full min-w-[100px] sm:min-w-[160px] bg-transparent text-fg placeholder:text-subtle focus:outline-none text-xs"
            placeholder={t("searchPlaceholder")}
            value={searchText}
            onChange={handleChange}
            onFocus={search}
          />
        </label>
        <select
          aria-label="Search scope"
          value={searchOption}
          className="bg-surface border-l border-border text-muted px-2.5 py-1.5 text-xs font-medium focus:outline-none cursor-pointer"
          onChange={(e) => setSearchOption(e.target.value)}
        >
          {workspaceId && <option value="this chat">{t("searchThisChat")}</option>}
          <option value="all chats">{t("searchAllChats")}</option>
        </select>
      </form>

      {searchResultIsOpen && (
        <div className="fixed sm:absolute z-50 bg-surface border border-border text-fg w-[92vw] sm:w-[420px] right-0 top-14 sm:top-11 px-4 py-3 shadow-lg rounded-2xl text-xs sm:text-sm max-h-[380px] overflow-y-auto">
          {results.length === 0 ? (
            <div className="py-4 text-center text-subtle">
              {t("noSearchResults")}
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-border">
              {results.map((result) => (
                <div key={result.id} className="py-1.5">
                  {"title" in result ? (
                    <ChatSearchResult
                      result={result as ChatProps}
                      searchText={searchText}
                      setSearchText={setSearchText}
                    />
                  ) : (
                    <ResponseSearchResult
                      result={result}
                      searchText={searchText}
                      setSearchText={setSearchText}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Search;
