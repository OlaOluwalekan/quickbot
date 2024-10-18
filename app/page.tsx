import AppName from "@/components/logo/AppName";
import Logo from "@/components/logo/Logo";
import LinkButton from "@/components/ui/button/LinkButton";
import TypingText from "@/components/ui/text/TypingText";
import { typingTextHeroData } from "@/data/typintText";
import { Inter, Irish_Grover } from "next/font/google";

const irish = Irish_Grover({ subsets: ["latin"], weight: "400" });
const inter = Inter({ subsets: ["latin"], weight: "400" });

const Home = () => {
  return (
    <div className="w-screen h-screen flex flex-col justify-center items-center">
      <div></div>
      <div className="flex w-[90%] flex-col md:flex-row justify-center items-center gap-3">
        <div className="flex flex-col justify-center items-center md:items-start">
          <TypingText
            texts={typingTextHeroData}
            mainStyleClass={`font-semibold inline text-4xl ${irish.className}`}
            cursorStyleClass={`inline text-3xl ${inter.className}`}
          />
          <p className="w-[90%] text-center text-base-content my-5 max-w-[700px] md:text-start">
            Unlock the power of instant assistance with <AppName />, your
            friendly AI chatbot designed to streamline your tasks and boost
            productivity.
          </p>
          <LinkButton
            href="/auth/register"
            size="medium"
            text="Chat Now"
            theme="primary"
          />
        </div>
        <div className="md:hidden">
          <Logo size="medium" />
        </div>
        <div className="hidden md:flex">
          <Logo size="large" />
        </div>
      </div>
    </div>
  );
};

export default Home;
