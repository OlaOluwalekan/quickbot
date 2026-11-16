"use client";

import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangle, CheckCircle2, Lock, Mail } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { getAuthErrorMessage } from "@/lib/api/error-message";
import { authClient } from "@/lib/auth-client";
import {
  AUTH_VALIDATION_VALUES,
  LoginSchema,
  type LoginInput,
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

const LoginForm = (): React.JSX.Element => {
  const t = useTranslations("Auth");
  const tRoot = useTranslations();
  const router = useRouter();
  const searchParams = useSearchParams();
  const reason = searchParams?.get("reason");
  const [isPending, startTransition] = useTransition();
  const [isResending, startResendTransition] = useTransition();
  const [needsVerification, setNeedsVerification] = useState(false);
  const [response, setResponse] = useState<{
    message: string;
    success: boolean;
  }>({
    message: "",
    success: false,
  });

  useEffect(() => {
    if (reason === "expired" || reason === "revoked") {
      setResponse({
        message: t("sessionEnded"),
        success: false,
      });
    }
  }, [reason, t]);

  const form = useForm<LoginInput>({
    resolver: zodResolver(LoginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = (values: LoginInput) => {
    setResponse({ message: "", success: false });
    setNeedsVerification(false);

    startTransition(async () => {
      try {
        const { error } = await authClient.signIn.email({
          email: values.email.trim(),
          password: values.password,
          callbackURL: DEFAULT_LOGIN_REDIRECT,
        });

        if (error) {
          const isUnverified =
            error.status === 403 ||
            error.code === "EMAIL_NOT_VERIFIED" ||
            error.message?.toLowerCase().includes("verif");

          if (isUnverified) {
            setNeedsVerification(true);
            setResponse({
              message: t("verifyBeforeSignIn"),
              success: false,
            });
            return;
          }

          setResponse({
            message: getAuthErrorMessage(error, tRoot, t("errors.INVALID_EMAIL_OR_PASSWORD")),
            success: false,
          });
          return;
        }

        setResponse({
          message: t("signedIn"),
          success: true,
        });
        router.push(DEFAULT_LOGIN_REDIRECT);
        router.refresh();
      } catch {
        setResponse({
          message: t("unexpectedError"),
          success: false,
        });
      }
    });
  };

  const handleResendVerification = () => {
    const email = form.getValues("email").trim();
    if (!email) return;
    startResendTransition(async () => {
      try {
        await authClient.sendVerificationEmail({
          email,
          callbackURL: DEFAULT_LOGIN_REDIRECT,
        });
        setResponse({
          message: t("resendSent"),
          success: true,
        });
      } catch {
        setResponse({
          message: t("verificationSentIfExists"),
          success: true,
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

        <div className="flex justify-end pt-1">
          <Link
            href="/auth/forgot-password"
            className="text-xs font-medium text-muted hover:text-accent transition-colors"
          >
            {t("forgotPasswordLink")}
          </Link>
        </div>

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

        {needsVerification && (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={isResending}
            onClick={handleResendVerification}
          >
            {isResending ? t("loggingIn") : t("resendEmailLink")}
          </Button>
        )}

        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? t("loggingIn") : t("loginButton")}
        </Button>
      </form>
    </Form>
  );
};

export default LoginForm;
