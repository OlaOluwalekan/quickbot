"use client";

import {
  setCurrentPageTitle,
  setDeletePopUpOpen,
  setEditPopUpOpen,
  toggleChatMenuOpen,
  toggleMobileNavOpen,
} from "@/features/generalSlice";
import { RootState } from "@/store";
import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MouseEvent, useEffect, useTransition } from "react";
import { MessageSquarePlus, X } from "lucide-react";
import { useDispatch, useSelector } from "react-redux";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import ChatList from "./ChatList";
import UserProfile from "./user-profile/UserProfile";
import { ChatProps } from "@/types/chats";
import ChatMenu from "./ChatMenu";
import Logo from "../logo/Logo";
import AppName from "../logo/AppName";
import { useTranslations } from "next-intl";
import {
  updateWorkspaceSchema,
  type UpdateWorkspaceInput,
} from "@/lib/schemas/workspace";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const Sidebar = ({
  data,
  chats,
  dates,
}: {
  data: any;
  chats: ChatProps[];
  dates: string[];
}) => {
  const t = useTranslations("Chat");
  const tCommon = useTranslations("Common");
  const router = useRouter();
  const {
    mobileNavIsOpen,
    chatMenuIsOpen,
    editPopUpIsOpen,
    deletePopUpIsOpen,
    dialogData,
    currentPageId,
  } = useSelector((store: RootState) => store.general);
  const dispatch = useDispatch();
  const [isRenaming, startRenameTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();

  const renameForm = useForm<UpdateWorkspaceInput>({
    resolver: zodResolver(updateWorkspaceSchema),
    defaultValues: {
      title: dialogData?.title ?? "",
    },
  });

  useEffect(() => {
    if (editPopUpIsOpen) {
      renameForm.reset({ title: dialogData?.title ?? "" });
    }
  }, [editPopUpIsOpen, dialogData?.title, renameForm]);

  const handleRenameSubmit = (values: UpdateWorkspaceInput) => {
    const newTitleTrimmed = values.title?.trim();
    if (!dialogData?.id || !newTitleTrimmed) return;

    startRenameTransition(async () => {
      try {
        const res = await fetch(`/api/v1/workspaces/${dialogData.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: newTitleTrimmed }),
        });
        const json = await res.json();
        if (res.ok && json.data) {
          toast.success(t("renameSuccess"));
          dispatch(setEditPopUpOpen(false));
          const updatedTitle =
            json.data.title ||
            json.data.updatedChat?.title ||
            newTitleTrimmed;
          if (currentPageId === dialogData.id) {
            dispatch(setCurrentPageTitle(updatedTitle));
          }
          dispatch(toggleMobileNavOpen(false));
          router.refresh();
        } else {
          toast.error(t("renameError"));
        }
      } catch {
        toast.error(t("renameError"));
      }
    });
  };

  const handleConfirmDelete = () => {
    if (!dialogData?.id) return;

    startDeleteTransition(async () => {
      try {
        const res = await fetch(`/api/v1/workspaces/${dialogData.id}`, {
          method: "DELETE",
        });
        if (res.ok) {
          toast.success(t("deleteSuccess"));
          dispatch(setDeletePopUpOpen(false));
          dispatch(toggleMobileNavOpen(false));
          if (currentPageId === dialogData.id) {
            router.push("/workspaces");
          }
          router.refresh();
        } else {
          toast.error(t("deleteError"));
        }
      } catch {
        toast.error(t("deleteError"));
      }
    });
  };

  const grouped: Record<string, ChatProps[]> = chats.reduce(
    (acc: Record<string, ChatProps[]>, chat) => {
      const dateKey =
        (chat.updatedAt instanceof Date
          ? chat.updatedAt
          : new Date(chat.updatedAt)
        )
          .toISOString()
          .split("T")[0] ?? "Unknown";
      const group = acc[dateKey] ?? [];

      group.push(chat);
      acc[dateKey] = group;
      return acc;
    },
    {}
  );

  useEffect(() => {
    if (!mobileNavIsOpen) {
      dispatch(toggleChatMenuOpen(false));
    }
  }, [mobileNavIsOpen, dispatch]);

  return (
    <>
      {/* Mobile Backdrop */}
      <div
        className={clsx(
          "fixed inset-0 z-30 bg-overlay backdrop-blur-xs transition-opacity md:hidden",
          mobileNavIsOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        )}
        onClick={() => dispatch(toggleMobileNavOpen(false))}
      />

      {/* Sidebar Panel */}
      <aside
        className={clsx(
          "fixed top-0 bottom-0 left-0 z-40 flex w-70 shrink-0 flex-col border-r border-border bg-surface text-fg transition-transform duration-300 ease-in-out md:static",
          mobileNavIsOpen
            ? "translate-x-0"
            : "-translate-x-full md:translate-x-0"
        )}
        onClick={(e: MouseEvent<HTMLElement>) => e.stopPropagation()}
      >
        {/* Brand Header & New Chat CTA */}
        <div className="flex flex-col gap-3 border-b border-border p-3.5">
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="flex items-center gap-2"
              onClick={() => dispatch(toggleMobileNavOpen(false))}
            >
              <Logo size="icon" />
              <AppName />
            </Link>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close sidebar"
              tooltip="Close sidebar"
              className="md:hidden"
              onClick={() => dispatch(toggleMobileNavOpen(false))}
            >
              <X className="h-4 w-4" strokeWidth={1.5} />
            </Button>
          </div>

          <Button asChild className="w-full">
            <Link
              href="/workspaces"
              onClick={() => dispatch(toggleMobileNavOpen(false))}
            >
              <MessageSquarePlus className="h-4 w-4" strokeWidth={1.5} />
              <span>{t("newChat")}</span>
            </Link>
          </Button>
        </div>

        {/* Scrollable Chat History + Footer Profile */}
        <div className="relative flex min-h-0 flex-1 flex-col justify-between pt-2">
          <ChatList chats={chats} dates={dates} grouped={grouped} />
          {chatMenuIsOpen && <ChatMenu />}

          {/* Rename Workspace Dialog (react-hook-form + updateWorkspaceSchema) */}
          <Dialog
            open={editPopUpIsOpen}
            onOpenChange={(open) => dispatch(setEditPopUpOpen(open))}
          >
            <DialogContent>
              <Form {...renameForm}>
                <form
                  onSubmit={renameForm.handleSubmit(handleRenameSubmit)}
                  className="space-y-4"
                >
                  <DialogHeader>
                    <DialogTitle>{t("renameChat")}</DialogTitle>
                  </DialogHeader>
                  <FormField
                    control={renameForm.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("renameChat")}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t("renamePlaceholder")}
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => dispatch(setEditPopUpOpen(false))}
                    >
                      {tCommon("cancel")}
                    </Button>
                    <Button type="submit" disabled={isRenaming}>
                      {isRenaming ? tCommon("loading") : tCommon("save")}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>

          {/* Delete Workspace ConfirmDialog */}
          <ConfirmDialog
            open={deletePopUpIsOpen}
            onOpenChange={(open) => dispatch(setDeletePopUpOpen(open))}
            title={t("deleteConfirmTitle")}
            description={t("deleteConfirmDescription", {
              title: dialogData?.title || "",
            })}
            confirmLabel={t("confirmDelete")}
            cancelLabel={tCommon("cancel")}
            variant="destructive"
            loading={isDeleting}
            onConfirm={handleConfirmDelete}
          />

          <UserProfile data={data} />
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
