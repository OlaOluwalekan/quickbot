import { BiMoon, BiSun } from "react-icons/bi";
import { FaMoon, FaSun } from "react-icons/fa6";

// maps theme name to icon
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

// theme data
export const themeData: {
  name: "cupcake" | "dracula" | "light" | "black";
  icon: any;
}[] = [
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
