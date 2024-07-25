import { BiMoon, BiSun } from "react-icons/bi";
import { FaMoon, FaSun } from "react-icons/fa6";

export const themeMap: { [key: string]: { icon: any } } = {
  light: {
    icon: FaSun,
  },
  cupcake: {
    icon: BiSun,
  },
  dracula: {
    icon: BiMoon,
  },
  black: {
    icon: FaMoon,
  },
};

export const themeData = [
  {
    name: "light",
    icon: FaSun,
  },
  {
    name: "black",
    icon: FaMoon,
  },
  {
    name: "dracula",
    icon: BiMoon,
  },
  {
    name: "cupcake",
    icon: BiSun,
  },
];
