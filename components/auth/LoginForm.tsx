"use client";

import { ChangeEvent, useState } from "react";
import InputWithIcon from "../ui/inputs/InputWithIcon";
import { FaEnvelope, FaLock } from "react-icons/fa6";
import BasicButton from "../ui/button/BasicButton";

const LoginForm = () => {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  return (
    <form>
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
      <BasicButton
        type="submit"
        size="full"
        // text={isPending ? "Loading..." : "Register"}
        text="Login"
        // disabled={isPending}
        theme="primary"
      />
    </form>
  );
};

export default LoginForm;
