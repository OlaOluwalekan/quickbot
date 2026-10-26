"use client";

import { themeData, themeMap } from "@/data/theme";
import { changeTheme, toggleThemeOpen } from "@/features/generalSlice";
import { RootState } from "@/store";
import { ThemeProps } from "@/types/theme.interface";
import { useDispatch, useSelector } from "react-redux";

const Theme = () => {
  const { theme, themeIsOpen } = useSelector(
    (store: RootState) => store.general
  );
  const dispatch = useDispatch();

  const handleThemeClick = (name: ThemeProps) => {
    dispatch(changeTheme(name));
    dispatch(toggleThemeOpen(false));
  };

  return (
    <div className="fixed right-4 bottom-24 z-30 flex flex-col items-end justify-end">
      {themeIsOpen && (
        <div className="mb-2 flex w-36 flex-col rounded-2xl border border-slate-800 bg-slate-900 p-1.5 text-slate-100 shadow-2xl">
          {themeData.map((item) => (
            <button
              key={item.name}
              type="button"
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium text-slate-200 capitalize transition-colors hover:bg-slate-800"
              onClick={() => handleThemeClick(item.name)}
            >
              <span className="text-indigo-400">
                <item.icon />
              </span>
              <span>{item.name}</span>
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        aria-label="Toggle theme"
        className="a-modal cursor-pointer rounded-2xl bg-linear-to-r from-indigo-600 to-sky-500 p-3 text-white shadow-lg shadow-indigo-500/25 transition-all hover:opacity-95"
        onClick={() => dispatch(toggleThemeOpen(!themeIsOpen))}
      >
        {themeMap[theme]?.icon()}
      </button>
    </div>
  );
};

export default Theme;
