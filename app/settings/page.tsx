import { auth } from "@/auth";
import Logout from "@/components/auth/Logout";
import NameAndEmail from "@/components/settings/NameAndEmail";
import SettingsCard from "@/components/settings/SettingsCard";
import TokensDisplay from "@/components/settings/TokensDisplay";
import UserProfileImage from "@/components/settings/UserProfileImage";
import LinkButton from "@/components/ui/button/LinkButton";
import { SessionProps } from "@/types/user";

const SettingsPage = async () => {
  const session = await auth();
  // console.log("USER:", session?.user);

  return (
    <div className="flex justify-center items-center h-screen">
      <SettingsCard>
        <div className="w-full flex flex-col md:flex-row md:justify-start md:items-center">
          <div className="flex flex-col justify-center items-center">
            <UserProfileImage user={session?.user as SessionProps} />
            <NameAndEmail user={session?.user as SessionProps} />
          </div>
          <div className="divider md:divider-horizontal"></div>
          <div>
            <TokensDisplay user={session?.user as SessionProps} />
          </div>
        </div>
        <article className="w-full flex justify-end mt-3 gap-2">
          <LinkButton
            href="/chat"
            size="medium"
            theme="primary"
            text="Go to Chat"
          />
          <Logout styleClass="w-fit px-5 py-3 bg-error/30 text-error hover:bg-error hover:text-white" />
        </article>
      </SettingsCard>
    </div>
  );
};

export default SettingsPage;
