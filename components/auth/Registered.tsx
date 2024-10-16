"use client";

import { getUserByEmail } from "@/utils/actions/user";
import { useRouter } from "next/navigation";
import { ChangeEvent, useEffect, useState, useTransition } from "react";
import InputWithIcon from "../ui/inputs/InputWithIcon";
import { FaEnvelope } from "react-icons/fa6";
import BasicButton from "../ui/button/BasicButton";
import { resendVerificationEmail } from "@/utils/actions/register";
import Alert from "../alert/Alert";
import axios from "axios";

const RESEND_SECONDS = 15; // number of seconds to wait before resending verification email
const REDIRECT_MILLISECONDS = 3000; // number of seconds to wait before redirecting

/**
 * registered form - shows user registration success and a form to resend verification email link
 * @param {Object} props - component properties
 * @param {string} props.accountId - email address of the newly registered user
 * @returns {JSX.Element} registered form component
 */
const Registered = ({
  accountId: email,
}: {
  accountId: string | null;
}): JSX.Element | null => {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [userEmail, setUserEmail] = useState("");
  const [isPending, startTransition] = useTransition();
  const [sendingEmail, startSendingEmail] = useTransition();
  const [pageIsLoading, setPageIsLoading] = useState(true);
  const [response, setResponse] = useState({
    message: "",
    success: false,
    data: null,
  });
  const [count, setCount] = useState(0); // to count the number of seconds to wait to resent verification email

  // check if email is in req params and redirect if not
  if (!email) {
    router.push("/auth/register");
    return null;
  }

  // reset count
  const handleResendClick = () => {
    setCount(RESEND_SECONDS);
  };

  useEffect(() => {
    // handle state update on page load
    startTransition(() => {
      getUserByEmail(email).then((data) => {
        if (data) {
          // if email already verified, then redirect to login page
          if (data.emailVerified) {
            router.push("/auth/login");
          }
          setUser(data);
          setUserEmail(data.email as string);
        } else {
          // if email does not exit in the database, redirect to registration page
          setTimeout(() => {
            router.push("/auth/register");
          }, REDIRECT_MILLISECONDS);
        }
        setPageIsLoading(false);
      });
    });
  }, []);

  // handle countdown to resend verification email
  useEffect(() => {
    let interval: NodeJS.Timeout | undefined;
    if (count > 0) {
      interval = setInterval(() => {
        setCount(count - 1);
      }, 1000);
    } else {
      clearInterval(interval);
    }

    return () => clearInterval(interval);
  }, [count]);

  // used to clear the response passed to the alert toast after 3s (3000ms)
  useEffect(() => {
    let interval = setTimeout(() => {
      setResponse({ message: "", success: false, data: null });
    }, 3000);

    return () => clearTimeout(interval);
  }, [response]);

  // handle resending of verification email
  const handleSubmit = (formData: FormData) => {
    setResponse({ message: "", success: false, data: null });

    startSendingEmail(() => {
      resendVerificationEmail(formData).then((res) => {
        setResponse(res);
        if (res.success) {
          axios
            .post("/api/email/send-verification-email", {
              email,
              token: res.data.token,
            })
            .then(() => {
              handleResendClick();
            });
        }
      });
    });
  };

  return (
    <form
      className="w-[90%] mx-auto max-w-[500px]"
      action={handleSubmit}
      noValidate
    >
      {/* render appropriate message when page is loading or when email is not found */}
      {isPending || pageIsLoading ? (
        <p className="text-center">Please wait...</p>
      ) : user ? (
        <p className="text-center text-sm bg-success/35 rounded text-success py-1">
          A Confirmation Email has been sent to you. Please check your Email
        </p>
      ) : (
        <p className="text-center text-sm bg-error/50 text-error py-1">
          The email {email} cannot be found. Redirecting to registration page...
        </p>
      )}

      {/* email input - read only */}
      <InputWithIcon
        type="email"
        placeholder="Email"
        icons={<FaEnvelope />}
        name="email"
        value={userEmail}
        onChange={(e: ChangeEvent<HTMLInputElement>) =>
          setUserEmail(e.target.value)
        }
        readonly={true}
      />

      {/* alert toast message - disappears after 3s */}
      {response.message && (
        <Alert message={response.message} success={response.success} />
      )}

      {/* submit button */}
      <BasicButton
        type="submit"
        text={
          sendingEmail
            ? "Sending Email..."
            : count > 0
            ? `Resend in ${count}s`
            : "Resend Email"
        }
        size="full"
        theme="primary"
        disabled={isPending || sendingEmail || count > 0}
      />
    </form>
  );
};

export default Registered;
