"use client";

import { ChangeEvent, useEffect, useState, useTransition } from "react";
import InputWithIcon from "../ui/inputs/InputWithIcon";
import { FaEnvelope, FaLock } from "react-icons/fa6";
import BasicButton from "../ui/button/BasicButton";
import { useRouter } from "next/navigation";
import { login } from "@/utils/actions/login";
import Alert from "../alert/Alert";

const LoginForm = () => {
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

  useEffect(() => {
    let interval = setTimeout(() => {
      setResponse({ message: "", success: false, data: null });
    }, 3000);

    return () => clearTimeout(interval);
  }, [response]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (formData: FormData) => {
    setResponse({ message: "", success: false, data: null });

    startTransition(() => {
      login(formData).then((res) => {
        setResponse(res);
        if (res.message.includes("not verified")) {
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
      <InputWithIcon
        type="email"
        placeholder="Email"
        icons={<FaEnvelope />}
        name="email"
        id="email"
        value={formData.email}
        onChange={handleChange}
      />
      <InputWithIcon
        type="password"
        placeholder="Password"
        icons={<FaLock />}
        name="password"
        id="password"
        value={formData.password}
        onChange={handleChange}
      />
      {response.message && (
        <Alert message={response.message} success={response.success} />
      )}
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
