"use client";

import { resendVerificationEmail, verifyEmail } from "@/utils/actions/register";
import clsx from "clsx";
import { useSearchParams } from "next/navigation";
import { ChangeEvent, useEffect, useState, useTransition } from "react";
import { FaCheckCircle, FaTimesCircle } from "react-icons/fa";
import InputWithIcon from "../ui/inputs/InputWithIcon";
import { FaEnvelope } from "react-icons/fa6";
import BasicButton from "../ui/button/BasicButton";
import LinkButton from "../ui/button/LinkButton";
import axios from "axios";

const RESEND_SECONDS = 15; // number of seconds to wait before resending verification email

/**
 * verification form - form in page where user email is actually verified
 * @returns {JSX.Element} verification form component
 */
const VerificationForm = (): JSX.Element => {
  const params = useSearchParams();
  const token = params.get("token");
  const [isPending, startTransition] = useTransition();
  const [sendingEmail, startSendingEmail] = useTransition();
  const [response, setResponse] = useState({
    message: "",
    success: false,
    data: null,
  });
  const [userEmail, setUserEmail] = useState("");
  const [count, setCount] = useState(0);

  // reset count
  const handleResendClick = () => {
    setCount(RESEND_SECONDS);
  };

  // handle state update on page load
  useEffect(() => {
    setResponse({ message: "", success: false, data: null });
    startTransition(() => {
      // verify user email
      verifyEmail(token as string).then((res) => {
        // console.log(res);
        if (!res.success && res.data) {
          setUserEmail(res.data.email);
        }
        setResponse(res);
      });
    });
  }, []);

  // handle resending of verification email
  const handleSubmit = (formData: FormData) => {
    setResponse({ message: "", success: false, data: null });

    startSendingEmail(() => {
      resendVerificationEmail(formData).then((res) => {
        setResponse(res);
        if (res.success) {
          axios
            .post("/api/email/send-verification-email", {
              email: res.data.email,
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
    <div className="h-screen flex flex-col justify-center items-center gap-2">
      {/* while page is loading and awaiting verification */}
      {isPending && <div className="text-center">Please wait...</div>}

      {/* display response from email verification */}
      {!isPending && (
        <div
          className={clsx(
            "w-[90%] max-w-[500px] text-base flex items-center justify-center gap-3 py-1 rounded",
            response.success ? "bg-success/50" : "bg-error/50"
          )}
        >
          <span
            className={clsx(response.success ? "text-success" : "text-error")}
          >
            {response.success ? <FaCheckCircle /> : <FaTimesCircle />}
          </span>
          <p className={clsx(response.success ? "text-success" : "text-error")}>
            {response.message}
          </p>
        </div>
      )}

      {/* display form if email is not verified yet and verification is not successful */}
      {!isPending && !response.success && response.data && (
        <form className="w-[90%] mx-auto max-w-[500px]" action={handleSubmit}>
          {/* email input */}
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
      )}

      {/* back to register link */}
      {!isPending && !response.data && (
        <LinkButton
          size="large"
          href="/auth/register"
          text="Register"
          theme="primary"
        />
      )}

      {/* login link */}
      {response.success && (
        <div>
          <LinkButton
            href="/auth/login"
            text="Login"
            size="large"
            theme="primary"
          />
        </div>
      )}
    </div>
  );
};

export default VerificationForm;
