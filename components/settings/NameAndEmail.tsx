"use client";

import { SessionProps } from "@/types/user";
import { ChangeEvent, FormEvent, useState, useTransition } from "react";
import { Check, Pencil, User, X } from "lucide-react";
import InputWithIcon from "../ui/inputs/InputWithIcon";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

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
          <InputWithIcon
            type="text"
            placeholder={t("fullName")}
            value={name}
            name="name"
            icons={<User className="h-4 w-4" strokeWidth={1.5} />}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setName(e.target.value)
            }
          />
          {isPending ? (
            <span
              className="animate-spin inline-block w-5 h-5 border-2 border-accent border-t-transparent rounded-full shrink-0"
              role="status"
              aria-label="loading"
            />
          ) : (
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="submit"
                aria-label="Save name"
                className="w-8 h-8 flex justify-center items-center text-success hover:bg-success/15 rounded-lg cursor-pointer"
              >
                <Check className="h-4 w-4" strokeWidth={1.5} />
              </button>
              <button
                type="button"
                aria-label="Cancel edit"
                className="w-8 h-8 flex justify-center items-center text-danger hover:bg-danger/15 rounded-lg cursor-pointer"
                onClick={handleCancel}
              >
                <X className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>
          )}
        </form>
      ) : (
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold tracking-tight">{name}</h2>
          <button
            type="button"
            aria-label="Edit name"
            className="w-8 h-8 flex justify-center items-center text-subtle hover:text-accent hover:bg-accent-soft rounded-lg transition-colors cursor-pointer"
            onClick={() => setIsEditing(true)}
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
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
