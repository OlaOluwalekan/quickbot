"use client";

import { ChangeEvent, useEffect, useState, useTransition } from "react";
import InputWithIcon from "../ui/inputs/InputWithIcon";
import { FaEnvelope, FaLock, FaUser } from "react-icons/fa6";
import BasicButton from "../ui/button/BasicButton";
import { register } from "@/utils/actions/register";
import Alert from "../alert/Alert";
import { useRouter } from "next/navigation";
import axios from "axios";

/**
 * Register form
 * @returns {JSX.Element} styled register form
 */
const RegisterForm = (): JSX.Element => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [response, setResponse] = useState({
    message: "",
    success: false,
    data: null,
  });
  const [isPending, startTransition] = useTransition();
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

  // handle form submission event - server action is used to register new user
  const handleSubmit = (formData: FormData) => {
    setResponse({ message: "", success: false, data: null });

    // handle state updates
    startTransition(() => {
      register(formData).then((res) => {
        console.log(res);

        setResponse(res);
        if (res.success) {
          // send email on successful user registration
          axios.post("/api/email/send-verification-email", {
            email: res.data.email,
            token: res.data.token,
          });
          const accountId = res.data.email;
          // redirect to registered page for user to await verification email
          router.push(`/auth/registered?accountId=${accountId}`);
        }
      });
    });
  };

  return (
    <form action={handleSubmit} noValidate>
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

      {/* name input */}
      <InputWithIcon
        type="text"
        placeholder="Name"
        icons={<FaUser />}
        name="name"
        id="name"
        value={formData.name}
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

      {/* password confirmation input */}
      <InputWithIcon
        type="password"
        placeholder="Confirm Password"
        icons={<FaLock />}
        name="confirmPassword"
        id="confirmPassword"
        value={formData.confirmPassword}
        onChange={handleChange}
      />

      {/* alert toast message - disappears after 3s */}
      {response.message && (
        <Alert message={response.message} success={response.success} />
      )}

      {/* submit button */}
      <BasicButton
        type="submit"
        size="full"
        text={isPending ? "Loading..." : "Register"}
        disabled={isPending}
        theme="primary"
      />
    </form>
  );
};

export default RegisterForm;
