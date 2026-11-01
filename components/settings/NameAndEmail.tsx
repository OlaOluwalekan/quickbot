"use client";

import { SessionProps } from "@/types/user";
import { FormEvent, useState, useTransition } from "react";
import { Check, Pencil, User, X } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";

const NameAndEmail = ({ user }: { user: SessionProps }) => {
  const t = useTranslations("Settings");
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(user?.name || "");
  const [isPending, startTransition] = useTransition();

  const handleCancel = () => {
    setName(user?.name || "");
    setIsEditing(false);
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error(t("fullName"));
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/user/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim() }),
        });
        const json = await res.json();
        if (json.success) {
          toast.success(json.message || "Name updated");
          setIsEditing(false);
          router.refresh();
        } else {
          toast.error(json.message || "Failed to update name");
        }
      } catch {
        toast.error("Failed to update name");
      }
    });
  };

  return (
    <div className="flex flex-col items-center sm:items-start w-full gap-1.5 text-fg">
      {isEditing ? (
        <form
          onSubmit={handleSubmit}
          className="flex items-center gap-2 w-full max-w-xs"
        >
          <div className="relative flex flex-1 items-center">
            <User
              className="pointer-events-none absolute left-3 h-4 w-4 text-accent"
              strokeWidth={1.5}
            />
            <Input
              type="text"
              placeholder={t("fullName")}
              value={name}
              name="name"
              onChange={(e) => setName(e.target.value)}
              className="pl-9"
            />
          </div>
          {isPending ? (
            <Spinner size="sm" />
          ) : (
            <div className="flex items-center gap-1 shrink-0">
              <Button
                type="submit"
                variant="ghost"
                size="icon"
                aria-label="Save name"
                tooltip="Save name"
                className="text-success hover:bg-success/15"
              >
                <Check className="h-4 w-4" strokeWidth={1.5} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Cancel edit"
                tooltip="Cancel edit"
                className="text-danger hover:bg-danger/15"
                onClick={handleCancel}
              >
                <X className="h-4 w-4" strokeWidth={1.5} />
              </Button>
            </div>
          )}
        </form>
      ) : (
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold tracking-tight">{name}</h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Edit name"
            tooltip="Edit name"
            onClick={() => setIsEditing(true)}
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
          </Button>
        </div>
      )}
      <span className="text-xs sm:text-sm text-muted">
        {user?.email}
      </span>
      <span className="text-[11px] text-subtle">
        {t("emailReadOnly")}
      </span>
    </div>
  );
};

export default NameAndEmail;
