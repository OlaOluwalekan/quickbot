"use client";

import { ChangeEvent, useEffect, useState, useTransition } from "react";
import InputWithIcon from "../ui/inputs/InputWithIcon";
import { FaEnvelope, FaLock } from "react-icons/fa6";
import BasicButton from "../ui/button/BasicButton";
import { useRouter } from "next/navigation";
import { login } from "@/utils/actions/login";
import Alert from "../alert/Alert";
import Link from "next/link";

/**
 * Login form
 * @returns {JSX.Element} styled login form
 */
const LoginForm = (): JSX.Element => {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [isPending, startTransition] = useTransition();
  const [response, setResponse] = useState({
    message: "",
    success: false,
    data: null,
  });
  const router = useRouter();

  // used to clear the response passed to the alert toast after 3s (3000ms)
  useEffect(() => {
    let interval = setTimeout(() => {
      setResponse({ message: "", success: false, data: null });
    }, 3000);

    return () => clearTimeout(interval);
  }, [response]);

  // handles input change events
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // handle form submission event - server action is used to login user with credentials
  const handleSubmit = async (formData: FormData) => {
    setResponse({ message: "", success: false, data: null });

    // handle state updates
    startTransition(() => {
      login(formData).then((res) => {
        setResponse(res);
        if (res.message.includes("not verified")) {
          // redirects to verification page if user is not verified
          router.push(`/auth/registered?accountId=${res.data.email}`);
        }
        if (res.success) {
          router.push("/chat");
        }
      });
    });
  };

  return (
    <form action={handleSubmit}>
      {/* email input */}
      <InputWithIcon
        type="email"
        placeholder="Email"
        icons={<FaEnvelope />}
        name="email"
        id="email"
        value={formData.email}
        onChange={handleChange}
      />

      {/* password input */}
      <InputWithIcon
        type="password"
        placeholder="Password"
        icons={<FaLock />}
        name="password"
        id="password"
        value={formData.password}
        onChange={handleChange}
      />

      <Link
        href="/auth/forgot-password"
        className="mb-2 text-xs underline block"
      >
        Forgot Password?
      </Link>

      {/* alert toast message - disappears after 3s */}
      {response.message && (
        <Alert message={response.message} success={response.success} />
      )}

      {/* submit button */}
      <BasicButton
        type="submit"
        size="full"
        text={isPending ? "Loading..." : "Login"}
        disabled={isPending}
        theme="primary"
      />
    </form>
  );
};

export default LoginForm;
