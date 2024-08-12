"use client";

import { ResponseProps } from "@/types/chats";
import React from "react";
import Response from "./Response";

const ResponseList = ({
  data,
  image,
}: {
  data: ResponseProps[];
  image: string | null;
}) => {
  return (
    <div className="h-full py-10 overflow-auto scrollbar-none">
      {data.map((response) => {
        return <Response key={response.id} response={response} image={image} />;
      })}
    </div>
  );
};

export default ResponseList;
