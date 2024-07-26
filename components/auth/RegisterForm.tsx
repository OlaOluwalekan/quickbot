"use client";

import { ChangeEvent, useEffect, useState } from "react";
import InputWithIcon from "../ui/inputs/InputWithIcon";
import { FaEnvelope, FaLock, FaUser } from "react-icons/fa6";
import BasicButton from "../ui/button/BasicButton";
import { register } from "@/utils/actions/register";
import Alert from "../alert/Alert";

const RegisterForm = () => {
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

  useEffect(() => {
    let interval = setTimeout(() => {
      setResponse({ message: "", success: false, data: null });
    }, 3000);

    return () => clearTimeout(interval);
  }, [response]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (formData: FormData) => {
    setResponse({ message: "", success: false, data: null });

    register(formData).then((res) => {
      setResponse(res);
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
        type="text"
        placeholder="Name"
        icons={<FaUser />}
        name="name"
        id="name"
        value={formData.name}
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
      <InputWithIcon
        type="password"
        placeholder="Confirm Password"
        icons={<FaLock />}
        name="confirmPassword"
        id="confirmPassword"
        value={formData.confirmPassword}
        onChange={handleChange}
      />
      {response.message && (
        <Alert message={response.message} success={response.success} />
      )}
      <BasicButton
        type="submit"
        size="full"
        // text={isPending ? "Loading..." : "Register"}
        text="Register"
        // disabled={isPending}
        theme="primary"
      />
    </form>
  );
};

export default RegisterForm;
