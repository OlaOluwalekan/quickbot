"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";
import { useUiStore } from "@/lib/stores/ui";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const setCurrentPageTitle = useUiStore((s) => s.setCurrentPageTitle);

  useEffect(() => {
    setCurrentPageTitle("");
  }, [setCurrentPageTitle]);

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
        <p className="text-xl font-semibold text-fg">
          Sorry! This page cannot be found
        </p>
        <p className="text-sm text-muted">
          It has either been removed or does not exist
        </p>
      </div>
      <div>
        <Button asChild>
          <Link href="/">Back Home</Link>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
