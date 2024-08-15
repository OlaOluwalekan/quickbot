"use client";

import Image from "next/image";
import LinkButton from "../ui/button/LinkButton";
import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { setCurrentPageTitle } from "@/features/generalSlice";

const NotFound = () => {
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(setCurrentPageTitle(""));
  }, []);

  return (
    <div className="w-full h-full flex flex-col justify-center items-center gap-5">
      <div className="w-[90%] max-w-[500px]">
        <Image
          width="196"
          height="248"
          src="/404.png"
          alt="Logo"
          className="w-full"
        />
      </div>
      <div className="flex flex-col justify-center items-center gap-2">
        <p className="text-xl font-semibold">
          Sorry! This page cannot be found
        </p>
        <p>It has either been removed or does not exist</p>
      </div>
      <div>
        <LinkButton size="medium" text="Back Home" href="/" theme="primary" />
      </div>
    </div>
  );
};

export default NotFound;
