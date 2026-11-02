import { useTranslations } from "next-intl";

const AppName = () => {
  const t = useTranslations("Common");

  return (
    <span className="sr-only">
      {t("appName")}
    </span>
  );
};

export default AppName;
