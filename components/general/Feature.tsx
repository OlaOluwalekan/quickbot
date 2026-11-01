import { FeatureProps } from "@/types/general";

const Feature = ({ icon, title, text }: FeatureProps) => {
  return (
    <div className="group rounded-2xl border border-border bg-surface/80 backdrop-blur-md p-6 shadow-xs hover:shadow-md hover:border-border-strong transition-all duration-300 flex flex-col gap-3">
      <div className="w-11 h-11 rounded-xl bg-accent-soft border border-border text-accent flex items-center justify-center text-xl group-hover:scale-105 transition-transform">
        {icon}
      </div>
      <h3 className="text-lg font-bold text-fg tracking-tight">
        {title}
      </h3>
      <p className="text-sm text-muted leading-relaxed">
        {text}
      </p>
    </div>
  );
};

export default Feature;
