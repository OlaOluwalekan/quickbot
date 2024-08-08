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
  readonly,
}: InputWithIconsProps) => {
  return (
    <label
      className={clsx(
        "input input-bordered flex items-center gap-2 my-2",
        type === "hidden" && "hidden"
      )}
    >
      <span
        className={clsx(
          "input-icon",
          readonly ? "text-gray-500 opacity-50" : "text-primary opacity-100"
        )}
      >
        {icons}
      </span>
      <input
        type={type}
        className={clsx("grow", readonly && "opacity-50 text-gray-500")}
        placeholder={placeholder}
        name={name}
        id={id}
        value={value}
        onChange={onChange}
        readOnly={readonly}
      />
    </label>
  );
};

export default InputWithIcon;
