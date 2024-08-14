"use client";

import { setCurrentPageId, setCurrentPageTitle } from "@/features/generalSlice";
import { useEffect } from "react";
import { useDispatch } from "react-redux";

const TemplatePrompts = () => {
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(setCurrentPageTitle("New Chat"));
    dispatch(setCurrentPageId(null));
  }, []);
  return <div>TemplatePrompts</div>;
};

export default TemplatePrompts;
