"use client";

import * as React from "react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { getInitials, getAvatarColorClass } from "@/lib/avatar-shared";
import { cn } from "@/lib/utils";

export interface UserAvatarProps {
  user?: {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    avatarUrl?: string | null;
  } | null;
  avatarUrl?: string | null;
  name?: string | null;
  email?: string | null;
  userId?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}

const SIZE_CLASSES = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-9 w-9 text-xs",
  lg: "h-12 w-12 text-sm",
  xl: "h-16 w-16 text-base",
};

export function UserAvatar({
  user,
  avatarUrl,
  name,
  email,
  userId,
  size = "md",
  className,
}: UserAvatarProps) {
  const effectiveName = name ?? user?.name ?? null;
  const effectiveEmail = email ?? user?.email ?? null;
  const effectiveId = userId ?? user?.id ?? effectiveName ?? effectiveEmail ?? "";
  const effectiveSrc = avatarUrl ?? user?.avatarUrl ?? user?.image ?? null;

  const initials = getInitials(effectiveName, effectiveEmail);
  const colorClass = getAvatarColorClass(effectiveId);

  return (
    <Avatar className={cn(SIZE_CLASSES[size], "border border-border", className)}>
      {effectiveSrc && (
        <AvatarImage
          src={effectiveSrc}
          alt={effectiveName || "User"}
          className="object-cover"
        />
      )}
      <AvatarFallback className={cn("font-semibold", colorClass)}>
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
