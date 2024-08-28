"use client";

import { SessionProps } from "@/types/user";
import { ChangeEvent, useState, useTransition } from "react";
import { FaEdit, FaTimes } from "react-icons/fa";
import { FaCheck, FaUser } from "react-icons/fa6";
import InputWithIcon from "../ui/inputs/InputWithIcon";
import toast from "react-hot-toast";
import { updateUserName } from "@/utils/actions/user";

const NameAndEmail = ({ user }: { user: SessionProps }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(user.name);
  const [isPending, startTransaction] = useTransition();

  const handleCancel = () => {
    setName(user.name);
    setIsEditing(false);
  };

  const handleSubmit = (formData: FormData) => {
    if (!name) {
      toast.error("Please enter your name");
      return;
    }

    startTransaction(() => {
      updateUserName(formData).then((res) => {
        if (res.success) {
          toast.success(res.message);
          setIsEditing(false);
        } else {
          toast.error(res.message);
        }
      });
    });
  };

  return (
    <div className="flex flex-col justify-center items-center w-full my-2 gap-1 text-base-content">
      <span>{user.email}</span>
      {isEditing ? (
        <form
          action={handleSubmit}
          className="flex justify-center items-center gap-2"
        >
          <input type="hidden" value={user.id} name="id" />
          <InputWithIcon
            type="text"
            placeholder="Your Name"
            value={name}
            name="name"
            icons={<FaUser />}
            onChange={(e: ChangeEvent<HTMLInputElement>) =>
              setName(e.target.value)
            }
          />
          {isPending ? (
            <span className="loading loading-spinner loading-xs"></span>
          ) : (
            <article className="flex gap-1">
              <button
                type="submit"
                className="text-lg w-8 aspect-square flex justify-center items-center text-success hover:bg-success/50 rounded-full"
              >
                <FaCheck />
              </button>
              <button
                type="button"
                className="text-lg w-8 aspect-square flex justify-center items-center text-error hover:bg-error/50 rounded-full"
                onClick={handleCancel}
              >
                <FaTimes />
              </button>
            </article>
          )}
        </form>
      ) : (
        <article className="flex items-center gap-2">
          <span>{user.name}</span>{" "}
          <button
            type="button"
            className="w-8 aspect-square flex justify-center items-center text-base-content hover:bg-primary hover:text-primary-content rounded-full"
            onClick={() => setIsEditing(true)}
          >
            <FaEdit />
          </button>
        </article>
      )}
    </div>
  );
};
export default NameAndEmail;
