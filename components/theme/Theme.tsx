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
    <div className="fixed bottom-24 right-4 flex flex-col justify-end items-end z-30">
      {themeIsOpen && (
        <div className="flex flex-col w-36 bg-slate-900 border border-slate-800 text-slate-100 shadow-2xl p-1.5 rounded-2xl mb-2">
          {themeData.map((item) => (
            <button
              key={item.name}
              type="button"
              className="flex w-full py-2 px-3 text-xs font-medium text-slate-200 items-center gap-2.5 hover:bg-slate-800 rounded-xl capitalize transition-colors cursor-pointer"
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
        className="a-modal p-3 bg-gradient-to-r from-indigo-600 to-sky-500 rounded-2xl text-white shadow-lg shadow-indigo-500/25 hover:opacity-95 transition-all cursor-pointer"
        onClick={() => dispatch(toggleThemeOpen(!themeIsOpen))}
      >
        {themeMap[theme]?.icon()}
      </button>
    </div>
  );
};

export default Theme;
