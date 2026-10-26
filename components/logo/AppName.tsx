import { useTranslations } from "next-intl";

const AppName = () => {
  const t = useTranslations("Common");

  return (
    <span className="bg-linear-to-r from-indigo-500 via-purple-500 to-cyan-400 bg-clip-text font-extrabold tracking-tight text-transparent">
      {t("appName")}
    </span>
  );
};

export default AppName;
