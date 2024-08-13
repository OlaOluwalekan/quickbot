"use client";

import { ResponseProps } from "@/types/chats";
import React, { useEffect, useRef } from "react";
import Response from "./Response";
import { useSelector } from "react-redux";
import { RootState } from "@/store";
import InlineLoading from "../loading/InlineLoading";

const ResponseList = ({
  data,
  image,
}: {
  data: ResponseProps[];
  image: string | null;
}) => {
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const { loadingResponse } = useSelector((store: RootState) => store.general);

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
