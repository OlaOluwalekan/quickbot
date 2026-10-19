"use client";

import { FaSearch } from "react-icons/fa";
import { ChangeEvent, useEffect, useState } from "react";
import clsx from "clsx";
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
  const pathname = usePathname() || "/chat";
  const path = pathname.split("/");
  const { searchResultIsOpen } = useSelector(
    (store: RootState) => store.general
  );
  const dispatch = useDispatch();

  const lastPath = path[path.length - 1] || "";
  let chatId = "";
  if (lastPath.toLowerCase() !== "chat") {
    chatId = lastPath;
  }
  const [searchOption, setSearchOption] = useState(
    chatId ? "this chat" : "all chats"
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
        option: searchOption,
        chatId,
      });
      const res = await fetch(`/api/chats/search?${params.toString()}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data?.results)) {
        setResults(json.data.results);
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
        className="a-modal flex items-center rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-800/70 overflow-hidden"
        onSubmit={handleSubmit}
      >
        <label className="flex items-center gap-2 px-3 py-1.5 flex-1 min-w-0">
          <span className="text-indigo-500 text-xs shrink-0">
            <FaSearch />
          </span>
          <input
            type="text"
            className="w-full min-w-[100px] sm:min-w-[160px] bg-transparent text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none text-xs"
            placeholder={t("searchPlaceholder")}
            value={searchText}
            onChange={handleChange}
            onFocus={search}
          />
        </label>
        <select
          aria-label="Search scope"
          value={searchOption}
          className="bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 px-2.5 py-1.5 text-xs font-medium focus:outline-none cursor-pointer"
          onChange={(e) => setSearchOption(e.target.value)}
        >
          {chatId && <option value="this chat">{t("searchThisChat")}</option>}
          <option value="all chats">{t("searchAllChats")}</option>
        </select>
      </form>

      {searchResultIsOpen && (
        <div className="fixed sm:absolute z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100 w-[92vw] sm:w-[420px] right-0 top-14 sm:top-11 px-4 py-3 shadow-2xl rounded-2xl text-xs sm:text-sm max-h-[380px] overflow-y-auto scrollbar-thin">
          {results.length === 0 ? (
            <div className="py-4 text-center text-slate-400">
              {t("noSearchResults")}
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-slate-100 dark:divide-slate-800">
              {results.map((result) => (
                <div key={result.id} className="py-1.5">
                  {"title" in result ? (
                    <ChatSearchResult
                      result={result}
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
