"use client";

import { getUserByEmail } from "@/utils/actions/user";
import { useRouter } from "next/navigation";
import { ChangeEvent, useEffect, useState, useTransition } from "react";
import InputWithIcon from "../ui/inputs/InputWithIcon";
import { FaEnvelope } from "react-icons/fa6";
import BasicButton from "../ui/button/BasicButton";
import { resendVerificationEmail } from "@/utils/actions/register";
import Alert from "../alert/Alert";

const Registered = ({ accountId: email }: { accountId: string | null }) => {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [userEmail, setUserEmail] = useState("");
  const [isPending, startTransition] = useTransition();
  const [sendingEmail, startSendingEmail] = useTransition();
  const [response, setResponse] = useState({
    message: "",
    success: false,
    data: null,
  });

  if (!email) {
    router.push("/auth/register");
    return;
  }

  useEffect(() => {
    startTransition(() => {
      getUserByEmail(email).then((data) => {
        if (data) {
          setUser(data);
          setUserEmail(data.email as string);
        } else {
          router.push("/auth/register");
        }
      });
    });
  }, []);

  useEffect(() => {
    let interval = setTimeout(() => {
      setResponse({ message: "", success: false, data: null });
    }, 3000);

    return () => clearTimeout(interval);
  }, [response]);

  const handleSubmit = (formData: FormData) => {
    setResponse({ message: "", success: false, data: null });

    startSendingEmail(() => {
      resendVerificationEmail(formData).then((res) => {
        setResponse(res);
      });
    });
  };

  return (
    <form
      className="w-[90%] mx-auto max-w-[500px]"
      action={handleSubmit}
      noValidate
    >
      {isPending ? (
        <p className="text-center">Please wait...</p>
      ) : user ? (
        <p className="text-center text-sm bg-success/35 rounded text-success py-1">
          A Confirmation Email has been sent to you. Please check your Email
        </p>
      ) : (
        <p className="text-center text-sm bg-error/50 text-error py-1">
          The email {email} cannot be found. Redirecting to registration page
        </p>
      )}
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
      {response.message && (
        <Alert message={response.message} success={response.success} />
      )}
      <BasicButton
        type="submit"
        text={sendingEmail ? "Sending Email..." : "Resend Email"}
        size="full"
        theme="primary"
        disabled={isPending || sendingEmail}
      />
    </form>
  );
};

export default Registered;
