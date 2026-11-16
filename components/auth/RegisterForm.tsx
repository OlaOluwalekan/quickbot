"use client";

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, CheckCircle2, Lock, Mail, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { getAuthErrorMessage } from "@/lib/api/error-message";
import { authClient } from "@/lib/auth-client";
import {
  AUTH_VALIDATION_VALUES,
  RegisterSchema,
  type RegisterInput,
} from "@/lib/schemas/auth";
import { DEFAULT_LOGIN_REDIRECT } from "@/utils/routes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from "@/components/ui/form";
import { cn } from "@/lib/utils";

const RegisterForm = (): React.JSX.Element => {
  const t = useTranslations("Auth");
  const tRoot = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [response, setResponse] = useState({
    message: "",
    success: false,
  });

  const form = useForm<RegisterInput>({
    resolver: zodResolver(RegisterSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = (values: RegisterInput) => {
    setResponse({ message: "", success: false });

    startTransition(async () => {
      try {
        const { error } = await authClient.signUp.email({
          email: values.email,
          name: values.name,
          password: values.password,
          callbackURL: DEFAULT_LOGIN_REDIRECT,
        });

        if (error) {
          setResponse({
            message: getAuthErrorMessage(error, tRoot, t("registerFailed")),
            success: false,
          });
          return;
        }

        setResponse({
          message: t("registerSuccess"),
          success: true,
        });

        router.push(
          `/auth/registered?accountId=${encodeURIComponent(values.email)}`
        );
      } catch {
        setResponse({
          message: t("registerFailed"),
          success: false,
        });
      }
    });
  };

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-3"
        noValidate
      >
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <div className="relative flex items-center">
                  <Mail
                    className="pointer-events-none absolute left-3 h-4 w-4 text-accent"
                    strokeWidth={1.5}
                  />
                  <Input
                    type="email"
                    placeholder={t("emailPlaceholder")}
                    className="pl-9"
                    {...field}
                  />
                </div>
              </FormControl>
              <FormMessage values={AUTH_VALIDATION_VALUES} />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <div className="relative flex items-center">
                  <User
                    className="pointer-events-none absolute left-3 h-4 w-4 text-accent"
                    strokeWidth={1.5}
                  />
                  <Input
                    type="text"
                    placeholder={t("namePlaceholder")}
                    className="pl-9"
                    {...field}
                  />
                </div>
              </FormControl>
              <FormMessage values={AUTH_VALIDATION_VALUES} />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <div className="relative flex items-center">
                  <Lock
                    className="pointer-events-none absolute left-3 h-4 w-4 text-accent"
                    strokeWidth={1.5}
                  />
                  <Input
                    type="password"
                    placeholder={t("passwordPlaceholder")}
                    className="pl-9"
                    {...field}
                  />
                </div>
              </FormControl>
              <FormMessage values={AUTH_VALIDATION_VALUES} />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <div className="relative flex items-center">
                  <Lock
                    className="pointer-events-none absolute left-3 h-4 w-4 text-accent"
                    strokeWidth={1.5}
                  />
                  <Input
                    type="password"
                    placeholder={t("confirmPasswordPlaceholder")}
                    className="pl-9"
                    {...field}
                  />
                </div>
              </FormControl>
              <FormMessage values={AUTH_VALIDATION_VALUES} />
            </FormItem>
          )}
        />

        {response.message && (
          <div
            role="alert"
            className={cn(
              "my-3 flex items-center justify-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-medium sm:text-sm",
              response.success
                ? "border-success/30 bg-success/10 text-success"
                : "border-danger/30 bg-danger/10 text-danger"
            )}
          >
            {response.success ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            ) : (
              <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.5} />
            )}
            <span>{response.message}</span>
          </div>
        )}

        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? t("registering") : t("registerButton")}
        </Button>
      </form>
    </Form>
  );
};

export default RegisterForm;
