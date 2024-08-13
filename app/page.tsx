import AppName from "@/components/logo/AppName";
import Logo from "@/components/logo/Logo";
import LinkButton from "@/components/ui/button/LinkButton";

const Home = () => {
  return (
    <div className="w-screen h-screen flex flex-col justify-center items-center">
      <Logo size="medium" />
      <p className="w-[90%] text-center text-base-content my-5 max-w-[700px]">
        Unlock the power of instant assistance with <AppName />, your friendly
        AI chatbot designed to streamline your tasks and boost productivity.
        Whether you need quick answers, assistance with tasks, or just a
        friendly chat, <AppName /> is here to help 24/7
      </p>
      <LinkButton
        href="/auth/register"
        size="medium"
        text="Chat Now"
        theme="primary"
      />
    </div>
  );
};

export default Home;
