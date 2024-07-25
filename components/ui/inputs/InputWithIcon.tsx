import { InputWithIconsProps } from "@/types/input-types";
import clsx from "clsx";

const InputWithIcon = ({
  type,
  placeholder,
  icons,
  name,
  id,
  value,
  onChange,
}: InputWithIconsProps) => {
  return (
    <label
      className={clsx(
        "input input-bordered flex items-center gap-2 my-2",
        type === "hidden" && "hidden"
      )}
    >
      <span className="input-icon text-primary">{icons}</span>
      <input
        type={type}
        className="grow"
        placeholder={placeholder}
        name={name}
        id={id}
        value={value}
        onChange={onChange}
      />
    </label>
  );
};

export default InputWithIcon;
