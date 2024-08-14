"use client";

import { setCurrentPageId, setCurrentPageTitle } from "@/features/generalSlice";
import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import InlineLoading from "../loading/InlineLoading";
import { RootState } from "@/store";

const TemplatePrompts = () => {
  const dispatch = useDispatch();
  const { loadingResponse, chatInputHeight } = useSelector(
    (store: RootState) => store.general
  );

  useEffect(() => {
    dispatch(setCurrentPageTitle("New Chat"));
    dispatch(setCurrentPageId(null));
  }, []);

  return (
    <div
      className="w-full flex flex-col"
      style={{
        height: `calc(100vh - ${chatInputHeight} - 200px)`,
      }}
    >
      <div className="h-full">TemplatePrompts</div>
      {loadingResponse && <InlineLoading />}
    </div>
  );
};

export default TemplatePrompts;
