"use client";

import { themeData, themeMap } from "@/data/theme";
import { changeTheme, toggleThemeOpen } from "@/features/generalSlice";
import { RootState } from "@/store";
import { useDispatch, useSelector } from "react-redux";

const Theme = () => {
  const { theme, themeIsOpen } = useSelector(
    (store: RootState) => store.general
  );
  const dispatch = useDispatch();

  const handleThemeClick = (
    name: "cupcake" | "dracula" | "light" | "black"
  ) => {
    dispatch(changeTheme(name));
    dispatch(toggleThemeOpen(false));
  };

  return (
    <div className="fixed bottom-20 right-3 flex flex-col justify-end items-end">
      {themeIsOpen && (
        <div className="flex flex-col w-[150px] bg-primary justify-center items-center shadow-lg p-2 rounded-md">
          {themeData.map((item) => {
            return (
              <button
                key={item.name}
                className="flex w-full leading-8 text-primary-content items-center gap-2 hover:bg-accent px-2 rounded"
                onClick={() => handleThemeClick(item.name)}
              >
                <span>
                  <item.icon />
                </span>
                {item.name}
              </button>
            );
          })}
        </div>
      )}
      <button
        className="a-modal p-3 bg-primary rounded-md text-primary-content mt-2 hover:bg-accent"
        onClick={() => dispatch(toggleThemeOpen(!themeIsOpen))}
      >
        {themeMap[theme].icon()}
      </button>
    </div>
  );
};

export default Theme;
