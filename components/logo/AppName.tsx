import { useTranslations } from "next-intl";

const AppName = () => {
  const t = useTranslations("Common");

  return (
    <span className="font-extrabold tracking-tight text-fg">
      {t("appName")}
    </span>
  );
};

export default AppName;
