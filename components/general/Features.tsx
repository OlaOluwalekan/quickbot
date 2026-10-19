"use client";

import {
  FaBolt,
  FaChartPie,
  FaCode,
  FaImage,
  FaMagnifyingGlass,
  FaNetworkWired,
} from "react-icons/fa6";
import Feature from "./Feature";
import { useTranslations } from "next-intl";

const Features = () => {
  const t = useTranslations("Landing");

  const features = [
    {
      id: "1",
      icon: <FaBolt />,
      title: t("feature1Title"),
      text: t("feature1Desc"),
    },
    {
      id: "2",
      icon: <FaImage />,
      title: t("feature2Title"),
      text: t("feature2Desc"),
    },
    {
      id: "3",
      icon: <FaNetworkWired />,
      title: t("feature3Title"),
      text: t("feature3Desc"),
    },
    {
      id: "4",
      icon: <FaMagnifyingGlass />,
      title: t("feature4Title"),
      text: t("feature4Desc"),
    },
    {
      id: "5",
      icon: <FaCode />,
      title: t("feature5Title"),
      text: t("feature5Desc"),
    },
    {
      id: "6",
      icon: <FaChartPie />,
      title: t("feature6Title"),
      text: t("feature6Desc"),
    },
  ];

  return (
    <section id="features" className="py-14 sm:py-20 w-full">
      <div className="text-center max-w-2xl mx-auto mb-12">
        <span className="text-xs font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
          {t("featuresBadge")}
        </span>
        <h2 className="mt-2 text-2xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">
          {t("featuresHeading")}
        </h2>
        <p className="mt-3 text-sm sm:text-base text-slate-600 dark:text-slate-400">
          {t("featuresSubheading")}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {features.map((feature) => (
          <Feature key={feature.id} {...feature} />
        ))}
      </div>
    </section>
  );
};

export default Features;
