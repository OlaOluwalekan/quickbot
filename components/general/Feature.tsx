import { FeatureProps } from "@/types/general";

const Feature = ({ icon, title, text }: FeatureProps) => {
  return (
    <div className="group rounded-2xl border border-slate-200/80 dark:border-slate-800/90 bg-white/80 dark:bg-slate-900/70 backdrop-blur-md p-6 shadow-xs hover:shadow-xl hover:shadow-indigo-500/5 hover:border-indigo-500/40 transition-all duration-300 flex flex-col gap-3">
      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500/15 to-sky-500/15 border border-indigo-500/25 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xl group-hover:scale-105 transition-transform">
        {icon}
      </div>
      <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
        {title}
      </h3>
      <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
        {text}
      </p>
    </div>
  );
};

export default Feature;
