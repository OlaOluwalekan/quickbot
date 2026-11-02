"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Bell,
  FolderOpen,
  Moon,
  Plus,
  Search,
  Settings,
  Sparkles,
  Sun,
  Trash2,
} from "lucide-react";
import {
  createProjectSchema,
  type CreateProjectInput,
} from "@/lib/schemas/workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CopyButton } from "@/components/ui/copy-button";

export function UiShowcase() {
  const { theme, setTheme } = useTheme();
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [typedConfirmOpen, setTypedConfirmOpen] = React.useState(false);
  const [switchChecked, setSwitchChecked] = React.useState(true);
  const [checkboxChecked, setCheckboxChecked] = React.useState<
    boolean | "indeterminate"
  >(true);
  const [radioValue, setRadioValue] = React.useState("balanced");
  const [selectValue, setSelectValue] = React.useState("gemini-2.5-flash");

  const form = useForm<CreateProjectInput>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  const onSubmit = (values: CreateProjectInput) => {
    toast.success(`Validated project "${values.name}"`);
    form.reset();
  };

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-bg px-4 py-8 text-fg sm:px-8">
        <div className="mx-auto max-w-5xl space-y-10">
          <PageHeader
            title="Klecx UI Primitives"
            description="Interactive catalog of semantic-token Radix & shadcn/ui components."
            badge={<Badge variant="secondary">Step 3.2</Badge>}
            actions={
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setTheme(theme === "dark" ? "light" : "dark")
                  }
                >
                  <Sun className="h-4 w-4 dark:hidden" strokeWidth={1.5} />
                  <Moon
                    className="hidden h-4 w-4 dark:inline"
                    strokeWidth={1.5}
                  />
                  <span>Toggle theme</span>
                </Button>
                <Button
                  type="button"
                  onClick={() =>
                    toast.success("Non-blocking confirmation toast via Sonner")
                  }
                >
                  <Bell className="h-4 w-4" strokeWidth={1.5} />
                  <span>Trigger Toast</span>
                </Button>
              </div>
            }
          />

          {/* Buttons & CopyButton */}
          <section className="space-y-4 rounded-xl border border-border bg-surface p-6 shadow-sm">
            <h2 className="text-lg font-semibold">Buttons & CopyButton</h2>
            <div className="flex flex-wrap items-center gap-3">
              <Button>Primary CTA</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
              <Button variant="link">Link Action</Button>
              <Button size="sm">Small</Button>
              <Button size="lg">Large</Button>
              <Button
                size="icon"
                variant="outline"
                aria-label="Workspace settings"
                tooltip="Workspace settings"
              >
                <Settings className="h-4 w-4" strokeWidth={1.5} />
              </Button>
              <CopyButton
                value="https://klecx.ai/workspaces/demo"
                label="Copy link"
                showText
                variant="outline"
              />
            </div>
          </section>

          {/* Badges, Avatars, Spinners, Skeletons */}
          <section className="space-y-4 rounded-xl border border-border bg-surface p-6 shadow-sm">
            <h2 className="text-lg font-semibold">
              Badges, Avatars, Spinners & Skeletons
            </h2>
            <div className="flex flex-wrap items-center gap-3">
              <Badge>Default</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="outline">Outline</Badge>
              <Badge variant="success">Success</Badge>
              <Badge variant="warning">Warning</Badge>
              <Badge variant="destructive">Destructive</Badge>
              <Separator orientation="vertical" className="h-6" />
              <Avatar>
                <AvatarImage src="" alt="Klecx User" />
                <AvatarFallback>KL</AvatarFallback>
              </Avatar>
              <Spinner size="sm" />
              <Spinner size="md" />
              <Spinner size="lg" />
            </div>
            <div className="flex items-center gap-3 pt-2">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
          </section>

          {/* Form Controls: Input, Textarea, Select, Switch, Checkbox, RadioGroup */}
          <section className="space-y-6 rounded-xl border border-border bg-surface p-6 shadow-sm">
            <h2 className="text-lg font-semibold">
              Selection & Input Controls
            </h2>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="demo-select">Model Preset</Label>
                  <Select value={selectValue} onValueChange={setSelectValue}>
                    <SelectTrigger id="demo-select" aria-label="Model Preset">
                      <SelectValue placeholder="Choose model" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="gemini-2.5-flash">
                        Gemini 2.5 Flash (Fast)
                      </SelectItem>
                      <SelectItem value="gemini-2.5-pro">
                        Gemini 2.5 Pro (Deep Reasoning)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between rounded-lg border border-border bg-surface-2 p-3">
                  <Label htmlFor="demo-switch" className="cursor-pointer">
                    Enter key sends prompt
                  </Label>
                  <Switch
                    id="demo-switch"
                    checked={switchChecked}
                    onCheckedChange={setSwitchChecked}
                  />
                </div>

                <div className="flex items-center gap-2.5">
                  <Checkbox
                    id="demo-checkbox"
                    checked={checkboxChecked}
                    onCheckedChange={setCheckboxChecked}
                  />
                  <Label htmlFor="demo-checkbox" className="cursor-pointer">
                    Include project context instructions
                  </Label>
                </div>
              </div>

              <div className="space-y-3">
                <Label>Response Style</Label>
                <RadioGroup value={radioValue} onValueChange={setRadioValue}>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="concise" id="r-concise" />
                    <Label htmlFor="r-concise">Concise</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="balanced" id="r-balanced" />
                    <Label htmlFor="r-balanced">Balanced</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="detailed" id="r-detailed" />
                    <Label htmlFor="r-detailed">Detailed</Label>
                  </div>
                </RadioGroup>
              </div>
            </div>
          </section>

          {/* React Hook Form + Shared Zod Schema */}
          <section className="space-y-4 rounded-xl border border-border bg-surface p-6 shadow-sm">
            <h2 className="text-lg font-semibold">
              Form (react-hook-form + shared Zod schema)
            </h2>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="max-w-lg space-y-4"
                noValidate
              >
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Project Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Q4 Product Strategy" {...field} />
                      </FormControl>
                      <FormDescription>
                        Validated with createProjectSchema from lib/schemas/workspace.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Optional project context and goals..."
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit">
                  <Plus className="h-4 w-4" strokeWidth={1.5} />
                  <span>Validate & Create Project</span>
                </Button>
              </form>
            </Form>
          </section>

          {/* Overlays: Dialog, AlertDialog, ConfirmDialog, Sheet, Popover, DropdownMenu, Tooltip */}
          <section className="space-y-4 rounded-xl border border-border bg-surface p-6 shadow-sm">
            <h2 className="text-lg font-semibold">
              Dialogs, Sheets, Menus & Overlays
            </h2>
            <div className="flex flex-wrap items-center gap-3">
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline">Open Dialog</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Workspace Settings</DialogTitle>
                    <DialogDescription>
                      Configure sharing and default instructions for this workspace.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button type="button">Save Changes</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline">Open AlertDialog</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Archive workspace?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Archived workspaces remain searchable and can be restored at any time.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction>Archive</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <Button
                variant="outline"
                onClick={() => setConfirmOpen(true)}
              >
                ConfirmDialog
              </Button>

              <Button
                variant="destructive"
                onClick={() => setTypedConfirmOpen(true)}
              >
                <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                <span>Typed ConfirmDialog</span>
              </Button>

              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline">Open Sheet</Button>
                </SheetTrigger>
                <SheetContent>
                  <SheetHeader>
                    <SheetTitle>Annotations Panel</SheetTitle>
                    <SheetDescription>
                      Review inline comments and follow-up threads.
                    </SheetDescription>
                  </SheetHeader>
                </SheetContent>
              </Sheet>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline">Open Popover</Button>
                </PopoverTrigger>
                <PopoverContent>
                  <p className="text-xs text-muted">
                    Selection actions and quick context settings appear here.
                  </p>
                </PopoverContent>
              </Popover>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">Dropdown Menu</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>Workspace Actions</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    Rename <DropdownMenuShortcut>⌘R</DropdownMenuShortcut>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    Export Markdown <DropdownMenuShortcut>⌘E</DropdownMenuShortcut>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost">Hover for Tooltip</Button>
                </TooltipTrigger>
                <TooltipContent>Keyboard-accessible tooltip</TooltipContent>
              </Tooltip>
            </div>

            <ConfirmDialog
              open={confirmOpen}
              onOpenChange={setConfirmOpen}
              title="Delete workspace?"
              description="This workspace will be moved to trash for 30 days."
              confirmLabel="Move to Trash"
              onConfirm={() => {
                setConfirmOpen(false);
                toast.success("Moved to trash");
              }}
            />

            <ConfirmDialog
              open={typedConfirmOpen}
              onOpenChange={setTypedConfirmOpen}
              title="Permanently delete account?"
              description="This action cannot be undone. Type DELETE below to confirm."
              confirmText="DELETE"
              confirmLabel="Delete Account"
              variant="destructive"
              onConfirm={() => {
                setTypedConfirmOpen(false);
                toast.success("Confirmed typed deletion");
              }}
            />
          </section>

          {/* Tabs, Command, ScrollArea, EmptyState */}
          <section className="space-y-6 rounded-xl border border-border bg-surface p-6 shadow-sm">
            <h2 className="text-lg font-semibold">
              Tabs, Command, ScrollArea & EmptyState
            </h2>
            <Tabs defaultValue="command">
              <TabsList>
                <TabsTrigger value="command">Command Palette</TabsTrigger>
                <TabsTrigger value="scroll">Scroll Area</TabsTrigger>
                <TabsTrigger value="empty">Empty State</TabsTrigger>
              </TabsList>
              <TabsContent value="command">
                <div className="max-w-md rounded-lg border border-border">
                  <Command>
                    <CommandInput placeholder="Search workspaces or actions..." />
                    <CommandList>
                      <CommandEmpty>No matching results.</CommandEmpty>
                      <CommandGroup heading="Quick Actions">
                        <CommandItem>
                          <Sparkles className="h-4 w-4 text-accent" strokeWidth={1.5} />
                          <span>New Workspace</span>
                        </CommandItem>
                        <CommandItem>
                          <Search className="h-4 w-4 text-muted" strokeWidth={1.5} />
                          <span>Search Responses</span>
                        </CommandItem>
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </div>
              </TabsContent>
              <TabsContent value="scroll">
                <ScrollArea className="h-36 max-w-md rounded-lg border border-border p-3">
                  <div className="space-y-2 text-sm">
                    {Array.from({ length: 10 }, (_, i) => (
                      <div
                        key={i}
                        className="rounded-md bg-surface-2 px-3 py-1.5 text-fg"
                      >
                        Workspace item #{i + 1}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>
              <TabsContent value="empty">
                <EmptyState
                  icon={<FolderOpen className="h-5 w-5" strokeWidth={1.5} />}
                  title="No projects yet"
                  description="Group related workspaces together with shared instructions and collaborators."
                  action={<Button size="sm">Create Project</Button>}
                />
              </TabsContent>
            </Tabs>
          </section>
        </div>
      </div>
    </TooltipProvider>
  );
}
