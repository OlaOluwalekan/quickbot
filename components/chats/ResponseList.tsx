"use client";

import { ResponseProps } from "@/types/chats";
import React, { useEffect, useRef, useTransition } from "react";
import Response from "./Response";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "@/store";
import InlineLoading from "../loading/InlineLoading";
import { getChatById } from "@/utils/actions/chat";
import { setCurrentPageId, setCurrentPageTitle } from "@/features/generalSlice";

const ResponseList = ({
  data,
  image,
}: {
  data: ResponseProps[];
  image: string | null;
}) => {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const { loadingResponse } = useSelector((store: RootState) => store.general);
  const [pending, startTransition] = useTransition();
  const dispatch = useDispatch();

  useEffect(() => {
    startTransition(() => {
      getChatById(data[0].chatId).then((res) => {
        dispatch(setCurrentPageTitle(res.data.chat.title));
        dispatch(setCurrentPageId(res.data.chat.id));
      });
    });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data]);

  return (
    <div className="h-full py-2 overflow-auto scrollbar-none">
      {data.map((response) => {
        return <Response key={response.id} response={response} image={image} />;
      })}

      {loadingResponse && <InlineLoading />}
      <div ref={bottomRef}></div>
    </div>
  );
};

export default ResponseList;
